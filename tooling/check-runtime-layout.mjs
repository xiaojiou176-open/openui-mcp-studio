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
	if (typeof contract.runtimeRoot !== "string" || contract.runtimeRoot.trim() === "") {
		errors.push('run layout contract "runtimeRoot" must be a non-empty string');
	}
	if (typeof contract.runsRoot !== "string" || contract.runsRoot.trim() === "") {
		errors.push('run layout contract "runsRoot" must be a non-empty string');
	}
	for (const field of [
		"requiredRunFiles",
		"requiredRunDirectories",
		"requiredLogFiles",
	]) {
		if (!Array.isArray(contract[field]) || contract[field].length === 0) {
			errors.push(`run layout contract "${field}" must be a non-empty array`);
			continue;
		}
		for (const value of contract[field]) {
			if (typeof value !== "string" || value.trim() === "") {
				errors.push(`run layout contract "${field}" contains an empty entry`);
			}
		}
	}

	for (const [filePath, requiredSnippets] of Object.entries(
		REQUIRED_SNIPPETS_BY_FILE,
	)) {
		const absolutePath = path.resolve(rootDir, filePath);
		let content = "";
		try {
			content = await fs.readFile(absolutePath, "utf8");
		} catch (error) {
			const errorCode =
				error && typeof error === "object" && "code" in error
					? error.code
					: undefined;
			if (errorCode === "ENOENT") {
				errors.push(`required runtime-layout source file is missing: ${filePath}`);
				continue;
			}
			errors.push(
				`required runtime-layout source file could not be read: ${filePath}`,
			);
			continue;
		}
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
