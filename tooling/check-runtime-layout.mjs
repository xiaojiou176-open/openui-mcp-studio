import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_RUN_LAYOUT_PATH = "contracts/runtime/run-layout.json";
const REQUIRED_SNIPPETS_BY_FILE = {
	"tooling/ci-gate.mjs": [".runtime-cache/runs", "summary.json", "quality-score.json"],
	"tooling/ci-gate/summary-file.mjs": [".runtime-cache/runs", "summary.json"],
	"tooling/quality-score.mjs": [".runtime-cache/runs", "quality-score.json"],
	"tooling/evidence-index.mjs": [
		".runtime-cache/runs",
		"summaryPath",
		"qualityScorePath",
		"evidence/index.json",
	],
	"tooling/check-evidence-governance.mjs": [".runtime-cache/runs", "quality score file"],
	"services/mcp-server/src/logger.ts": [".runtime-cache/runs", "runtime.jsonl"],
};

async function runRuntimeLayoutCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_RUN_LAYOUT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const errors = [];

	for (const requiredField of [
		"runtimeRoot",
		"runsRoot",
		"requiredRunFiles",
		"requiredRunDirectories",
		"requiredLogFiles",
	]) {
		if (!(requiredField in contract)) {
			errors.push(`run layout contract is missing field "${requiredField}"`);
		}
	}

	for (const [filePath, requiredSnippets] of Object.entries(
		REQUIRED_SNIPPETS_BY_FILE,
	)) {
		const content = await fs.readFile(path.resolve(rootDir, filePath), "utf8");
		for (const snippet of requiredSnippets) {
			if (!content.includes(snippet)) {
				errors.push(`${filePath} must include run-layout snippet "${snippet}"`);
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		errors,
	};
}

async function main() {
	try {
		const result = await runRuntimeLayoutCheck();
		if (!result.ok) {
			console.error("[runtime-layout] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[runtime-layout] OK (${result.contractPath})`);
	} catch (error) {
		console.error(`[runtime-layout] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runRuntimeLayoutCheck };
