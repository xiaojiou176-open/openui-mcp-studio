import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	isPathOutsideRoot,
	pathExists,
	toPosixPath,
} from "./governance-utils.mjs";

const TOOL_CACHE_PRODUCT_ROOT_NAME = "openui-mcp-studio";
const TOOL_CACHE_REPORT_ROOT = ".runtime-cache/reports/space-governance";
const TOOL_CACHE_RECEIPT_BASENAME = "tool-cache-janitor-latest";
const TOOL_ASSET_DIRECTORIES = Object.freeze({
	playwright: "playwright",
	install: "install",
	trivy: "trivy",
	npm: "npm",
	preCommit: "pre-commit",
});
const TOOL_ENV_KEYS = Object.freeze([
	"HOME",
	"XDG_CACHE_HOME",
	"PRE_COMMIT_HOME",
	"GOMODCACHE",
	"GOCACHE",
	"GOPATH",
]);
const DEFAULT_TOOL_CACHE_ROOT = "~/.cache/openui-mcp-studio/tooling";
const DEFAULT_TOOL_CACHE_RETENTION_DAYS = 3;
const DEFAULT_TOOL_CACHE_MAX_BYTES = 5 * 1024 ** 3;
const DEFAULT_TOOL_CACHE_CLEAN_INTERVAL_MINUTES = 60;

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
			const digits = value >= base * 10 ? 1 : 2;
			return `${(value / base).toFixed(digits)} ${label}`;
		}
	}
	return `${value} B`;
}

function createWorkspaceToken(rootDir) {
	return crypto
		.createHash("sha256")
		.update(String(rootDir))
		.digest("hex")
		.slice(0, 12);
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

function resolveDefaultToolCacheBaseRoot(rootDir, env = process.env) {
	const raw =
		env.OPENUI_TOOL_CACHE_ROOT?.trim() || DEFAULT_TOOL_CACHE_ROOT;
	const expanded = expandHomePath(raw);
	return path.isAbsolute(expanded)
		? path.resolve(expanded)
		: path.resolve(rootDir, expanded);
}

function resolveDefaultExternalToolCacheRoot(rootDir, env = process.env) {
	return resolveDefaultToolCacheBaseRoot(rootDir, env);
}

function isToolCacheCleanupDue(lastCleanupCompletedAtMs, nowMs, cleanIntervalMinutes) {
	if (!Number.isFinite(lastCleanupCompletedAtMs)) {
		return true;
	}
	return nowMs - Number(lastCleanupCompletedAtMs) >= cleanIntervalMinutes * 60 * 1000;
}

function collectCacheFilesSync(rootDir) {
	const files = [];
	if (!fsSync.existsSync(rootDir)) {
		return files;
	}
	const stack = [rootDir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		for (const entry of fsSync.readdirSync(current, { withFileTypes: true })) {
			const entryPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			const stat = fsSync.statSync(entryPath);
			files.push({
				filePath: entryPath,
				size: stat.size,
				mtimeMs: stat.mtimeMs,
			});
		}
	}
	return files;
}

function removeEmptyDirectoriesSync(rootDir, currentDir) {
	let entries;
	try {
		entries = fsSync.readdirSync(currentDir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		removeEmptyDirectoriesSync(rootDir, path.join(currentDir, entry.name));
	}
	if (currentDir === rootDir) {
		return;
	}
	try {
		if (fsSync.readdirSync(currentDir).length === 0) {
			fsSync.rmdirSync(currentDir);
		}
	} catch {
		// Ignore racey cleanup failures.
	}
}

function pruneToolCacheDirectorySync(policy) {
	fsSync.mkdirSync(policy.cacheDir, { recursive: true });
	const files = collectCacheFilesSync(policy.cacheDir);
	const cutoffMs = policy.nowMs - policy.retentionDays * 24 * 60 * 60 * 1000;
	const bytesBefore = files.reduce((sum, file) => sum + file.size, 0);
	const retainedFiles = [];
	const removedExpiredPaths = [];

	for (const file of files) {
		if (file.mtimeMs < cutoffMs) {
			removedExpiredPaths.push(file.filePath);
			if (!policy.dryRun) {
				try {
					fsSync.unlinkSync(file.filePath);
				} catch {
					retainedFiles.push(file);
					continue;
				}
			}
			continue;
		}
		retainedFiles.push(file);
	}

	let bytesAfter = retainedFiles.reduce((sum, file) => sum + file.size, 0);
	const removedCapacityPaths = [];
	if (bytesAfter > policy.maxBytes) {
		const oldestFirst = [...retainedFiles].sort((left, right) => {
			if (left.mtimeMs === right.mtimeMs) {
				return left.filePath.localeCompare(right.filePath);
			}
			return left.mtimeMs - right.mtimeMs;
		});
		for (const file of oldestFirst) {
			if (bytesAfter <= policy.maxBytes) {
				break;
			}
			removedCapacityPaths.push(file.filePath);
			if (!policy.dryRun) {
				try {
					fsSync.unlinkSync(file.filePath);
				} catch {
					continue;
				}
			}
			bytesAfter -= file.size;
		}
	}

	if (!policy.dryRun) {
		removeEmptyDirectoriesSync(policy.cacheDir, policy.cacheDir);
	}

	return {
		cacheDir: policy.cacheDir,
		scannedFiles: files.length,
		removedExpiredFiles: removedExpiredPaths.length,
		removedCapacityFiles: removedCapacityPaths.length,
		removedExpiredPaths,
		removedCapacityPaths,
		bytesBefore,
		bytesAfter: Math.max(0, bytesAfter),
		dryRun: policy.dryRun,
	};
}

function pruneLegacyToolCacheRootSync(policy) {
	fsSync.mkdirSync(path.dirname(policy.cacheDir), { recursive: true });
	const files = collectCacheFilesSync(policy.cacheDir);
	const bytesBefore = files.reduce((sum, file) => sum + file.size, 0);
	if (!policy.dryRun && fsSync.existsSync(policy.cacheDir)) {
		fsSync.rmSync(policy.cacheDir, { recursive: true, force: true });
	}
	return {
		cacheDir: policy.cacheDir,
		scannedFiles: files.length,
		removedExpiredFiles: files.length,
		removedCapacityFiles: 0,
		removedExpiredPaths: files.map((file) => file.filePath),
		removedCapacityPaths: [],
		bytesBefore,
		bytesAfter: 0,
		dryRun: policy.dryRun,
	};
}

async function computeRuntimeMarker(rootDir) {
	const runtimeFingerprint = [
		process.platform,
		process.arch,
		process.version,
	];
	const lockfilePath = path.resolve(rootDir, "package-lock.json");
	let lockHash = "no-lockfile";
	if (await pathExists(lockfilePath)) {
		const lockfileBuffer = await fs.readFile(lockfilePath);
		lockHash = crypto.createHash("sha256").update(lockfileBuffer).digest("hex");
	}
	return `${runtimeFingerprint.join("-")}-${lockHash}`;
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
			return currentPath;
		}
		missingSegments.unshift(path.basename(currentPath));
		currentPath = parentPath;
	}
}

async function assertPathOutsideWorkspace(rootDir, candidatePath, label) {
	const workspaceRealRoot = await fs.realpath(rootDir);
	const candidateRealPath = await resolveRealPathCandidate(candidatePath);
	if (!isPathOutsideRoot(workspaceRealRoot, candidateRealPath)) {
		throw new Error(
			`${label} must resolve outside workspace (${toPosixPath(workspaceRealRoot)}), received: ${toPosixPath(candidateRealPath)}.`,
		);
	}
	return candidateRealPath;
}

function resolveEnvPath(rawValue, cwd) {
	if (typeof rawValue !== "string" || rawValue.trim() === "") {
		return "";
	}
	const trimmed = expandHomePath(rawValue.trim());
	return path.isAbsolute(trimmed)
		? path.resolve(trimmed)
		: path.resolve(cwd, trimmed);
}

function requirePositiveIntegerFromEnv(env, envName, fallback) {
	const raw = env[envName];
	if (raw === undefined || String(raw).trim() === "") {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(
			`${envName} must be a positive integer, received: ${JSON.stringify(raw)}.`,
		);
	}
	return parsed;
}

function buildToolCacheReceiptPaths(rootDir, basename = TOOL_CACHE_RECEIPT_BASENAME) {
	const reportRoot = path.resolve(rootDir, TOOL_CACHE_REPORT_ROOT);
	return {
		reportRoot,
		jsonPath: path.join(reportRoot, `${basename}.json`),
		markdownPath: path.join(reportRoot, `${basename}.md`),
	};
}

async function readLatestToolCacheJanitorReceipt(
	rootDir,
	basename = TOOL_CACHE_RECEIPT_BASENAME,
) {
	const { jsonPath } = buildToolCacheReceiptPaths(rootDir, basename);
	try {
		return JSON.parse(await fs.readFile(jsonPath, "utf8"));
	} catch (error) {
		if (error && typeof error === "object" && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

function formatPathList(paths) {
	if (!Array.isArray(paths) || paths.length === 0) {
		return ["- none"];
	}
	return paths.map((value) => `- ${value}`);
}

function buildToolCacheJanitorMarkdown(receipt) {
	return [
		"# Tool Cache Janitor Receipt",
		"",
		`- Generated at: ${receipt.generatedAt}`,
		`- Mode: ${receipt.mode}`,
		`- Reason: ${receipt.reason}`,
		`- Due: ${receipt.due ? "yes" : "no"}`,
		`- Forced: ${receipt.forced ? "yes" : "no"}`,
		`- Base root: ${receipt.toolCacheBaseRoot}`,
		`- Repo-specific root: ${receipt.toolCacheRoot}`,
		`- Workspace token: ${receipt.workspaceToken}`,
		`- Runtime marker: ${receipt.runtimeMarker}`,
		`- TTL days: ${receipt.retentionDays}`,
		`- Max bytes: ${receipt.maxBytes}`,
		`- Clean interval minutes: ${receipt.cleanIntervalMinutes}`,
		`- Last cleanup completed at: ${receipt.lastCleanupCompletedAt ?? "never"}`,
		`- Bytes before: ${receipt.bytesBeforeHuman}`,
		`- Bytes after: ${receipt.bytesAfterHuman}`,
		`- Removed expired files: ${receipt.removedExpiredFiles}`,
		`- Removed capacity files: ${receipt.removedCapacityFiles}`,
		"",
		"## Removed By TTL",
		"",
		...formatPathList(receipt.removedExpiredPaths),
		"",
		"## Removed By Capacity",
		"",
		...formatPathList(receipt.removedCapacityPaths),
		"",
	].join("\n");
}

async function writeToolCacheJanitorReceipt(
	rootDir,
	receipt,
	basename = TOOL_CACHE_RECEIPT_BASENAME,
) {
	const paths = buildToolCacheReceiptPaths(rootDir, basename);
	await fs.mkdir(paths.reportRoot, { recursive: true });
	await Promise.all([
		fs.writeFile(paths.jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
		fs.writeFile(
			paths.markdownPath,
			`${buildToolCacheJanitorMarkdown(receipt)}\n`,
			"utf8",
		),
	]);
	return paths;
}

async function resolveToolCacheRoots(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const env = options.env ?? process.env;
	const validateAmbientEnv = options.validateAmbientEnv !== false;
	const toolCacheBaseRoot =
		typeof options.toolCacheRoot === "string" && options.toolCacheRoot.trim()
			? path.resolve(expandHomePath(options.toolCacheRoot.trim()))
			: resolveDefaultToolCacheBaseRoot(rootDir, env);
	const workspaceToken = createWorkspaceToken(rootDir);
	const toolCacheRoot = path.join(toolCacheBaseRoot, workspaceToken);
	const runtimeMarker =
		typeof options.runtimeMarker === "string" && options.runtimeMarker.trim()
			? options.runtimeMarker.trim()
			: await computeRuntimeMarker(rootDir);

	await assertPathOutsideWorkspace(rootDir, toolCacheBaseRoot, "tool cache base root");
	await assertPathOutsideWorkspace(rootDir, toolCacheRoot, "tool cache root");

	const roots = {
		toolCacheBaseRoot,
		toolCacheRoot,
		workspaceToken,
		runtimeMarker,
		legacyInstallRoot: path.join(toolCacheBaseRoot, TOOL_ASSET_DIRECTORIES.install),
		trivyCacheRoot: path.join(toolCacheBaseRoot, TOOL_ASSET_DIRECTORIES.trivy),
		playwrightBrowsersPath: path.join(
			toolCacheRoot,
			TOOL_ASSET_DIRECTORIES.playwright,
		),
		managedInstallRoot: path.join(
			toolCacheRoot,
			TOOL_ASSET_DIRECTORIES.install,
			runtimeMarker,
		),
		npmCacheRoot: path.join(
			toolCacheRoot,
			TOOL_ASSET_DIRECTORIES.npm,
			runtimeMarker,
		),
		home: path.join(toolCacheRoot, "home"),
		xdgCacheHome: path.join(toolCacheRoot, "home", ".cache"),
		preCommitHome: path.join(toolCacheRoot, TOOL_ASSET_DIRECTORIES.preCommit),
		goModCache: path.join(toolCacheRoot, "go", "mod"),
		goCache: path.join(toolCacheRoot, "go", "build"),
		goPath: path.join(toolCacheRoot, "go", "path"),
	};

	for (const [label, candidatePath] of Object.entries({
		HOME: roots.home,
		XDG_CACHE_HOME: roots.xdgCacheHome,
		PRE_COMMIT_HOME: roots.preCommitHome,
		GOMODCACHE: roots.goModCache,
		GOCACHE: roots.goCache,
		GOPATH: roots.goPath,
	})) {
		await assertPathOutsideWorkspace(rootDir, candidatePath, label);
	}

	if (validateAmbientEnv) {
		for (const key of TOOL_ENV_KEYS) {
			const resolvedPath = resolveEnvPath(env[key], rootDir);
			if (!resolvedPath) {
				continue;
			}
			await assertPathOutsideWorkspace(rootDir, resolvedPath, key);
		}
	}

	return roots;
}

async function resolveToolCacheGovernanceConfig(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const env = options.env ?? process.env;
	const roots = await resolveToolCacheRoots({
		...options,
		rootDir,
		env,
		validateAmbientEnv: false,
	});
	return {
		rootDir,
		roots,
		retentionDays: requirePositiveIntegerFromEnv(
			env,
			"OPENUI_TOOL_CACHE_RETENTION_DAYS",
			DEFAULT_TOOL_CACHE_RETENTION_DAYS,
		),
		maxBytes: requirePositiveIntegerFromEnv(
			env,
			"OPENUI_TOOL_CACHE_MAX_BYTES",
			DEFAULT_TOOL_CACHE_MAX_BYTES,
		),
		cleanIntervalMinutes: requirePositiveIntegerFromEnv(
			env,
			"OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES",
			DEFAULT_TOOL_CACHE_CLEAN_INTERVAL_MINUTES,
		),
		receiptBaseName:
			String(options.receiptBaseName ?? TOOL_CACHE_RECEIPT_BASENAME).trim() ||
			TOOL_CACHE_RECEIPT_BASENAME,
	};
}

async function buildSafeToolCacheEnv(options = {}) {
	const env = options.env ?? process.env;
	const roots = await resolveToolCacheRoots(options);
	if (options.createDirectories !== false) {
		await Promise.all(
			[
				roots.toolCacheBaseRoot,
				roots.toolCacheRoot,
				roots.playwrightBrowsersPath,
				roots.managedInstallRoot,
				roots.npmCacheRoot,
				roots.home,
				roots.xdgCacheHome,
				roots.preCommitHome,
				roots.goModCache,
				roots.goCache,
				roots.goPath,
			].map((targetPath) => fs.mkdir(targetPath, { recursive: true })),
		);
	}
	return {
		...env,
		HOME: roots.home,
		XDG_CACHE_HOME: roots.xdgCacheHome,
		PRE_COMMIT_HOME: roots.preCommitHome,
		GOMODCACHE: roots.goModCache,
		GOCACHE: roots.goCache,
		GOPATH: roots.goPath,
	};
}

async function buildManagedToolingEnv(options = {}) {
	const janitorResult = await runToolCacheJanitor({
		rootDir: options.rootDir,
		env: options.env,
		reason: String(options.janitorReason ?? "managed-tooling-entry"),
		dryRun: false,
	});
	const roots = await resolveToolCacheRoots(options);
	const safeEnv = await buildSafeToolCacheEnv(options);
	return {
		roots,
		janitorResult,
		env: {
			...safeEnv,
			PLAYWRIGHT_BROWSERS_PATH: roots.playwrightBrowsersPath,
			NPM_CONFIG_CACHE: roots.npmCacheRoot,
			npm_config_cache: roots.npmCacheRoot,
			OPENUI_MANAGED_INSTALL_ROOT: roots.managedInstallRoot,
			OPENUI_RUNTIME_MARKER: roots.runtimeMarker,
		},
	};
}

async function runToolCacheJanitor(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const dryRun = options.dryRun === true;
	const forced = options.force === true;
	const reason =
		String(options.reason ?? options.trigger ?? "tool-cache-entrypoint").trim() ||
		"tool-cache-entrypoint";
	const nowMs = Number(options.nowMs ?? Date.now());
	const governance = await resolveToolCacheGovernanceConfig({
		...options,
		rootDir,
	});
	const previousReceipt = await readLatestToolCacheJanitorReceipt(
		rootDir,
		governance.receiptBaseName,
	);
	const lastCleanupCompletedAtMs = Number.isFinite(
		Number(previousReceipt?.lastCleanupCompletedAtMs),
	)
		? Number(previousReceipt.lastCleanupCompletedAtMs)
		: null;
	const due =
		dryRun ||
		forced ||
		isToolCacheCleanupDue(
			lastCleanupCompletedAtMs,
			nowMs,
			governance.cleanIntervalMinutes,
		);
	const janitorRoots = [
		{
			cacheDir: governance.roots.toolCacheRoot,
			pruneMode: "ttl-cap",
		},
		{
			cacheDir: governance.roots.legacyInstallRoot,
			pruneMode: "legacy-reset",
		},
		{
			cacheDir: governance.roots.trivyCacheRoot,
			pruneMode: "legacy-reset",
		},
	].filter(
		(entry, index, entries) =>
			entries.findIndex((candidate) => candidate.cacheDir === entry.cacheDir) ===
			index,
	);
	const emptyResult = {
		cacheDir: governance.roots.toolCacheRoot,
		scannedFiles: 0,
		removedExpiredFiles: 0,
		removedCapacityFiles: 0,
		removedExpiredPaths: [],
		removedCapacityPaths: [],
		bytesBefore: 0,
		bytesAfter: 0,
		dryRun,
	};
	const result =
		due
			? await janitorRoots.reduce((accumulator, entry) => {
					return accumulator.then(async (current) => {
						const { cacheDir, pruneMode } = entry;
						const cacheDirExists = await pathExists(cacheDir);
						if (!cacheDirExists) {
							return current;
						}
						const next =
							pruneMode === "legacy-reset"
								? pruneLegacyToolCacheRootSync({
										cacheDir,
										dryRun,
									})
								: pruneToolCacheDirectorySync({
										cacheDir,
										retentionDays: governance.retentionDays,
										maxBytes: governance.maxBytes,
										cleanIntervalMinutes: governance.cleanIntervalMinutes,
										nowMs,
										dryRun,
									});
						return {
							cacheDir: governance.roots.toolCacheRoot,
							scannedFiles: current.scannedFiles + next.scannedFiles,
							removedExpiredFiles:
								current.removedExpiredFiles + next.removedExpiredFiles,
							removedCapacityFiles:
								current.removedCapacityFiles + next.removedCapacityFiles,
							removedExpiredPaths: [
								...current.removedExpiredPaths,
								...next.removedExpiredPaths,
							],
							removedCapacityPaths: [
								...current.removedCapacityPaths,
								...next.removedCapacityPaths,
							],
							bytesBefore: current.bytesBefore + next.bytesBefore,
							bytesAfter: current.bytesAfter + next.bytesAfter,
							dryRun,
						};
					});
				}, Promise.resolve(emptyResult))
			: emptyResult;
	const mode = dryRun ? "dry-run" : due ? "apply" : "skipped";
	const lastCleanupCompletedAt =
		!dryRun && due
			? new Date(nowMs).toISOString()
			: previousReceipt?.lastCleanupCompletedAt ?? null;
	const receipt = {
		generatedAt: new Date(nowMs).toISOString(),
		mode,
		reason,
		due,
		forced,
		dryRun,
		workspaceToken: governance.roots.workspaceToken,
		runtimeMarker: governance.roots.runtimeMarker,
		toolCacheBaseRoot: toPosixPath(governance.roots.toolCacheBaseRoot),
		toolCacheRoot: toPosixPath(governance.roots.toolCacheRoot),
		janitorRoots: janitorRoots.map((entry) => toPosixPath(entry.cacheDir)),
		retentionDays: governance.retentionDays,
		maxBytes: governance.maxBytes,
		cleanIntervalMinutes: governance.cleanIntervalMinutes,
		lastCleanupCompletedAt,
		lastCleanupCompletedAtMs:
			!dryRun && due ? nowMs : lastCleanupCompletedAtMs,
		scannedFiles: result.scannedFiles,
		removedExpiredFiles: result.removedExpiredFiles,
		removedCapacityFiles: result.removedCapacityFiles,
		removedExpiredPaths: result.removedExpiredPaths.map((value) =>
			toPosixPath(value),
		),
		removedCapacityPaths: result.removedCapacityPaths.map((value) =>
			toPosixPath(value),
		),
		bytesBefore: result.bytesBefore,
		bytesBeforeHuman: formatBytes(result.bytesBefore),
		bytesAfter: result.bytesAfter,
		bytesAfterHuman: formatBytes(result.bytesAfter),
		bytesReclaimed: Math.max(0, result.bytesBefore - result.bytesAfter),
		bytesReclaimedHuman: formatBytes(
			Math.max(0, result.bytesBefore - result.bytesAfter),
		),
	};
	const paths = await writeToolCacheJanitorReceipt(
		rootDir,
		receipt,
		governance.receiptBaseName,
	);
	return {
		...receipt,
		receiptJsonPath: path.relative(rootDir, paths.jsonPath),
		receiptMarkdownPath: path.relative(rootDir, paths.markdownPath),
	};
}

async function buildRepoSpecificExternalToolCacheMetadata(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const governance = await resolveToolCacheGovernanceConfig({
		...options,
		rootDir,
	});
	const latestReceipt = await readLatestToolCacheJanitorReceipt(
		rootDir,
		governance.receiptBaseName,
	);
	const scope = "repo-specific-external";
	const applyMode = "janitor-managed";
	return {
		applyMode,
		scope,
		toolCacheBaseRoot: toPosixPath(governance.roots.toolCacheBaseRoot),
		workspaceToken: governance.roots.workspaceToken,
		toolCacheRoot: toPosixPath(governance.roots.toolCacheRoot),
		legacyInstallRoot: toPosixPath(governance.roots.legacyInstallRoot),
		trivyCacheRoot: toPosixPath(governance.roots.trivyCacheRoot),
		runtimeMarker: governance.roots.runtimeMarker,
		latestReceipt,
		policy: {
			retentionDays: governance.retentionDays,
			maxBytes: governance.maxBytes,
			maxBytesHuman: formatBytes(governance.maxBytes),
			cleanIntervalMinutes: governance.cleanIntervalMinutes,
		},
		janitorConfig: {
			retentionDays: governance.retentionDays,
			maxBytes: governance.maxBytes,
			cleanIntervalMinutes: governance.cleanIntervalMinutes,
			latestReceiptPath: toPosixPath(
				buildToolCacheReceiptPaths(rootDir, governance.receiptBaseName).jsonPath,
			),
			lastCleanupCompletedAt: latestReceipt?.lastCleanupCompletedAt ?? null,
		},
		targets: [
			{
				applyMode,
				id: "tool-cache-root",
				kind: "tool-cache-root",
				measurement: "shallow",
				reportRole: "context-only",
				scope,
				path: toPosixPath(governance.roots.toolCacheRoot),
			},
			{
				applyMode,
				id: "playwright",
				kind: "tool-cache-path",
				measurement: "recursive",
				reportRole: "sized-target",
				scope,
				path: toPosixPath(governance.roots.playwrightBrowsersPath),
			},
				{
					applyMode,
					id: "install",
					kind: "tool-cache-path",
					measurement: "recursive",
					reportRole: "sized-target",
					scope,
					path: toPosixPath(governance.roots.legacyInstallRoot),
				},
				{
					applyMode,
					id: "managed-install",
					kind: "tool-cache-path",
					measurement: "recursive",
					reportRole: "sized-target",
					scope,
					path: toPosixPath(governance.roots.managedInstallRoot),
				},
				{
					applyMode,
					id: "trivy",
					kind: "tool-cache-path",
					measurement: "recursive",
					reportRole: "sized-target",
					scope,
					path: toPosixPath(governance.roots.trivyCacheRoot),
				},
			{
				applyMode,
				id: "npm",
				kind: "tool-cache-path",
				measurement: "recursive",
				reportRole: "sized-target",
				scope,
				path: toPosixPath(governance.roots.npmCacheRoot),
			},
			{
				applyMode,
				id: "home",
				kind: "tool-cache-path",
				measurement: "shallow",
				reportRole: "context-only",
				scope,
				path: toPosixPath(governance.roots.home),
			},
			{
				applyMode,
				id: "pre-commit",
				kind: "tool-cache-path",
				measurement: "recursive",
				reportRole: "sized-target",
				scope,
				path: toPosixPath(governance.roots.preCommitHome),
			},
			{
				applyMode,
				id: "go-mod",
				kind: "tool-cache-path",
				measurement: "recursive",
				reportRole: "sized-target",
				scope,
				path: toPosixPath(governance.roots.goModCache),
			},
			{
				applyMode,
				id: "go-build",
				kind: "tool-cache-path",
				measurement: "recursive",
				reportRole: "sized-target",
				scope,
				path: toPosixPath(governance.roots.goCache),
			},
			{
				applyMode,
				id: "go-path",
				kind: "tool-cache-path",
				measurement: "recursive",
				reportRole: "sized-target",
				scope,
				path: toPosixPath(governance.roots.goPath),
			},
		],
	};
}

async function collectToolCacheEnvStatus(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const env = options.env ?? process.env;
	const roots = await resolveToolCacheRoots({
		...options,
		env,
		validateAmbientEnv: false,
	});
	const status = [];
	for (const [key, resolvedPath] of Object.entries({
		HOME: env.HOME?.trim() ? resolveEnvPath(env.HOME, rootDir) : roots.home,
		XDG_CACHE_HOME: env.XDG_CACHE_HOME?.trim()
			? resolveEnvPath(env.XDG_CACHE_HOME, rootDir)
			: roots.xdgCacheHome,
		PRE_COMMIT_HOME: env.PRE_COMMIT_HOME?.trim()
			? resolveEnvPath(env.PRE_COMMIT_HOME, rootDir)
			: roots.preCommitHome,
		GOMODCACHE: env.GOMODCACHE?.trim()
			? resolveEnvPath(env.GOMODCACHE, rootDir)
			: roots.goModCache,
		GOCACHE: env.GOCACHE?.trim()
			? resolveEnvPath(env.GOCACHE, rootDir)
			: roots.goCache,
		GOPATH: env.GOPATH?.trim()
			? resolveEnvPath(env.GOPATH, rootDir)
			: roots.goPath,
	})) {
		const exists = await pathExists(resolvedPath);
		let outsideWorkspace = false;
		let error = null;
		try {
			await assertPathOutsideWorkspace(rootDir, resolvedPath, key);
			outsideWorkspace = true;
		} catch (failure) {
			error = failure instanceof Error ? failure.message : String(failure);
		}
		status.push({
			key,
			resolvedPath: toPosixPath(resolvedPath),
			exists,
			outsideWorkspace,
			error,
		});
	}
	return { roots, status };
}

export {
	TOOL_ASSET_DIRECTORIES,
	TOOL_CACHE_PRODUCT_ROOT_NAME,
	TOOL_ENV_KEYS,
	assertPathOutsideWorkspace,
	buildManagedToolingEnv,
	buildRepoSpecificExternalToolCacheMetadata,
	buildSafeToolCacheEnv,
	buildToolCacheReceiptPaths,
	collectToolCacheEnvStatus,
	computeRuntimeMarker,
	createWorkspaceToken,
	expandHomePath,
	readLatestToolCacheJanitorReceipt,
	resolveDefaultToolCacheBaseRoot,
	resolveDefaultExternalToolCacheRoot,
	resolveToolCacheGovernanceConfig,
	resolveToolCacheRoots,
	runToolCacheJanitor as maybeRunToolCacheJanitor,
	runToolCacheJanitor,
};
