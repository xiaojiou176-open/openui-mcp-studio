import fs from "node:fs/promises";
import path from "node:path";
import {
	listCleanPolicyPaths,
	readRuntimePathRegistry,
} from "./shared/runtime-path-registry.mjs";

const DEFAULT_OPENUI_MCP_CACHE_DIR = ".runtime-cache/cache";
const DEFAULT_OPENUI_MCP_CACHE_RETENTION_DAYS = 7;
const DEFAULT_OPENUI_MCP_CACHE_MAX_BYTES = 104_857_600;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const runtimeProcess = globalThis.process;

function isDryRunEnabled(argv) {
	return argv.includes("--dry-run");
}

function resolveDirFromEnv(envName, fallback) {
	const raw = runtimeProcess.env[envName];
	const trimmed = raw?.trim();
	return path.resolve(runtimeProcess.cwd(), trimmed || fallback);
}

function requirePositiveIntegerFromEnv(envName, fallback) {
	const raw = runtimeProcess.env[envName];
	if (raw === undefined || raw.trim() === "") {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(
			`[clean:runtime] ${envName} must be a positive integer, received: ${JSON.stringify(raw)}`,
		);
	}

	return parsed;
}

async function resetDirectory(dirPath) {
	await fs.rm(dirPath, { force: true, recursive: true });
	await fs.mkdir(dirPath, { recursive: true });
}

async function purgeDirectory(dirPath) {
	await fs.rm(dirPath, { force: true, recursive: true });
}

function isPathWithinRoot(rootPath, targetPath) {
	const relativePath = path.relative(rootPath, targetPath);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	);
}

function assertTargetLexicallyWithinWorkspace(workspaceRoot, targetDir) {
	if (!isPathWithinRoot(workspaceRoot, targetDir)) {
		throw new Error(
			`[clean:runtime] unsafe target outside workspace: ${targetDir}`,
		);
	}
}

async function assertNoSymlinkAncestors(workspaceRoot, targetDir) {
	const relativePath = path.relative(workspaceRoot, targetDir);
	const segments =
		relativePath === "" ? [] : relativePath.split(path.sep).filter(Boolean);
	let currentPath = workspaceRoot;

	for (const segment of segments) {
		currentPath = path.join(currentPath, segment);
		let stat;
		try {
			stat = await fs.lstat(currentPath);
		} catch (error) {
			if (error && error.code === "ENOENT") {
				return;
			}
			throw error;
		}

		if (stat.isSymbolicLink()) {
			throw new Error(
				`[clean:runtime] unsafe symlink ancestor detected: ${currentPath}`,
			);
		}
	}
}

async function resolveRealPathCandidate(targetPath) {
	const missingSegments = [];
	let currentPath = targetPath;

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
			throw new Error(
				`[clean:runtime] unable to resolve real path candidate for target: ${targetPath}`,
			);
		}
		missingSegments.unshift(path.basename(currentPath));
		currentPath = parentPath;
	}
}

async function assertTargetWithinWorkspace(
	workspaceRoot,
	workspaceRealRoot,
	targetDir,
) {
	assertTargetLexicallyWithinWorkspace(workspaceRoot, targetDir);
	await assertNoSymlinkAncestors(workspaceRoot, targetDir);
	const candidateRealPath = await resolveRealPathCandidate(targetDir);
	if (!isPathWithinRoot(workspaceRealRoot, candidateRealPath)) {
		throw new Error(
			`[clean:runtime] unsafe target resolves outside workspace: ${targetDir} -> ${candidateRealPath}`,
		);
	}
}

async function resolveTargetDirs(workspaceRoot) {
	const { registry } = await readRuntimePathRegistry({ rootDir: workspaceRoot });
	const resetTargets = new Set(listCleanPolicyPaths(registry, "resetOnClean"));
	const purgeTargets = new Set(listCleanPolicyPaths(registry, "purgeOnClean"));
	return [
		...Array.from(resetTargets).map((relativePath) => ({
			path:
				relativePath === ".runtime-cache/cache"
						? resolveDirFromEnv("OPENUI_MCP_CACHE_DIR", DEFAULT_OPENUI_MCP_CACHE_DIR)
						: path.resolve(workspaceRoot, relativePath),
			recreate: true,
		})),
		...Array.from(purgeTargets).map((relativePath) => ({
			path: path.resolve(workspaceRoot, relativePath),
			recreate: false,
		})),
	];
}

function shouldIncludeE2EArtifacts(argv) {
	return argv.includes("--include-e2e-artifacts");
}

function resolveExtendedTargetDirs() {
	return [
		{
			path: path.resolve(runtimeProcess.cwd(), ".runtime-cache/artifacts"),
			recreate: false,
		},
		{
			path: path.resolve(runtimeProcess.cwd(), ".runtime-cache/ci-gate"),
			recreate: false,
		},
		{
			path: path.resolve(runtimeProcess.cwd(), ".runtime-cache/evidence"),
			recreate: false,
		},
		{
			path: path.resolve(runtimeProcess.cwd(), ".runtime-cache/logs"),
			recreate: false,
		},
	];
}

async function cleanStressLeakDirectories(workspaceRoot, dryRun) {
	const runtimeCacheDir = path.resolve(workspaceRoot, ".runtime-cache");
	let entries;
	try {
		entries = await fs.readdir(runtimeCacheDir, { withFileTypes: true });
	} catch {
		return 0;
	}

	const stressLeakDirs = entries
		.filter(
			(entry) => entry.isDirectory() && entry.name.startsWith("stress-leak-"),
		)
		.map((entry) => path.join(runtimeCacheDir, entry.name));

	if (dryRun) {
		for (const dir of stressLeakDirs) {
			globalThis.console.log(
				`[clean:runtime] would remove stress-leak dir: ${dir}`,
			);
		}
		return stressLeakDirs.length;
	}

	let removed = 0;
	for (const dir of stressLeakDirs) {
		try {
			await fs.rm(dir, { recursive: true, force: true });
			removed += 1;
		} catch {
			// ignore removal errors
		}
	}
	return removed;
}

async function cleanBrowserTempDirectories(workspaceRoot, dryRun) {
	const runtimeCacheDir = path.resolve(workspaceRoot, ".runtime-cache");
	let entries;
	try {
		entries = await fs.readdir(runtimeCacheDir, { withFileTypes: true });
	} catch {
		return 0;
	}

	const browserTempDirs = entries
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^tmp-(?:firefox|webkit)(?:-.+)?$/u.test(entry.name),
		)
		.map((entry) => path.join(runtimeCacheDir, entry.name));

	if (dryRun) {
		for (const dir of browserTempDirs) {
			globalThis.console.log(
				`[clean:runtime] would remove browser tmp dir: ${dir}`,
			);
		}
		return browserTempDirs.length;
	}

	let removed = 0;
	for (const dir of browserTempDirs) {
		try {
			await fs.rm(dir, { recursive: true, force: true });
			removed += 1;
		} catch {
			// ignore removal errors
		}
	}
	return removed;
}

async function cleanRootLogFiles(workspaceRoot, dryRun) {
	const runtimeCacheDir = path.resolve(workspaceRoot, ".runtime-cache");
	let entries;
	try {
		entries = await fs.readdir(runtimeCacheDir, { withFileTypes: true });
	} catch {
		return 0;
	}

	const logFiles = entries
		.filter(
			(entry) =>
				entry.isFile() &&
				(entry.name.endsWith(".log") || entry.name.endsWith(".out")),
		)
		.map((entry) => path.join(runtimeCacheDir, entry.name));

	if (dryRun) {
		for (const file of logFiles) {
			globalThis.console.log(`[clean:runtime] would remove log file: ${file}`);
		}
		return logFiles.length;
	}

	let removed = 0;
	for (const file of logFiles) {
		try {
			await fs.unlink(file);
			removed += 1;
		} catch {
			// ignore removal errors
		}
	}
	return removed;
}

function isCacheRetentionOnlyMode(argv) {
	return argv.includes("--cache-retention-only");
}

function resolveCacheRetentionPolicy() {
	return {
		cacheDir: resolveDirFromEnv(
			"OPENUI_MCP_CACHE_DIR",
			DEFAULT_OPENUI_MCP_CACHE_DIR,
		),
		retentionDays: requirePositiveIntegerFromEnv(
			"OPENUI_MCP_CACHE_RETENTION_DAYS",
			DEFAULT_OPENUI_MCP_CACHE_RETENTION_DAYS,
		),
		maxBytes: requirePositiveIntegerFromEnv(
			"OPENUI_MCP_CACHE_MAX_BYTES",
			DEFAULT_OPENUI_MCP_CACHE_MAX_BYTES,
		),
		nowMs: Date.now(),
	};
}

async function collectCacheFiles(cacheDir, files = []) {
	let entries;
	try {
		entries = await fs.readdir(cacheDir, { withFileTypes: true });
	} catch {
		return files;
	}

	for (const entry of entries) {
		const entryPath = path.join(cacheDir, entry.name);
		if (entry.isDirectory()) {
			await collectCacheFiles(entryPath, files);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}

		try {
			const stat = await fs.stat(entryPath);
			files.push({
				filePath: entryPath,
				mtimeMs: stat.mtimeMs,
				size: stat.size,
			});
		} catch {
			// ignore stat errors for transient files
		}
	}

	return files;
}

async function removeEmptyDirectories(rootDir, currentDir) {
	let entries;
	try {
		entries = await fs.readdir(currentDir, { withFileTypes: true });
	} catch {
		return;
	}

	await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map((entry) =>
				removeEmptyDirectories(rootDir, path.join(currentDir, entry.name)),
			),
	);

	if (currentDir === rootDir) {
		return;
	}

	try {
		const remainingEntries = await fs.readdir(currentDir);
		if (remainingEntries.length === 0) {
			await fs.rmdir(currentDir);
		}
	} catch {
		return;
	}
}

async function pruneCacheDirectory(policy) {
	await fs.mkdir(policy.cacheDir, { recursive: true });

	const files = await collectCacheFiles(policy.cacheDir);
	const cutoffMs = policy.nowMs - policy.retentionDays * MS_PER_DAY;
	const bytesBefore = files.reduce((sum, file) => sum + file.size, 0);
	const retainedFiles = [];
	let removedExpiredFiles = 0;

	for (const file of files) {
		if (file.mtimeMs < cutoffMs) {
			try {
				await fs.unlink(file.filePath);
				removedExpiredFiles += 1;
			} catch {
				continue;
			}
			continue;
		}

		retainedFiles.push(file);
	}

	let bytesAfter = retainedFiles.reduce((sum, file) => sum + file.size, 0);
	let removedCapacityFiles = 0;

	if (bytesAfter > policy.maxBytes) {
		const filesByAge = [...retainedFiles].sort((left, right) => {
			if (left.mtimeMs === right.mtimeMs) {
				return left.filePath.localeCompare(right.filePath);
			}
			return left.mtimeMs - right.mtimeMs;
		});

		for (const file of filesByAge) {
			if (bytesAfter <= policy.maxBytes) {
				break;
			}

			try {
				await fs.unlink(file.filePath);
				removedCapacityFiles += 1;
				bytesAfter -= file.size;
			} catch {
				// ignore unlink errors for already-removed files
			}
		}
	}

	await removeEmptyDirectories(policy.cacheDir, policy.cacheDir);

	return {
		removedCapacityFiles,
		removedExpiredFiles,
		bytesAfter: Math.max(0, bytesAfter),
		bytesBefore,
	};
}

async function cleanRuntime(argv = runtimeProcess.argv.slice(2)) {
	const workspaceRoot = runtimeProcess.cwd();
	const workspaceRealRoot = await fs.realpath(workspaceRoot);

	if (isCacheRetentionOnlyMode(argv)) {
		const policy = resolveCacheRetentionPolicy();
		await assertTargetWithinWorkspace(
			workspaceRoot,
			workspaceRealRoot,
			policy.cacheDir,
		);

		if (isDryRunEnabled(argv)) {
			globalThis.console.log("[clean:runtime] dry-run cache retention policy:");
			globalThis.console.log(JSON.stringify(policy, null, 2));
			return;
		}

		const summary = await pruneCacheDirectory(policy);
		globalThis.console.log(
			`[clean:runtime] cache retention cleaned: expired=${summary.removedExpiredFiles}, capacity=${summary.removedCapacityFiles}, before=${summary.bytesBefore}, after=${summary.bytesAfter}`,
		);
		return;
	}

	const targetDirs = await resolveTargetDirs(workspaceRoot);
	if (shouldIncludeE2EArtifacts(argv)) {
		targetDirs.push(...resolveExtendedTargetDirs(workspaceRoot));
	}

	await Promise.all(
		targetDirs.map((targetDir) =>
			assertTargetWithinWorkspace(
				workspaceRoot,
				workspaceRealRoot,
				targetDir.path,
			),
		),
	);

	if (isDryRunEnabled(argv)) {
		globalThis.console.log("[clean:runtime] dry-run targets:");
		for (const target of targetDirs) {
			globalThis.console.log(
				`${target.path} (${target.recreate ? "reset" : "purge"})`,
			);
		}
		await cleanStressLeakDirectories(workspaceRoot, true);
		await cleanBrowserTempDirectories(workspaceRoot, true);
		await cleanRootLogFiles(workspaceRoot, true);
		return;
	}

	await Promise.all(
		targetDirs.map((target) =>
			target.recreate ? resetDirectory(target.path) : purgeDirectory(target.path),
		),
	);
	const stressLeakRemoved = await cleanStressLeakDirectories(
		workspaceRoot,
		false,
	);
	const browserTempRemoved = await cleanBrowserTempDirectories(
		workspaceRoot,
		false,
	);
	const logFilesRemoved = await cleanRootLogFiles(workspaceRoot, false);
	if (stressLeakRemoved > 0 || browserTempRemoved > 0 || logFilesRemoved > 0) {
		globalThis.console.log(
			`[clean:runtime] additional cleanup: stress-leak dirs=${stressLeakRemoved}, browser tmp dirs=${browserTempRemoved}, log files=${logFilesRemoved}`,
		);
	}
}

cleanRuntime().catch((error) => {
	globalThis.console.error("[clean:runtime] failed", error);
	runtimeProcess.exitCode = 1;
});
