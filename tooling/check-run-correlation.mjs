import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";
import { describeRunSurfaceState, resolveRunLayout } from "./shared/run-layout.mjs";

function parseCliArgs(argv = process.argv.slice(2)) {
	return {
		strictAuthoritativeRuns: argv.includes("--strict-authoritative-runs"),
	};
}

async function collectJsonlFiles(logPaths, rootDir) {
	const errors = [];
	for (const relativePath of logPaths) {
		const absolutePath = path.resolve(rootDir, relativePath);
		let raw = "";
		try {
			raw = await fs.readFile(absolutePath, "utf8");
		} catch {
			errors.push(`missing log file referenced by evidence index: ${relativePath}`);
			continue;
		}
		for (const [index, line] of raw.split(/\r?\n/u).entries()) {
			if (!line.trim()) {
				continue;
			}
			try {
				JSON.parse(line);
			} catch (error) {
				errors.push(
					`${relativePath}:${index + 1} contains invalid JSONL (${error instanceof Error ? error.message : String(error)})`,
				);
			}
		}
	}
	return errors;
}

async function runRunCorrelationCheck(options = {}) {
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
						rootDir: toPosixPath(runSurface.rootDir),
						errors: [
							"No authoritative runs are present. Readiness-oriented run correlation checks require at least one authoritative run bundle.",
						],
						reason: "no_authoritative_runs_present",
					};
				}
				return {
					ok: true,
					rootDir: toPosixPath(runSurface.rootDir),
					errors: [],
					reason: "no_authoritative_runs_present",
				};
			}
		}
		throw error;
	}
	const {
		rootDir,
		runId,
		contract,
		runManifestPathRelative,
		summaryPathRelative,
		evidenceIndexPathRelative,
		qualityScorePathRelative,
	} = layout;
	const errors = [];
	const summary = await readJsonFile(path.resolve(rootDir, summaryPathRelative));
	const evidenceIndex = await readJsonFile(path.resolve(rootDir, evidenceIndexPathRelative));
	const runManifest = await readJsonFile(path.resolve(rootDir, runManifestPathRelative));

	if (String(summary.runId ?? "") !== runId) {
		errors.push(`summary runId ${JSON.stringify(summary.runId)} does not match run directory ${runId}`);
	}
	if (String(evidenceIndex.runId ?? "") !== runId) {
		errors.push(`evidence index runId ${JSON.stringify(evidenceIndex.runId)} does not match run directory ${runId}`);
	}
	if (String(runManifest.runId ?? "") !== runId) {
		errors.push(`run manifest runId ${JSON.stringify(runManifest.runId)} does not match run directory ${runId}`);
	}
	if (runManifest.authoritative !== true) {
		errors.push(`run manifest must declare authoritative=true for run ${runId}`);
	}
	if (String(evidenceIndex.summaryPath ?? "") !== summaryPathRelative) {
		errors.push(`evidence index summaryPath must equal ${summaryPathRelative}`);
	}
	if (String(evidenceIndex.qualityScorePath ?? "") !== qualityScorePathRelative) {
		errors.push(`evidence index qualityScorePath must equal ${qualityScorePathRelative}`);
	}
	if (String(evidenceIndex.runManifestPath ?? "") !== runManifestPathRelative) {
		errors.push(`evidence index runManifestPath must equal ${runManifestPathRelative}`);
	}
	try {
		await fs.access(path.resolve(rootDir, qualityScorePathRelative));
	} catch {
		errors.push(`missing quality score file ${qualityScorePathRelative}`);
	}
	const requiredLogPaths = (contract.requiredLogFiles ?? []).map((relativePath) =>
		path.posix.join(path.posix.dirname(summaryPathRelative), String(relativePath)),
	);
	for (const requiredLogPath of requiredLogPaths) {
		if (!(Array.isArray(evidenceIndex.logPaths) ? evidenceIndex.logPaths : []).includes(requiredLogPath)) {
			errors.push(`required run-scoped log is missing from evidence index: ${requiredLogPath}`);
		}
	}

	errors.push(
		...(await collectJsonlFiles(
			Array.isArray(evidenceIndex.logPaths) ? evidenceIndex.logPaths : [],
			rootDir,
		)),
	);

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		errors,
	};
}

async function main() {
	try {
		const args = parseCliArgs();
		const result = await runRunCorrelationCheck({
			allowNoAuthoritativeRuns: !args.strictAuthoritativeRuns,
		});
		if (!result.ok) {
			console.error("[run-correlation] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			result.reason === "no_authoritative_runs_present"
				? "[run-correlation] OK (no authoritative runs present)"
				: "[run-correlation] OK",
		);
	} catch (error) {
		console.error(`[run-correlation] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runRunCorrelationCheck };
