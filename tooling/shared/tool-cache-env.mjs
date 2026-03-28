import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	isPathOutsideRoot,
	pathExists,
	toPosixPath,
} from "./governance-utils.mjs";

const TOOL_CACHE_ROOT_NAME = "openui-tooling-cache";
const TOOL_ASSET_DIRECTORIES = Object.freeze({
	playwright: "playwright",
	install: "install",
	npm: "npm",
});
const TOOL_ENV_KEYS = Object.freeze([
	"HOME",
	"XDG_CACHE_HOME",
	"PRE_COMMIT_HOME",
	"GOMODCACHE",
	"GOCACHE",
	"GOPATH",
]);

function createWorkspaceToken(rootDir) {
	return crypto
		.createHash("sha256")
		.update(String(rootDir))
		.digest("hex")
		.slice(0, 12);
}

function resolveDefaultExternalToolCacheRoot(rootDir, tempRoot = os.tmpdir()) {
	return path.resolve(
		tempRoot,
		TOOL_CACHE_ROOT_NAME,
		createWorkspaceToken(rootDir),
	);
}

async function computeRuntimeMarker(rootDir) {
	const runtimeFingerprint = [
		process.platform,
		process.arch,
		process.version.replace(/^v/u, "v"),
	];
	const lockfilePath = path.resolve(rootDir, "package-lock.json");
	let lockHash = "no-lockfile";
	if (await pathExists(lockfilePath)) {
		const lockfileBuffer = await fs.readFile(lockfilePath);
		lockHash = crypto.createHash("sha256").update(lockfileBuffer).digest("hex");
	}
	return `${runtimeFingerprint.join("-")}-${lockHash}`;
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
	return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(cwd, trimmed);
}

async function resolveToolCacheRoots(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const env = options.env ?? process.env;
	const validateAmbientEnv = options.validateAmbientEnv !== false;
	const toolCacheRoot =
		typeof options.toolCacheRoot === "string" && options.toolCacheRoot.trim()
				? path.resolve(options.toolCacheRoot)
				: resolveDefaultExternalToolCacheRoot(rootDir, options.tempRoot ?? os.tmpdir());
	const runtimeMarker =
		typeof options.runtimeMarker === "string" && options.runtimeMarker.trim()
			? options.runtimeMarker.trim()
			: await computeRuntimeMarker(rootDir);

	await assertPathOutsideWorkspace(rootDir, toolCacheRoot, "tool cache root");

	const roots = {
		toolCacheRoot,
		runtimeMarker,
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
		preCommitHome: path.join(toolCacheRoot, "pre-commit"),
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

async function buildSafeToolCacheEnv(options = {}) {
	const env = options.env ?? process.env;
	const roots = await resolveToolCacheRoots(options);
	if (options.createDirectories !== false) {
		await Promise.all(
			Object.values(roots).map((targetPath) =>
				fs.mkdir(targetPath, { recursive: true }),
			),
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
	const roots = await resolveToolCacheRoots(options);
	const safeEnv = await buildSafeToolCacheEnv(options);
	return {
		roots,
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
			error =
				failure instanceof Error ? failure.message : String(failure);
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
	buildManagedToolingEnv,
	TOOL_CACHE_ROOT_NAME,
	TOOL_ENV_KEYS,
	assertPathOutsideWorkspace,
	buildSafeToolCacheEnv,
	computeRuntimeMarker,
	collectToolCacheEnvStatus,
	expandHomePath,
	resolveDefaultExternalToolCacheRoot,
	resolveToolCacheRoots,
};
