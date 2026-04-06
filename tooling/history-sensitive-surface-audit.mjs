#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	loadSensitiveSurfaceContract,
	scanLineForSensitiveFindings,
} from "./sensitive-surface-audit.mjs";

const MACOS_USER_PREFIX = ["/", "Users", "/"].join("");
const LINUX_HOME_PREFIX = ["/", "home", "/"].join("");
const MACOS_PRIVATE_VAR_PREFIX = ["/", "private", "/", "var", "/"].join("");
const MACOS_VAR_FOLDERS_PREFIX = ["/", "var", "/", "folders", "/"].join("");
const WINDOWS_USERS_SEGMENT = ["\\", "Users", "\\"].join("");

const SEARCH_SEEDS = [
	"@",
	MACOS_USER_PREFIX,
	LINUX_HOME_PREFIX,
	MACOS_PRIVATE_VAR_PREFIX,
	MACOS_VAR_FOLDERS_PREFIX,
	WINDOWS_USERS_SEGMENT,
	"phone",
	"mobile",
	"telephone",
	"tel",
	"contact",
	"sms",
	"whatsapp",
];

function readGitStdout(rootDir, args) {
	try {
		return execFileSync("git", args, {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		const failed = error;
		if (failed && typeof failed.status === "number" && failed.status === 1) {
			return "";
		}
		throw error;
	}
}

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function summarizeByDetector(findings) {
	return findings.reduce((accumulator, finding) => {
		accumulator[finding.detectorId] = (accumulator[finding.detectorId] ?? 0) + 1;
		return accumulator;
	}, {});
}

function listHistoryRefs(rootDir) {
	return readGitStdout(rootDir, [
		"for-each-ref",
		"--format=%(refname)",
		"refs/heads",
		"refs/tags",
	])
		.split("\n")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function listHistoryCommits(rootDir, refs) {
	if (refs.length === 0) {
		return [];
	}
	return readGitStdout(rootDir, ["rev-list", "--topo-order", "--reverse", ...refs])
		.split("\n")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseGitGrepLine(line) {
	const match = line.match(/^([0-9a-f]{40}):([^:]+):(\d+):(.*)$/u);
	if (!match) {
		return null;
	}
	return {
		commit: match[1],
		file: match[2],
		lineNumber: Number(match[3]),
		text: match[4],
	};
}

async function runHistorySensitiveSurfaceAudit(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contract = await loadSensitiveSurfaceContract(
		rootDir,
		options.contractPath,
	);
	const contractRelativePath = toPosixPath(
		path.relative(rootDir, contract.contractPath),
	);
	const refs = Array.isArray(options.refs) ? options.refs : listHistoryRefs(rootDir);
	const commits = Array.isArray(options.commits)
		? options.commits
		: listHistoryCommits(rootDir, refs);
	const findings = [];

	for (const commit of commits) {
		const output = readGitStdout(rootDir, [
			"grep",
			"-F",
			"-n",
			"-I",
			"--no-color",
			...SEARCH_SEEDS.flatMap((seed) => ["-e", seed]),
			commit,
			"--",
			".",
		]);
		for (const rawLine of output.split("\n")) {
			const parsed = parseGitGrepLine(rawLine.trim());
			if (!parsed) {
				continue;
			}
			const normalizedPath = toPosixPath(parsed.file);
			if (normalizedPath === contractRelativePath) {
				continue;
			}
			if (
				contract.ignoredPathRegexes.some((pattern) => pattern.test(normalizedPath))
			) {
				continue;
			}
			const lineFindings = scanLineForSensitiveFindings({
				line: parsed.text,
				lineNumber: parsed.lineNumber,
				file: normalizedPath,
				allowedEmailDomains: contract.allowedEmailDomains,
				allowedEmailAddresses: contract.allowedEmailAddresses,
				allowedPhoneRegexes: contract.allowedPhoneRegexes,
				allowedHostPathRegexes: contract.allowedHostPathRegexes,
			}).map((finding) => ({
				...finding,
				commit,
			}));
			findings.push(...lineFindings);
		}
	}

	const report = {
		checkedAt: new Date().toISOString(),
		contractPath: toPosixPath(path.relative(rootDir, contract.contractPath)),
		scannedRefCount: refs.length,
		scannedCommitCount: commits.length,
		findingCount: findings.length,
		summaryByDetector: summarizeByDetector(findings),
		findings,
		notes: [
			"Scans only local refs/heads and refs/tags.",
			"Does not inspect GitHub-managed read-only refs such as refs/pull/*.",
			"Use a separate GitHub remote audit when public platform residue matters.",
		],
	};

	await fs.mkdir(path.dirname(contract.historyReportPath), { recursive: true });
	await fs.writeFile(
		contract.historyReportPath,
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);

	return {
		ok: findings.length === 0,
		reportPath: toPosixPath(path.relative(rootDir, contract.historyReportPath)),
		report,
	};
}

async function main() {
	try {
		const result = await runHistorySensitiveSurfaceAudit();
		if (!result.ok) {
			console.error(
				`[history-sensitive-surface-audit] FAILED (${result.reportPath}; findings=${result.report.findingCount})`,
			);
			for (const finding of result.report.findings) {
				console.error(
					`- ${finding.detectorId} ${finding.commit} ${finding.file}:${finding.line} ${finding.redactedMatch}`,
				);
			}
			process.exit(1);
		}
		console.log(
			`[history-sensitive-surface-audit] OK (${result.reportPath}; refs=${result.report.scannedRefCount}; commits=${result.report.scannedCommitCount})`,
		);
	} catch (error) {
		console.error(
			`[history-sensitive-surface-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	void main();
}

export { runHistorySensitiveSurfaceAudit };
