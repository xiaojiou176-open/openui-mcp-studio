import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_REGISTRY_PATH = "contracts/runtime/path-registry.json";

async function runCacheLifecycleCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const registryPath = path.resolve(
		rootDir,
		options.registryPath ?? DEFAULT_REGISTRY_PATH,
	);
	const registry = await readJsonFile(registryPath);
	const errors = [];
	const categoryPaths = new Set();

	for (const [categoryId, entry] of Object.entries(registry.categories ?? {})) {
		for (const field of [
			"owner",
			"schema",
			"ttlDays",
			"cleanMode",
			"rebuildStrategy",
			"cleanupClass",
			"maintenanceMinAgeHours",
			"retainLatestCount",
		]) {
			if (!(field in entry)) {
				errors.push(`runtime category "${categoryId}" is missing lifecycle field "${field}"`);
			}
		}
		if (!Array.isArray(entry.paths) || entry.paths.length === 0) {
			errors.push(`runtime category "${categoryId}" must declare at least one path`);
			continue;
		}
		for (const value of entry.paths) {
			const normalized = String(value ?? "").trim();
			if (!normalized) {
				errors.push(`runtime category "${categoryId}" contains an empty path entry`);
				continue;
			}
			categoryPaths.add(normalized);
		}
	}
	for (const policyField of ["resetOnClean", "purgeOnClean", "retentionOnly"]) {
		for (const value of registry.cleanPolicy?.[policyField] ?? []) {
			const normalized = String(value ?? "").trim();
			if (!normalized) {
				errors.push(`cleanPolicy.${policyField} contains an empty path entry`);
				continue;
			}
			if (!categoryPaths.has(normalized)) {
				errors.push(
					`cleanPolicy.${policyField} references path outside registered runtime categories: ${normalized}`,
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		registryPath: toPosixPath(path.relative(rootDir, registryPath)),
		errors,
	};
}

async function main() {
	try {
		const result = await runCacheLifecycleCheck();
		if (!result.ok) {
			console.error("[cache-lifecycle] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[cache-lifecycle] OK (${result.registryPath})`);
	} catch (error) {
		console.error(`[cache-lifecycle] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runCacheLifecycleCheck };
