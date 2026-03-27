#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const FLAKE_METRICS_SCRIPT_PATH = fileURLToPath(
	new URL("./flake-metrics.mjs", import.meta.url),
);

async function collectSummaryFiles(rootDir) {
	const candidates = [];

	async function walk(currentDir) {
		let entries;
		try {
			entries = await readdir(currentDir, { withFileTypes: true });
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return;
			}
			throw error;
		}

		await Promise.all(
			entries.map(async (entry) => {
				const entryPath = path.join(currentDir, entry.name);
				if (entry.isDirectory()) {
					await walk(entryPath);
					return;
				}
				if (entry.isFile() && entry.name === "summary.json") {
					const fileStat = await stat(entryPath);
					candidates.push({
						path: entryPath,
						mtimeMs: fileStat.mtimeMs,
					});
				}
			}),
		);
	}

	await walk(rootDir);
	return candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

async function findLatestSummaryFile(rootDir = path.resolve(".runtime-cache", "runs")) {
	const summaries = await collectSummaryFiles(rootDir);
	return summaries[0]?.path ?? "";
}

async function runCiFlakeMetrics(options = {}) {
	const summaryPath =
		options.summaryPath ?? (await findLatestSummaryFile(options.rootDir));
	if (!summaryPath) {
		console.log(
			"[flake-metrics] skipped: no ci-gate summary present from an earlier successful hard gate.",
		);
		return 0;
	}

	const result = (options.spawnSync ?? spawnSync)(
		process.execPath,
		[
			FLAKE_METRICS_SCRIPT_PATH,
			`--from-summary=${summaryPath}`,
		],
		{
			stdio: "inherit",
			env: options.env ?? process.env,
		},
	);
	return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const exitCode = await runCiFlakeMetrics();
	process.exit(exitCode);
}

export { findLatestSummaryFile, runCiFlakeMetrics };
