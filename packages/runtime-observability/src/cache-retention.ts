import fs from "node:fs";
import path from "node:path";
import { resolveEnvDefaultValue } from "../../contracts/src/env-contract.js";
import { isPathInsideRootWithRealpath } from "../../shared-runtime/src/path-utils.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

type CacheFileSnapshot = {
	filePath: string;
	size: number;
	mtimeMs: number;
};

export type CacheRetentionConfig = {
	cacheDir: string;
	retentionDays: number;
	maxBytes: number;
	cleanIntervalMinutes: number;
	nowMs: number;
	dryRun?: boolean;
};

export type CacheRetentionResult = {
	cacheDir: string;
	scannedFiles: number;
	removedExpiredFiles: number;
	removedCapacityFiles: number;
	removedExpiredPaths: string[];
	removedCapacityPaths: string[];
	bytesBefore: number;
	bytesAfter: number;
	dryRun: boolean;
};

function resolveWorkspaceRootFromEnv(): string {
	const defaultWorkspaceRoot = String(
		resolveEnvDefaultValue("OPENUI_MCP_WORKSPACE_ROOT"),
	);
	const raw = process.env.OPENUI_MCP_WORKSPACE_ROOT;
	const trimmed = raw?.trim();
	const resolved = path.resolve(trimmed || defaultWorkspaceRoot);
	let stat: fs.Stats;
	try {
		stat = fs.statSync(resolved);
	} catch {
		throw new Error(
			`OPENUI_MCP_WORKSPACE_ROOT must point to an existing directory, received: ${JSON.stringify(
				raw,
			)}.`,
		);
	}
	if (!stat.isDirectory()) {
		throw new Error(
			`OPENUI_MCP_WORKSPACE_ROOT must point to a directory, received: ${JSON.stringify(raw)}.`,
		);
	}
	return fs.realpathSync(resolved);
}

function requirePositiveIntegerFromEnv(
	envName: string,
	fallback: number,
): number {
	const raw = process.env[envName];
	if (raw === undefined || raw.trim() === "") {
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

function collectCacheFiles(cacheDir: string, files: CacheFileSnapshot[]): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(cacheDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		const entryPath = path.join(cacheDir, entry.name);
		if (entry.isDirectory()) {
			collectCacheFiles(entryPath, files);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}

		try {
			const stat = fs.statSync(entryPath);
			files.push({
				filePath: entryPath,
				size: stat.size,
				mtimeMs: stat.mtimeMs,
			});
		} catch {
			// ignore stat errors for transient files
		}
	}
}

function isFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

type RemoveFileResult = "removed" | "missing" | "failed";

function removeFileIfExists(filePath: string): RemoveFileResult {
	try {
		fs.unlinkSync(filePath);
		return "removed";
	} catch (error) {
		if (isFileNotFound(error)) {
			return "missing";
		}
		return "failed";
	}
}

function isIdempotencyControlFile(filePath: string): boolean {
	const fileName = path.basename(filePath);
	return fileName.endsWith(".lock") || fileName.endsWith(".lease.json");
}

function removeEmptyDirectories(rootDir: string, currentDir: string): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(currentDir, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		removeEmptyDirectories(rootDir, path.join(currentDir, entry.name));
	}

	if (currentDir === rootDir) {
		return;
	}

	try {
		if (fs.readdirSync(currentDir).length === 0) {
			fs.rmdirSync(currentDir);
		}
	} catch {
		return;
	}
}

export function resolveCacheRetentionConfigFromEnv(
	nowMs = Date.now(),
): CacheRetentionConfig {
	const workspaceRoot = resolveWorkspaceRootFromEnv();
	const defaultCacheDir = String(
		resolveEnvDefaultValue("OPENUI_MCP_CACHE_DIR"),
	);
	const rawCacheDir = process.env.OPENUI_MCP_CACHE_DIR?.trim();
	const cacheDirCandidate = rawCacheDir || defaultCacheDir;
	const cacheDir = path.isAbsolute(cacheDirCandidate)
		? path.resolve(cacheDirCandidate)
		: path.resolve(workspaceRoot, cacheDirCandidate);
	if (!isPathInsideRootWithRealpath(workspaceRoot, cacheDir)) {
		throw new Error(
			`OPENUI_MCP_CACHE_DIR must resolve inside OPENUI_MCP_WORKSPACE_ROOT (${workspaceRoot}), received: ${JSON.stringify(
				process.env.OPENUI_MCP_CACHE_DIR,
			)}.`,
		);
	}

	return {
		cacheDir,
		retentionDays: requirePositiveIntegerFromEnv(
			"OPENUI_MCP_CACHE_RETENTION_DAYS",
			Number(resolveEnvDefaultValue("OPENUI_MCP_CACHE_RETENTION_DAYS")),
		),
		maxBytes: requirePositiveIntegerFromEnv(
			"OPENUI_MCP_CACHE_MAX_BYTES",
			Number(resolveEnvDefaultValue("OPENUI_MCP_CACHE_MAX_BYTES")),
		),
		cleanIntervalMinutes: requirePositiveIntegerFromEnv(
			"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
			Number(resolveEnvDefaultValue("OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES")),
		),
		nowMs,
	};
}

export function isCacheCleanupDue(
	lastRunAtMs: number | null,
	nowMs: number,
	cleanIntervalMinutes: number,
): boolean {
	if (lastRunAtMs === null) {
		return true;
	}

	return nowMs - lastRunAtMs >= cleanIntervalMinutes * MS_PER_MINUTE;
}

export function pruneCacheDirectorySync(
	config: CacheRetentionConfig = resolveCacheRetentionConfigFromEnv(),
): CacheRetentionResult {
	fs.mkdirSync(config.cacheDir, { recursive: true });
	const dryRun = config.dryRun === true;

	const files: CacheFileSnapshot[] = [];
	collectCacheFiles(config.cacheDir, files);

	const cutoffMs = config.nowMs - config.retentionDays * MS_PER_DAY;
	const bytesBefore = files.reduce((sum, file) => sum + file.size, 0);
	let removedExpiredFiles = 0;
	const removedExpiredPaths: string[] = [];
	const retainedFiles: CacheFileSnapshot[] = [];

	for (const file of files) {
		if (isIdempotencyControlFile(file.filePath)) {
			retainedFiles.push(file);
			continue;
		}

		if (file.mtimeMs < cutoffMs) {
			const removed = dryRun ? "removed" : removeFileIfExists(file.filePath);
			if (removed === "removed" || removed === "missing") {
				removedExpiredFiles += 1;
				removedExpiredPaths.push(file.filePath);
			} else {
				retainedFiles.push(file);
			}
			continue;
		}

		retainedFiles.push(file);
	}

	let bytesAfter = retainedFiles.reduce((sum, file) => sum + file.size, 0);
	let removedCapacityFiles = 0;
	const removedCapacityPaths: string[] = [];

	if (bytesAfter > config.maxBytes) {
		const sortedByAge = retainedFiles
			.filter((file) => !isIdempotencyControlFile(file.filePath))
			.sort((left, right) => {
				if (left.mtimeMs === right.mtimeMs) {
					return left.filePath.localeCompare(right.filePath);
				}
				return left.mtimeMs - right.mtimeMs;
			});

		for (const file of sortedByAge) {
			if (bytesAfter <= config.maxBytes) {
				break;
			}
			const removed = dryRun ? "removed" : removeFileIfExists(file.filePath);
			if (removed === "failed") {
				continue;
			}

			removedCapacityFiles += 1;
			removedCapacityPaths.push(file.filePath);
			bytesAfter -= file.size;
		}
	}

	if (!dryRun) {
		removeEmptyDirectories(config.cacheDir, config.cacheDir);
	}

	return {
		cacheDir: config.cacheDir,
		scannedFiles: files.length,
		removedExpiredFiles,
		removedCapacityFiles,
		removedExpiredPaths,
		removedCapacityPaths,
		bytesBefore,
		bytesAfter: Math.max(0, bytesAfter),
		dryRun,
	};
}
