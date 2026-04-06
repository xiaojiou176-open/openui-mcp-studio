import path from "node:path";
import { readJsonFile, toPosixPath } from "./governance-utils.mjs";

const DEFAULT_REGISTRY_PATH = "contracts/runtime/path-registry.json";

async function readRuntimePathRegistry(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const registryPath = path.resolve(
		rootDir,
		options.registryPath ?? DEFAULT_REGISTRY_PATH,
	);
	const registry = await readJsonFile(registryPath);
	return { rootDir, registryPath, registry };
}

function listCategoryPaths(registry, categoryId) {
	return Array.isArray(registry?.categories?.[categoryId]?.paths)
		? registry.categories[categoryId].paths.map(String)
		: [];
}

function listAllRegistryPaths(registry) {
	return Object.values(registry?.categories ?? {})
		.flatMap((entry) => (Array.isArray(entry?.paths) ? entry.paths : []))
		.map(String);
}

function listAllowedRuntimeTopLevelDirectories(registry) {
	const runtimeSurface = String(registry?.runtimeSurface ?? ".runtime-cache");
	const runtimePrefix = `${runtimeSurface}/`;
	const topLevelDirectories = new Set();
	for (const relativePath of listAllRegistryPaths(registry)) {
		if (!relativePath.startsWith(runtimePrefix)) {
			continue;
		}
		const relativeToRuntime = relativePath.slice(runtimePrefix.length);
		const topLevelDirectory = relativeToRuntime.split("/")[0]?.trim();
		if (topLevelDirectory) {
			topLevelDirectories.add(topLevelDirectory);
		}
	}
	return [...topLevelDirectories].sort();
}

function listCleanPolicyPaths(registry, key) {
	return Array.isArray(registry?.cleanPolicy?.[key])
		? registry.cleanPolicy[key].map(String)
		: [];
}

function normalizeRegistryRelativePath(value) {
	return toPosixPath(String(value ?? "").trim());
}

function findRuntimeCategoryForPath(registry, relativePath) {
	const candidate = normalizeRegistryRelativePath(relativePath);
	let bestMatch = null;
	for (const [categoryId, entry] of Object.entries(registry?.categories ?? {})) {
		for (const rawPath of Array.isArray(entry?.paths) ? entry.paths : []) {
			const registeredPath = normalizeRegistryRelativePath(rawPath);
			if (!registeredPath) {
				continue;
			}
			if (
				candidate === registeredPath ||
				candidate.startsWith(`${registeredPath}/`)
			) {
				if (!bestMatch || registeredPath.length > bestMatch.registeredPath.length) {
					bestMatch = {
						categoryId,
						entry,
						registeredPath,
					};
				}
			}
		}
	}
	return bestMatch;
}

export {
	DEFAULT_REGISTRY_PATH,
	findRuntimeCategoryForPath,
	listAllRegistryPaths,
	listAllowedRuntimeTopLevelDirectories,
	listCategoryPaths,
	listCleanPolicyPaths,
	normalizeRegistryRelativePath,
	readRuntimePathRegistry,
};
