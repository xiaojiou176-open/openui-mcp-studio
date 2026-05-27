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
import {
	DEFAULT_OPENUI_CHROME_CDP_PORT,
	DEFAULT_OPENUI_CHROME_CHANNEL,
	DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY,
	DEFAULT_OPENUI_CHROME_VERIFY_URL,
	getDefaultIsolatedChromeUserDataDir,
	inspectChromeCdpLane,
	readChromeProfilePolicy,
} from "./local-chrome-profile.mjs";
import { buildRepoSpecificExternalToolCacheMetadata } from "./tool-cache-env.mjs";

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

function parseDuOutput(stdout) {
	const results = new Map();
	for (const line of stdout.split(/\r?\n/u)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const match = /^(\d+)\s+(.*)$/u.exec(trimmed);
		if (!match) {
			continue;
		}
		const kibibytes = Number.parseInt(match[1] ?? "", 10);
		const rawPath = match[2] ?? "";
		if (!Number.isFinite(kibibytes) || !rawPath) {
			continue;
		}
		results.set(path.resolve(rawPath), kibibytes * 1024);
	}
	return results;
}

async function computePathSizesBytes(targetPaths, batchSize = 200) {
	const paths = [...new Set(targetPaths.map((targetPath) => path.resolve(targetPath)))];
	const sizeMap = new Map();
	if (paths.length === 0) {
		return sizeMap;
	}

	try {
		for (let index = 0; index < paths.length; index += batchSize) {
			const batch = paths.slice(index, index + batchSize);
			const stdout = execFileSync("du", ["-sk", ...batch], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
			const parsed = parseDuOutput(stdout);
			for (const [resolvedPath, sizeBytes] of parsed.entries()) {
				sizeMap.set(resolvedPath, sizeBytes);
			}
		}
		return sizeMap;
	} catch {
		for (const targetPath of paths) {
			sizeMap.set(targetPath, await computePathSizeBytes(targetPath));
		}
		return sizeMap;
	}
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

async function describePathShallow(targetPath) {
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
	const sizeBytes = stat.isDirectory() ? 0 : stat.size;
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

async function describeExternalPath(rawPath, options = {}) {
	const expandedPath = expandHomePath(rawPath);
	const measurement =
		String(options.measurement ?? "").trim() || "recursive";
	const description =
		measurement === "shallow"
			? await describePathShallow(expandedPath)
			: await describePath(expandedPath);
	return {
		...description,
		rawPath,
		expandedPath: description.absolutePath,
		measurement,
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
	const childAbsolutePaths = entries.map((entry) =>
		path.join(absolutePath, entry.name),
	);
	const batchSizes = await computePathSizesBytes(childAbsolutePaths);
	const children = await Promise.all(
		entries.map(async (entry) => {
			const childAbsolutePath = path.join(absolutePath, entry.name);
			const stat = await fs.lstat(childAbsolutePath);
			const sizeBytes =
				batchSizes.get(path.resolve(childAbsolutePath)) ??
				(await computePathSizeBytes(childAbsolutePath));
			return {
				relativePath: toPosixPath(path.join(relativePath, entry.name)),
				absolutePath: childAbsolutePath,
				sizeBytes,
				sizeHuman: formatBytes(sizeBytes),
				mtimeIso: stat.mtime.toISOString(),
				isDirectory: stat.isDirectory(),
				exists: true,
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

async function describeRepoSpecificExternalTargets(rootDir, contract = {}, options = {}) {
	const metadata = await buildRepoSpecificExternalToolCacheMetadata({
		rootDir,
		env: options.env,
		validateAmbientEnv: false,
	});
	const configuredTargets = Array.isArray(contract.repoSpecificExternalTargets)
		? contract.repoSpecificExternalTargets
		: [];
	const policy =
		contract && typeof contract.repoSpecificExternalPolicy === "object"
			? contract.repoSpecificExternalPolicy
			: {};
	const defaultScope =
		String(policy.scope ?? "").trim() || "repo-specific-external";
	const defaultApplyMode =
		String(policy.applyMode ?? "").trim() || metadata.applyMode || "managed";
	const defaultMeasurement =
		String(options.defaultMeasurement ?? "").trim() || "recursive";
	const targetMap = new Map(
		metadata.targets.map((entry) => [entry.id, entry]),
	);
	return Promise.all(
		configuredTargets.map(async (entry) => {
			const id = String(entry?.id ?? "").trim();
			const target = targetMap.get(id);
			const measurement =
				String(target?.measurement ?? "").trim() || defaultMeasurement;
			const reportRole =
				String(target?.reportRole ?? "").trim() || "sized-target";
			const detail = target?.path
				? measurement === "shallow"
					? await describePathShallow(target.path)
					: await describePath(target.path)
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
				kind:
					String(entry?.kind ?? "").trim() ||
					String(target?.kind ?? "").trim() ||
					"unknown",
				scope: String(entry?.scope ?? "").trim() || defaultScope,
				applyMode:
					String(entry?.applyMode ?? "").trim() || defaultApplyMode,
				measurement,
				reportRole,
				path: detail.absolutePath ? toPosixPath(detail.absolutePath) : null,
				reason: String(entry?.reason ?? "").trim(),
				...detail,
			};
		}),
	);
}

async function describeRepoSpecificExternalContext(rootDir, contract = {}, options = {}) {
	const metadata = await buildRepoSpecificExternalToolCacheMetadata({
		rootDir,
		env: options.env,
		validateAmbientEnv: false,
	});
	const policy =
		contract && typeof contract.repoSpecificExternalPolicy === "object"
			? contract.repoSpecificExternalPolicy
			: {};
	return {
		toolCacheBaseRoot: metadata.toolCacheBaseRoot,
		workspaceToken: metadata.workspaceToken,
		toolCacheRoot: metadata.toolCacheRoot,
		runtimeMarker: metadata.runtimeMarker,
		scope: String(policy.scope ?? "").trim() || "repo-specific-external",
		applyMode: String(policy.applyMode ?? "").trim() || metadata.applyMode || "managed",
		reason: String(policy.reason ?? "").trim() || "",
		policy: metadata.policy,
		latestReceipt: metadata.latestReceipt,
	};
}

async function describeRepoSpecificPersistentAssets(
	rootDir,
	contract = {},
	options = {},
) {
	const assets = Array.isArray(contract.repoSpecificPersistentAssets)
		? contract.repoSpecificPersistentAssets
		: [];
	const measurement =
		String(options.measurement ?? "").trim() || "recursive";
	return Promise.all(
		assets.map(async (entry) => {
			const detail = await describeExternalPath(entry?.path ?? "", {
				measurement,
			});
			return {
				id: String(entry?.id ?? "").trim(),
				kind: String(entry?.kind ?? "").trim() || "persistent-asset",
				scope:
					String(entry?.scope ?? "").trim() ||
					"repo-specific-persistent-browser-asset",
				applyMode: String(entry?.applyMode ?? "").trim() || "report-only",
				janitorExcluded: entry?.janitorExcluded === true,
				measurement,
				reason: String(entry?.reason ?? "").trim(),
				path: detail.absolutePath ? toPosixPath(detail.absolutePath) : null,
				...detail,
			};
		}),
	);
}

async function describeBrowserLanePolicy(rootDir, contract = {}, options = {}) {
	const policy =
		contract && typeof contract.browserLanePolicy === "object"
			? contract.browserLanePolicy
			: {};
	const env = options.env ?? process.env;
	const defaultUserDataDir = path.resolve(
		expandHomePath(
			String(policy.defaultUserDataDir ?? "").trim() ||
				getDefaultIsolatedChromeUserDataDir(os.homedir()),
		),
	);
	const defaultProfileDirectory =
		String(policy.defaultProfileDirectory ?? "").trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY;
	const defaultCdpPort =
		Number(policy.defaultCdpPort ?? DEFAULT_OPENUI_CHROME_CDP_PORT) ||
		DEFAULT_OPENUI_CHROME_CDP_PORT;
	const inspectionEnv = {
		...env,
		OPENUI_CHROME_USER_DATA_DIR:
			env.OPENUI_CHROME_USER_DATA_DIR?.trim() || defaultUserDataDir,
		OPENUI_CHROME_PROFILE_DIRECTORY:
			env.OPENUI_CHROME_PROFILE_DIRECTORY?.trim() || defaultProfileDirectory,
		OPENUI_CHROME_CHANNEL:
			env.OPENUI_CHROME_CHANNEL?.trim() || DEFAULT_OPENUI_CHROME_CHANNEL,
		OPENUI_CHROME_EXECUTABLE_PATH:
			env.OPENUI_CHROME_EXECUTABLE_PATH?.trim() || "",
		OPENUI_CHROME_CDP_PORT:
			env.OPENUI_CHROME_CDP_PORT?.trim() || String(defaultCdpPort),
	};
	const configuredEnvPolicy = await readChromeProfilePolicy({
		env,
		cwd: rootDir,
	});
	const effectivePolicy = await readChromeProfilePolicy({
		env: inspectionEnv,
		cwd: rootDir,
	});
	const laneStatus = await inspectChromeCdpLane({
		env: inspectionEnv,
		cwd: rootDir,
	});
	return {
		scope:
			String(policy.scope ?? "").trim() ||
			"repo-specific-persistent-browser-asset",
		reason: String(policy.reason ?? "").trim() || "",
		janitorExcluded: policy.janitorExcluded !== false,
		defaultUserDataDir: toPosixPath(defaultUserDataDir),
		defaultProfileDirectory,
		defaultCdpPort,
		defaultVerifyUrl:
			String(policy.defaultVerifyUrl ?? "").trim() ||
			DEFAULT_OPENUI_CHROME_VERIFY_URL,
		maxLiveBrowserInstancesBeforeWait:
			Number(policy.maxLiveBrowserInstancesBeforeWait ?? 6) || 6,
		envStatus: configuredEnvPolicy.status,
		envReason: configuredEnvPolicy.reason,
		effectiveUserDataDir:
			effectivePolicy.userDataDir ?? toPosixPath(defaultUserDataDir),
		effectiveProfileDirectory:
			effectivePolicy.profileDirectory ?? defaultProfileDirectory,
		channel: effectivePolicy.channel ?? DEFAULT_OPENUI_CHROME_CHANNEL,
		cdpPort: effectivePolicy.cdpPort ?? defaultCdpPort,
		currentInstanceState: laneStatus.status,
		currentInstanceReason: laneStatus.reason,
		cdpReachable: laneStatus.cdpReachable,
	};
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
	describeBrowserLanePolicy,
	describeRepoSpecificExternalContext,
	describeRepoSpecificExternalTargets,
	describeRepoSpecificPersistentAssets,
	describeRepoLocalPath,
	expandHomePath,
	formatBytes,
	getRuntimePathMetadata,
	isCanonicalRuntimePath,
	readSpaceGovernanceContract,
	resolveRepoLocalPath,
	summarizeRuntimeSubtrees,
};
