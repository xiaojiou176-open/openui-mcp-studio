import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";
import { describeRunSurfaceState, resolveRunLayout } from "./shared/run-layout.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/evidence-schema.json";
// Governance verifies .runtime-cache/runs/<run_id>/summary.json + quality-score.json + evidence/index.json as one bundle.

function parseCliArgs(argv = process.argv.slice(2)) {
	return {
		strictAuthoritativeRuns: argv.includes("--strict-authoritative-runs"),
	};
}

async function runEvidenceGovernanceCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	let layout;
	try {
		layout = await resolveRunLayout({
			...options,
			preferLatestExistingRun: options.runId === undefined,
			requiredRunFiles: [
				"summary.json",
				"quality-score.json",
				"meta/run.json",
				"evidence/index.json",
			],
			requireAuthoritativeManifest: options.runId === undefined,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("No authoritative run id is available")
		) {
			const runSurface = await describeRunSurfaceState(options);
			if (runSurface.state === "absent" || runSurface.state === "empty") {
				if (options.allowNoAuthoritativeRuns === false) {
					return {
						ok: false,
						rootDir: toPosixPath(rootDir),
						contractPath: toPosixPath(path.relative(rootDir, contractPath)),
						summaryPath: null,
						evidenceIndexPath: null,
						errors: [
							"No authoritative runs are present. Readiness-oriented evidence checks require at least one authoritative run bundle.",
						],
						reason: "no_authoritative_runs_present",
					};
				}
				return {
					ok: true,
					rootDir: toPosixPath(rootDir),
					contractPath: toPosixPath(path.relative(rootDir, contractPath)),
					summaryPath: null,
					evidenceIndexPath: null,
					errors: [],
					reason: "no_authoritative_runs_present",
				};
			}
		}
		throw error;
	}
	const summaryPath = path.resolve(
		rootDir,
		options.summaryPath ?? layout.summaryPathRelative,
	);
	const errors = [];

	let summary;
	try {
		summary = await readJsonFile(summaryPath);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			errors.push(
				`authoritative summary is missing for run ${layout.runId} at ${path.relative(rootDir, summaryPath)}`,
			);
			summary = null;
		} else {
			throw error;
		}
	}

	if (summary) {
		for (const field of contract.requiredSummaryFields ?? []) {
			if (!(field in summary)) {
				errors.push(`summary is missing required field "${field}"`);
			}
		}
		if (String(summary.runId ?? "") !== layout.runId) {
			errors.push(
				`summary runId ${JSON.stringify(summary.runId)} does not match authoritative run ${layout.runId}`,
			);
		}
	}

	const runId = String(summary?.runId ?? layout.runId).trim();
	if (!runId) {
		errors.push('summary field "runId" must be a non-empty string');
	}

	const evidenceIndexPath = path.resolve(rootDir, layout.evidenceIndexPathRelative);
	let evidenceIndex = null;
	try {
		evidenceIndex = await readJsonFile(evidenceIndexPath);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			errors.push(
				`evidence index is missing for runId ${runId} at ${path.relative(rootDir, evidenceIndexPath)}`,
			);
		} else {
			throw error;
		}
	}

	const runManifestPath = path.resolve(rootDir, layout.runManifestPathRelative);
	let runManifest = null;
	try {
		runManifest = await readJsonFile(runManifestPath);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			errors.push(
				`run manifest is missing for runId ${runId} at ${path.relative(rootDir, runManifestPath)}`,
			);
		} else {
			throw error;
		}
	}

	if (runManifest) {
		if (String(runManifest.runId ?? "") !== runId) {
			errors.push(`run manifest runId ${JSON.stringify(runManifest.runId)} does not match ${runId}`);
		}
		if (runManifest.authoritative !== true) {
			errors.push(`run manifest must declare authoritative=true for runId ${runId}`);
		}
	}

	if (evidenceIndex) {
		for (const field of contract.requiredEvidenceIndexFields ?? []) {
			if (!(field in evidenceIndex)) {
				errors.push(`evidence index is missing required field "${field}"`);
			}
		}
		for (const field of contract.requiredClassificationFields ?? []) {
			if (!(field in (evidenceIndex.classification ?? {}))) {
				errors.push(`classification is missing required field "${field}"`);
			}
		}
		const stageResults = Array.isArray(evidenceIndex.stageResults)
			? evidenceIndex.stageResults
			: [];
		for (const [index, stageResult] of stageResults.entries()) {
			for (const field of contract.requiredStageResultFields ?? []) {
				if (!(field in stageResult)) {
					errors.push(
						`stageResults[${index}] is missing required field "${field}"`,
					);
				}
			}
		}
		if (String(evidenceIndex.runManifestPath ?? "") !== layout.runManifestPathRelative) {
			errors.push(`evidence index runManifestPath must equal ${layout.runManifestPathRelative}`);
		}
		try {
			await readJsonFile(path.resolve(rootDir, evidenceIndex.qualityScorePath));
		} catch {
			errors.push(
				`quality score file is missing for runId ${runId} at ${String(
					evidenceIndex.qualityScorePath,
				)}`,
			);
		}
		const requiredLogPaths = (layout.contract.requiredLogFiles ?? []).map((relativePath) =>
			path.posix.join(layout.runRootRelative, String(relativePath)),
		);
		for (const requiredLogPath of requiredLogPaths) {
			if (!(Array.isArray(evidenceIndex.logPaths) ? evidenceIndex.logPaths : []).includes(requiredLogPath)) {
				errors.push(`evidence index is missing required log path "${requiredLogPath}"`);
			}
		}
		for (const logPath of Array.isArray(evidenceIndex.logPaths) ? evidenceIndex.logPaths : []) {
			try {
				const raw = await fs.readFile(path.resolve(rootDir, logPath), "utf8");
				for (const [lineIndex, line] of raw.split(/\r?\n/u).entries()) {
					if (!line.trim()) {
						continue;
					}
					const payload = JSON.parse(line);
					if (String(payload.runId ?? "") !== runId) {
						errors.push(
							`${logPath}:${lineIndex + 1} runId ${JSON.stringify(
								payload.runId,
							)} does not match evidence run ${runId}`,
						);
					}
				}
			} catch {
				errors.push(`missing or unreadable log file referenced by evidence index: ${logPath}`);
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		summaryPath: toPosixPath(path.relative(rootDir, summaryPath)),
		evidenceIndexPath: toPosixPath(path.relative(rootDir, evidenceIndexPath)),
		errors,
	};
}

async function main() {
	try {
		const args = parseCliArgs();
		const result = await runEvidenceGovernanceCheck({
			allowNoAuthoritativeRuns: !args.strictAuthoritativeRuns,
		});
		if (!result.ok) {
			globalThis.console.error("[evidence-governance] FAILED");
			for (const error of result.errors) {
				globalThis.console.error(`- ${error}`);
			}
			process.exit(1);
		}
		globalThis.console.log(
			result.evidenceIndexPath
				? `[evidence-governance] OK (${result.evidenceIndexPath})`
				: "[evidence-governance] OK (no authoritative runs present)",
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[evidence-governance] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runEvidenceGovernanceCheck };
