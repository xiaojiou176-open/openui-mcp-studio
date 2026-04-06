import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/module-topology.json";

async function runTopologyCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const errors = [];

	for (const topLevel of contract.rootResponsibilities ?? []) {
		const targetPath = path.resolve(rootDir, String(topLevel));
		try {
			await fs.access(targetPath);
		} catch {
			errors.push(`missing required root responsibility path "${topLevel}"`);
		}
	}

	for (const moduleEntry of contract.modules ?? []) {
		const modulePath = String(moduleEntry.path ?? "").trim();
		const readmePath = String(moduleEntry.readme ?? "").trim();
		if (!modulePath) {
			errors.push("module-topology contains module without path");
			continue;
		}
		try {
			await fs.access(path.resolve(rootDir, modulePath));
		} catch {
			errors.push(`missing module path "${modulePath}"`);
		}
		if (!readmePath) {
			errors.push(`module "${modulePath}" must declare readme`);
			continue;
		}
		try {
			await fs.access(path.resolve(rootDir, readmePath));
		} catch {
			errors.push(`missing module readme "${readmePath}"`);
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
		const result = await runTopologyCheck();
		if (!result.ok) {
			console.error("[topology] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[topology] OK (${result.contractPath})`);
	} catch (error) {
		console.error(`[topology] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runTopologyCheck };
