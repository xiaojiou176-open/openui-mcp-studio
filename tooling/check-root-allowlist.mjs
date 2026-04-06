import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	createGlobMatcher,
	readJsonFile,
	toPosixPath,
} from "./shared/governance-utils.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/root-allowlist.json";

async function isContainerExecution() {
	try {
		await fs.access("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}

async function runRootAllowlistCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const mode = String(contract.mode ?? "").trim();
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const forbiddenMatcher = createGlobMatcher(contract.forbiddenPatterns ?? []);
	const containerExecution = await isContainerExecution();
	if (mode !== "authoritative-only") {
		return {
			ok: false,
			rootDir: toPosixPath(rootDir),
			contractPath: toPosixPath(path.relative(rootDir, contractPath)),
			violations: [
				{
					entry: toPosixPath(path.relative(rootDir, contractPath)),
					kind: "contract",
					reason: "mode_must_be_authoritative_only",
				},
			],
		};
	}

	const allowedDirectoryNames = new Set([
		...((contract.trackedDirectories ?? []).map(String)),
		...((contract.machineManagedInstallSurface ?? []).map(String)),
		...((contract.machineManagedRuntimeSurface ?? []).map(String)),
		...((contract.localDevelopmentDirectories ?? []).map(String)),
	]);
	if (containerExecution) {
		for (const entry of contract.containerOnlyInstallSurface ?? []) {
			allowedDirectoryNames.add(String(entry));
		}
	}
	const allowedFileNames = new Set([
		...((contract.trackedFiles ?? []).map(String)),
		...((contract.localDevelopmentFiles ?? []).map(String)),
	]);

	const violations = [];
	for (const entry of entries) {
		if (entry.name === ".git") {
			continue;
		}
		const isDirectory = entry.isDirectory();
		const allowed = isDirectory
			? allowedDirectoryNames.has(entry.name)
			: allowedFileNames.has(entry.name);

		if (allowed) {
			continue;
		}
		if (forbiddenMatcher(entry.name)) {
			violations.push({
				entry: entry.name,
				kind: isDirectory ? "directory" : "file",
				reason: "forbidden_pattern",
			});
			continue;
		}
		violations.push({
			entry: entry.name,
			kind: isDirectory ? "directory" : "file",
			reason: "not_allowlisted",
		});
	}

	return {
		ok: violations.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		violations,
	};
}

async function main() {
	try {
		const result = await runRootAllowlistCheck();
		if (!result.ok) {
			globalThis.console.error("[root-allowlist] FAILED");
			for (const violation of result.violations) {
				globalThis.console.error(
					`- ${violation.kind}:${violation.entry}:${violation.reason}`,
				);
			}
			process.exit(1);
		}
		globalThis.console.log(
			`[root-allowlist] OK (${result.contractPath})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[root-allowlist] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runRootAllowlistCheck };
