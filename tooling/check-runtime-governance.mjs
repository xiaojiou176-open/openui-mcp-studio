import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathExists, toPosixPath } from "./shared/governance-utils.mjs";
import {
	listAllowedRuntimeTopLevelDirectories,
	listAllRegistryPaths,
	readRuntimePathRegistry,
} from "./shared/runtime-path-registry.mjs";

async function directoryContainsFiles(dirPath) {
	let entries;
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return false;
	}

	for (const entry of entries) {
		const absolutePath = path.join(dirPath, entry.name);
		if (entry.isFile()) {
			return true;
		}
		if (entry.isDirectory() && (await directoryContainsFiles(absolutePath))) {
			return true;
		}
	}
	return false;
}

async function runRuntimeGovernanceCheck(options = {}) {
	const { rootDir, registryPath, registry } = await readRuntimePathRegistry(options);
	const errors = [];
	const runtimeSurface = path.resolve(
		rootDir,
		String(registry.runtimeSurface ?? ".runtime-cache"),
	);

	for (const forbiddenTopLevelDir of registry.forbiddenTopLevelDirectories ?? []) {
		const absolutePath = path.resolve(rootDir, forbiddenTopLevelDir);
		if (!(await pathExists(absolutePath))) {
			continue;
		}
		if (await directoryContainsFiles(absolutePath)) {
			errors.push(`forbidden top-level runtime directory still contains files: ${forbiddenTopLevelDir}`);
		}
	}

	for (const forbiddenRepoRuntimeDir of registry.forbiddenRepoRuntimeDirectories ?? []) {
		const absolutePath = path.resolve(rootDir, forbiddenRepoRuntimeDir);
		if (!(await pathExists(absolutePath))) {
			continue;
		}
		if (await directoryContainsFiles(absolutePath)) {
			errors.push(`forbidden repo runtime directory still contains files: ${forbiddenRepoRuntimeDir}`);
		}
	}

	let runtimeEntries = [];
	try {
		runtimeEntries = await fs.readdir(runtimeSurface, { withFileTypes: true });
	} catch (error) {
		if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
			throw error;
		}
	}
	const allowedRuntimeTopLevels = new Set(
		listAllowedRuntimeTopLevelDirectories(registry),
	);
	const allowedReportSubtrees = new Set(
		listAllRegistryPaths(registry)
			.filter((relativePath) => relativePath.startsWith(".runtime-cache/reports/"))
			.map((relativePath) => relativePath.split("/").slice(0, 4).join("/")),
	);
	for (const entry of runtimeEntries) {
		if (!entry.isDirectory()) {
			continue;
		}
		if (allowedRuntimeTopLevels.has(entry.name)) {
			continue;
		}
		const absolutePath = path.join(runtimeSurface, entry.name);
		if (await directoryContainsFiles(absolutePath)) {
			errors.push(
				`unregistered runtime subtree still contains files: ${path.posix.join(String(registry.runtimeSurface ?? ".runtime-cache"), entry.name)}`,
			);
		}
	}

	const reportsRoot = path.join(runtimeSurface, "reports");
	let reportEntries = [];
	try {
		reportEntries = await fs.readdir(reportsRoot, { withFileTypes: true });
	} catch (error) {
		if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
			throw error;
		}
	}
	for (const entry of reportEntries) {
		if (!entry.isDirectory()) {
			continue;
		}
		const relativePath = path.posix.join(
			String(registry.runtimeSurface ?? ".runtime-cache"),
			"reports",
			entry.name,
		);
		if (allowedReportSubtrees.has(relativePath)) {
			continue;
		}
		const absolutePath = path.join(reportsRoot, entry.name);
		if (await directoryContainsFiles(absolutePath)) {
			errors.push(`unregistered runtime report subtree still contains files: ${relativePath}`);
		}
	}

	for (const expectation of registry.pathExpectations ?? []) {
		const filePath = path.resolve(rootDir, expectation.path);
		const content = await fs.readFile(filePath, "utf8");
		for (const snippet of expectation.mustInclude ?? []) {
			if (!content.includes(snippet)) {
				errors.push(`${expectation.path} is missing required runtime path ${snippet}`);
			}
		}
		for (const snippet of expectation.mustExclude ?? []) {
			if (content.includes(snippet)) {
				errors.push(`${expectation.path} still references forbidden runtime path ${snippet}`);
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
		const result = await runRuntimeGovernanceCheck();
		if (!result.ok) {
			console.error("[runtime-governance] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[runtime-governance] OK (${result.registryPath})`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[runtime-governance] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runRuntimeGovernanceCheck };
