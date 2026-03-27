import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/module-topology.json";
const REQUIRED_SNIPPETS = [
	"Responsibility",
	"Out Of Scope",
	"Dependencies",
	"Runtime",
];

async function runModuleReadmeCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const errors = [];

	for (const moduleEntry of contract.modules ?? []) {
		const readmePath = String(moduleEntry.readme ?? "").trim();
		if (!readmePath) {
			errors.push(`module ${moduleEntry.path ?? "<unknown>"} is missing readme declaration`);
			continue;
		}
		let content = "";
		try {
			content = await fs.readFile(path.resolve(rootDir, readmePath), "utf8");
		} catch {
			errors.push(`module readme is missing: ${readmePath}`);
			continue;
		}
		for (const snippet of REQUIRED_SNIPPETS) {
			if (!content.includes(snippet)) {
				errors.push(`${readmePath} must include section or wording "${snippet}"`);
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
		const result = await runModuleReadmeCheck();
		if (!result.ok) {
			console.error("[module-readme] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[module-readme] OK (${result.contractPath})`);
	} catch (error) {
		console.error(`[module-readme] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runModuleReadmeCheck };
