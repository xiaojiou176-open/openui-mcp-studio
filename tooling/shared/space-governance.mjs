import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
	isPathOutsideRoot,
	pathExists,
	readJsonFile,
	toPosixPath,
} from "./governance-utils.mjs";
import {
	findRuntimeCategoryForPath,
	listAllRegistryPaths,
	listAllowedRuntimeTopLevelDirectories,
	readRuntimePathRegistry,
} from "./runtime-path-registry.mjs";
import { resolveToolCacheRoots } from "./tool-cache-env.mjs";

const DEFAULT_SPACE_GOVERNANCE_CONTRACT_PATH =
	"contracts/runtime/space-governance.json";

function formatBytes(bytes) {
	const value = Number(bytes ?? 0);
	if (!Number.isFinite(value) || value <= 0) {
		return "0 B";
	}

	const units = [
		["GiB", 1024 ** 3],
		["MiB", 1024 ** 2],
		["KiB", 1024],
	];
	for (const [label, base] of units) {
		if (value >= base) {
			const digits = value >= 10 * base ? 1 : 2;
			return `${(value / base).toFixed(digits)} ${label}`;
		}
	}
	return `${value} B`;
}

function expandHomePath(filePath, homeDir = os.homedir()) {
	const value = String(filePath ?? "").trim();
	if (value === "~") {
		return homeDir;
	}
	if (value.startsWith("~/")) {
		return path.join(homeDir, value.slice(2));
	}
	return value;
}

function buildReportFileNames(label) {
	const safeLabel = String(label ?? "report").trim() || "report";
	return {
		jsonName: safeLabel === "report" ? "report.json" : `${safeLabel}.json`,
		markdownName:
			safeLabel === "report" ? "report.md" : `${safeLabel}.md`,
	};
}

async function readSpaceGovernanceContract(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_SPACE_GOVERNANCE_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	return { rootDir, contractPath, contract };
}

async function resolveRealPathCandidate(targetPath) {
	const missingSegments = [];
	let currentPath = path.resolve(targetPath);

	while (true) {
		try {
			const resolved = await fs.realpath(currentPath);
			return path.resolve(resolved, ...missingSegments);
		} catch (error) {
			if (!error || error.code !== "ENOENT") {
				throw error;
			}
		}

		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) {
			return targetPath;
		}
		missingSegments.unshift(path.basename(currentPath));
		currentPath = parentPath;
	}
}

async function resolveRepoLocalPath(rootDir, relativePath) {
	const absolutePath = path.resolve(rootDir, relativePath);
	const rootRealPath = await fs.realpath(rootDir);
	const candidateRealPath = await resolveRealPathCandidate(absolutePath);
	if (isPathOutsideRoot(rootRealPath, candidateRealPath)) {
		throw new Error(
			`Repo-local path resolves outside workspace: ${relativePath} -> ${candidateRealPath}`,
		);
	}
	return {
		relativePath: toPosixPath(relativePath),
		absolutePath,
		realPath: candidateRealPath,
	};
}

async function walkAndMeasure(targetPath) {
	const stat = await fs.lstat(targetPath);
	if (!stat.isDirectory()) {
		return stat.size;
	}

	let total = 0;
	const entries = await fs.readdir(targetPath, { withFileTypes: true });
	for (const entry of entries) {
		total += await walkAndMeasure(path.join(targetPath, entry.name));
	}
	return total;
}

async function computePathSizeBytes(targetPath) {
	try {
		const stdout = execFileSync("du", ["-sk", targetPath], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const kibibytes = Number.parseInt(stdout.trim().split(/\s+/u)[0] ?? "", 10);
		if (Number.isFinite(kibibytes) && kibibytes >= 0) {
			return kibibytes * 1024;
		}
	} catch {
		// Fall back to recursive size estimation when du is unavailable.
	}
	return walkAndMeasure(targetPath);
}

async function describePath(targetPath) {
	const absolutePath = path.resolve(targetPath);
	const exists = await pathExists(absolutePath);
	if (!exists) {
		return {
			exists: false,
			absolutePath,
			sizeBytes: 0,
			sizeHuman: "0 B",
			mtimeIso: null,
			isDirectory: false,
		};
	}

	const stat = await fs.lstat(absolutePath);
	const sizeBytes = await computePathSizeBytes(absolutePath);
	return {
		exists: true,
		absolutePath,
		sizeBytes,
		sizeHuman: formatBytes(sizeBytes),
		mtimeIso: stat.mtime.toISOString(),
		isDirectory: stat.isDirectory(),
	};
}

async function describeRepoLocalPath(rootDir, relativePath) {
	const resolved = await resolveRepoLocalPath(rootDir, relativePath);
	const description = await describePath(resolved.absolutePath);
	return {
		...description,
		relativePath: resolved.relativePath,
		realPath: resolved.realPath,
	};
}

async function describeExternalPath(rawPath) {
	const expandedPath = expandHomePath(rawPath);
	const description = await describePath(expandedPath);
	return {
		...description,
		rawPath,
		expandedPath: description.absolutePath,
	};
}

function isCanonicalRuntimePath(relativePath, registry) {
	const candidate = toPosixPath(String(relativePath ?? ""));
	return listAllRegistryPaths(registry).some((registeredPath) => {
		const normalized = toPosixPath(registeredPath);
		return (
			candidate === normalized ||
			candidate.startsWith(`${normalized}/`)
		);
	});
}

async function collectRootEntries(rootDir) {
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const descriptions = await Promise.all(
		entries.map(async (entry) => {
			const relativePath = toPosixPath(entry.name);
			const absolutePath = path.join(rootDir, entry.name);
			const detail = await describePath(absolutePath);
			return {
				relativePath,
				absolutePath,
				sizeBytes: detail.sizeBytes,
				sizeHuman: detail.sizeHuman,
				mtimeIso: detail.mtimeIso,
				isDirectory: entry.isDirectory(),
			};
		}),
	);
	return descriptions.sort((left, right) => right.sizeBytes - left.sizeBytes);
}

async function collectTopFiles(rootDir, limit) {
	const topFiles = [];

	async function visitDirectory(currentDir) {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const absolutePath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await visitDirectory(absolutePath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			const stat = await fs.lstat(absolutePath);
			topFiles.push({
				relativePath: toPosixPath(path.relative(rootDir, absolutePath)),
				sizeBytes: stat.size,
				sizeHuman: formatBytes(stat.size),
				mtimeIso: stat.mtime.toISOString(),
			});
			topFiles.sort((left, right) => right.sizeBytes - left.sizeBytes);
			if (topFiles.length > limit) {
				topFiles.length = limit;
			}
		}
	}

	await visitDirectory(rootDir);
	return topFiles;
}

async function collectDirectChildren(relativePath, absolutePath, limit = 10) {
	const exists = await pathExists(absolutePath);
	if (!exists) {
		return [];
	}
	const entries = await fs.readdir(absolutePath, { withFileTypes: true });
	const children = await Promise.all(
		entries.map(async (entry) => {
			const childAbsolutePath = path.join(absolutePath, entry.name);
			const description = await describePath(childAbsolutePath);
			return {
				relativePath: toPosixPath(path.join(relativePath, entry.name)),
				absolutePath: childAbsolutePath,
				sizeBytes: description.sizeBytes,
				sizeHuman: description.sizeHuman,
				mtimeIso: description.mtimeIso,
				isDirectory: description.isDirectory,
				exists: description.exists,
			};
		}),
	);
	return children
		.sort((left, right) => right.sizeBytes - left.sizeBytes)
		.slice(0, limit);
}

async function collectRuntimeSubtrees(rootDir, registry) {
	const runtimeSurfaceRelative = String(
		registry.runtimeSurface ?? ".runtime-cache",
	);
	const runtimeSurfaceAbsolute = path.resolve(rootDir, runtimeSurfaceRelative);
	const exists = await pathExists(runtimeSurfaceAbsolute);
	if (!exists) {
		return [];
	}

	const allowedTopLevels = new Set(listAllowedRuntimeTopLevelDirectories(registry));
	const entries = await fs.readdir(runtimeSurfaceAbsolute, {
		withFileTypes: true,
	});
	const subtrees = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const relativePath = toPosixPath(
					path.posix.join(runtimeSurfaceRelative, entry.name),
				);
				const detail = await describePath(path.join(runtimeSurfaceAbsolute, entry.name));
				return {
					relativePath,
					sizeBytes: detail.sizeBytes,
					sizeHuman: detail.sizeHuman,
					mtimeIso: detail.mtimeIso,
					canonical: allowedTopLevels.has(entry.name),
				};
			}),
	);
	return subtrees.sort((left, right) => right.sizeBytes - left.sizeBytes);
}

function getRuntimePathMetadata(relativePath, registry) {
	const match = findRuntimeCategoryForPath(registry, relativePath);
	if (!match) {
		return null;
	}
	return {
		categoryId: match.categoryId,
		registeredPath: match.registeredPath,
		owner: String(match.entry?.owner ?? "").trim() || null,
		schema: String(match.entry?.schema ?? "").trim() || null,
		ttlDays:
			typeof match.entry?.ttlDays === "number" ? match.entry.ttlDays : null,
		cleanMode: String(match.entry?.cleanMode ?? "").trim() || null,
		rebuildStrategy:
			String(match.entry?.rebuildStrategy ?? "").trim() || null,
		cleanupClass: String(match.entry?.cleanupClass ?? "").trim() || null,
		maintenanceMinAgeHours:
			typeof match.entry?.maintenanceMinAgeHours === "number"
				? match.entry.maintenanceMinAgeHours
				: 0,
		retainLatestCount:
			typeof match.entry?.retainLatestCount === "number"
				? match.entry.retainLatestCount
				: 0,
	};
}

function computeAgeHours(mtimeIso, now = new Date()) {
	if (!mtimeIso) {
		return null;
	}
	const value = Date.parse(mtimeIso);
	if (!Number.isFinite(value)) {
		return null;
	}
	return Number((((now.getTime() - value) / (60 * 60 * 1000)) || 0).toFixed(2));
}

async function describeRepoSpecificExternalTargets(rootDir, contract = {}) {
	const roots = await resolveToolCacheRoots({
		rootDir,
		validateAmbientEnv: false,
	});
	const configuredTargets = Array.isArray(contract.repoSpecificExternalTargets)
		? contract.repoSpecificExternalTargets
		: [];
	const targetMap = {
		"tool-cache-root": roots.toolCacheRoot,
		playwright: roots.playwrightBrowsersPath,
		install: roots.managedInstallRoot,
		npm: roots.npmCacheRoot,
	};
	return Promise.all(
		configuredTargets.map(async (entry) => {
			const id = String(entry?.id ?? "").trim();
			const absolutePath = targetMap[id];
			const detail = absolutePath
				? await describePath(absolutePath)
				: {
						exists: false,
						absolutePath: null,
						sizeBytes: 0,
						sizeHuman: "0 B",
						mtimeIso: null,
						isDirectory: false,
					};
			return {
				id,
				kind: String(entry?.kind ?? "").trim() || "unknown",
				reason: String(entry?.reason ?? "").trim(),
				...detail,
			};
		}),
	);
}

function summarizeRuntimeSubtrees(subtrees) {
	let canonicalBytes = 0;
	let nonCanonicalBytes = 0;
	for (const subtree of subtrees) {
		if (subtree.canonical) {
			canonicalBytes += subtree.sizeBytes;
		} else {
			nonCanonicalBytes += subtree.sizeBytes;
		}
	}
	const totalBytes = canonicalBytes + nonCanonicalBytes;
	return {
		totalBytes,
		totalHuman: formatBytes(totalBytes),
		canonicalBytes,
		canonicalHuman: formatBytes(canonicalBytes),
		nonCanonicalBytes,
		nonCanonicalHuman: formatBytes(nonCanonicalBytes),
		canonicalPct:
			totalBytes === 0 ? 0 : Number(((canonicalBytes / totalBytes) * 100).toFixed(4)),
		nonCanonicalPct:
			totalBytes === 0 ? 0 : Number(((nonCanonicalBytes / totalBytes) * 100).toFixed(4)),
	};
}

async function buildSpaceGovernanceContext(options = {}) {
	const [{ rootDir, contractPath, contract }, { registryPath, registry }] =
		await Promise.all([
			readSpaceGovernanceContract(options),
			readRuntimePathRegistry(options),
		]);
	return {
		rootDir,
		contractPath,
		contract,
		registryPath,
		registry,
	};
}

export {
	DEFAULT_SPACE_GOVERNANCE_CONTRACT_PATH,
	buildReportFileNames,
	buildSpaceGovernanceContext,
	collectRootEntries,
	collectRuntimeSubtrees,
	collectDirectChildren,
	collectTopFiles,
	computeAgeHours,
	computePathSizeBytes,
	describeExternalPath,
	describePath,
	describeRepoSpecificExternalTargets,
	describeRepoLocalPath,
	expandHomePath,
	formatBytes,
	getRuntimePathMetadata,
	isCanonicalRuntimePath,
	readSpaceGovernanceContract,
	resolveRepoLocalPath,
	summarizeRuntimeSubtrees,
};
