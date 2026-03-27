import path from "node:path";
import { readJsonFile } from "./governance-utils.mjs";

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

export {
	DEFAULT_REGISTRY_PATH,
	listAllRegistryPaths,
	listAllowedRuntimeTopLevelDirectories,
	listCategoryPaths,
	listCleanPolicyPaths,
	readRuntimePathRegistry,
};
