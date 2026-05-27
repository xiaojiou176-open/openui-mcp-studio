import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_ALLOWLIST_PATH = "contracts/governance/root-allowlist.json";

async function isContainerExecution() {
	try {
		await fs.access("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}

async function runRootPristineCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const allowlistPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_ALLOWLIST_PATH,
	);
	const allowlist = await readJsonFile(allowlistPath);
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const errors = [];
	const containerExecution =
		typeof options.containerExecution === "boolean"
			? options.containerExecution
			: await isContainerExecution();

	if (String(allowlist.mode ?? "") !== "authoritative-only") {
		errors.push("root allowlist must be authoritative-only");
	}

	const machineManagedInstallSurface = new Set(
		(allowlist.machineManagedInstallSurface ?? []).map(String),
	);
	const containerOnlyInstallSurface = new Set(
		(allowlist.containerOnlyInstallSurface ?? []).map(String),
	);

	const forbiddenPresent = [
		"coverage",
		"dist",
		"build",
		"playwright-report",
		"htmlcov",
		"tmp",
	];
	const nodeModulesAllowed =
		machineManagedInstallSurface.has("node_modules") ||
		(containerExecution && containerOnlyInstallSurface.has("node_modules"));
	if (!nodeModulesAllowed) {
		forbiddenPresent.unshift("node_modules");
	}
	for (const forbidden of forbiddenPresent) {
		if (entries.some((entry) => entry.name === forbidden)) {
			errors.push(`forbidden root entry exists: ${forbidden}`);
		}
	}

	for (const forbiddenFile of [".coverage"]) {
		if (entries.some((entry) => entry.name === forbiddenFile)) {
			errors.push(`forbidden root file exists: ${forbiddenFile}`);
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		errors,
	};
}

async function main() {
	try {
		const result = await runRootPristineCheck();
		if (!result.ok) {
			console.error("[root-pristine] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[root-pristine] OK (allowlisted root hygiene)");
	} catch (error) {
		console.error(`[root-pristine] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runRootPristineCheck };
