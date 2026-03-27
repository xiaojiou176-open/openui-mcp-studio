import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTRACT_PATH = "tooling/contracts/history-hygiene.contract.json";

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function matchesClassification(classification, finding) {
	if (!isPlainObject(classification) || !isPlainObject(finding)) {
		return false;
	}

	if (readString(classification.ruleId) !== readString(finding.RuleID)) {
		return false;
	}

	const match = isPlainObject(classification.match) ? classification.match : {};
	const file = readString(finding.File);
	if (readString(match.file) && readString(match.file) !== file) {
		return false;
	}

	const fileRegexRaw = readString(match.fileRegex);
	if (fileRegexRaw) {
		const fileRegex = new RegExp(fileRegexRaw, "u");
		if (!fileRegex.test(file)) {
			return false;
		}
	}

	const commit = readString(finding.Commit);
	if (readString(match.commit) && readString(match.commit) !== commit) {
		return false;
	}

	return true;
}

function summarizeByRule(findings) {
	const counts = new Map();
	for (const finding of findings) {
		const ruleId = readString(finding.RuleID);
		counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
	}
	return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function runHistoryHygieneCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const errors = [];

	const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
	if (!isPlainObject(contract)) {
		return {
			ok: false,
			errors: ["history hygiene contract must be an object."],
			contractPath: toPosixPath(contractPath),
		};
	}

	if (Number(contract.version) !== 1) {
		errors.push("history hygiene contract version must equal 1.");
	}

	const reportPathRaw = readString(contract.reportPath);
	if (!reportPathRaw) {
		errors.push("history hygiene contract reportPath must be non-empty.");
	}
	const reportPath = path.resolve(rootDir, reportPathRaw);

	let findings = [];
	try {
		findings = JSON.parse(await fs.readFile(reportPath, "utf8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		errors.push(`failed to read history hygiene report: ${message}`);
		return {
			ok: false,
			errors,
			contractPath: toPosixPath(contractPath),
			reportPath: toPosixPath(reportPath),
		};
	}

	if (!Array.isArray(findings)) {
		errors.push("history hygiene report must be a JSON array.");
	}

	const summaryExpectation = isPlainObject(contract.summaryExpectation)
		? contract.summaryExpectation
		: {};
	const totalFindings = Array.isArray(findings) ? findings.length : 0;
	if (
		Number.isInteger(summaryExpectation.totalFindings) &&
		summaryExpectation.totalFindings !== totalFindings
	) {
		errors.push(
			`history hygiene expected ${summaryExpectation.totalFindings} findings but found ${totalFindings}.`,
		);
	}

	const expectedByRule = isPlainObject(summaryExpectation.byRule)
		? summaryExpectation.byRule
		: {};
	const actualByRule = summarizeByRule(Array.isArray(findings) ? findings : []);
	for (const [ruleId, expectedCount] of Object.entries(expectedByRule)) {
		if (Number(expectedCount) !== Number(actualByRule[ruleId] ?? 0)) {
			errors.push(
				`history hygiene expected ${ruleId}=${expectedCount} but found ${actualByRule[ruleId] ?? 0}.`,
			);
		}
	}

	const classifications = Array.isArray(contract.classifications)
		? contract.classifications
		: [];
	if (classifications.length === 0 && totalFindings > 0) {
		errors.push("history hygiene contract must declare at least one classification.");
	}

	const unmatched = [];
	for (const classification of classifications) {
		if (!isPlainObject(classification)) {
			errors.push("history hygiene classifications must be objects.");
			continue;
		}
		if (!readString(classification.id)) {
			errors.push("history hygiene classification id must be non-empty.");
		}
		if (!readString(classification.summary)) {
			errors.push(
				`history hygiene classification "${readString(classification.id) || "unknown"}" must include a summary.`,
			);
		}
		const evidence = Array.isArray(classification.evidence)
			? classification.evidence.map((entry) => readString(entry)).filter(Boolean)
			: [];
		if (evidence.length === 0) {
			errors.push(
				`history hygiene classification "${readString(classification.id) || "unknown"}" must include evidence.`,
			);
		}
		const expectedCount = Number(classification.expectedCount);
		const matches = Array.isArray(findings)
			? findings.filter((finding) => matchesClassification(classification, finding))
			: [];
		if (!Number.isInteger(expectedCount) || expectedCount <= 0) {
			errors.push(
				`history hygiene classification "${readString(classification.id) || "unknown"}" must have a positive integer expectedCount.`,
			);
		} else if (matches.length !== expectedCount) {
			errors.push(
				`history hygiene classification "${readString(classification.id)}" expected ${expectedCount} findings but matched ${matches.length}.`,
			);
		}
	}

	for (const finding of Array.isArray(findings) ? findings : []) {
		const matched = classifications.some((classification) =>
			matchesClassification(classification, finding),
		);
		if (!matched) {
			unmatched.push(
				`${readString(finding.RuleID)} ${readString(finding.File)} @ ${readString(finding.Commit)}`,
			);
		}
	}
	if (unmatched.length > 0) {
		errors.push(
			`history hygiene report contains ${unmatched.length} unclassified findings.`,
		);
	}

	return {
		ok: errors.length === 0,
		errors,
		contractPath: toPosixPath(contractPath),
		reportPath: toPosixPath(reportPath),
		summary: {
			totalFindings,
			byRule: actualByRule,
			classifiedFindings: totalFindings - unmatched.length,
			unclassifiedFindings: unmatched.length,
		},
	};
}

async function main() {
	try {
		const result = await runHistoryHygieneCheck();
		if (!result.ok) {
			console.error("[history-hygiene] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			`[history-hygiene] OK (${result.contractPath}; findings=${result.summary.totalFindings}; classified=${result.summary.classifiedFindings})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[history-hygiene] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runHistoryHygieneCheck };
