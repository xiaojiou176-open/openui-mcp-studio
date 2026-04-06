import fs from "node:fs/promises";
import path from "node:path";
import {
	buildManagedToolingEnv,
	maybeRunToolCacheJanitor,
} from "./tool-cache-env.mjs";
import { toPosixPath } from "./governance-utils.mjs";

function isPathWithin(parentPath, candidatePath) {
	const relativePath = path.relative(parentPath, candidatePath);
	return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function shouldUseManagedInstallSurface(rootDir, targetRoot) {
	const workspaceRoot = path.resolve(rootDir);
	const managedTmpRoot = path.resolve(workspaceRoot, ".runtime-cache", "tmp");
	const candidateRoot = path.resolve(targetRoot);
	return isPathWithin(managedTmpRoot, candidateRoot);
}

async function removePathIfPresent(targetPath) {
	try {
		await fs.rm(targetPath, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup for temp surfaces.
	}
}

async function ensureSymlink(linkPath, targetPath) {
	try {
		const stat = await fs.lstat(linkPath);
		if (stat.isSymbolicLink()) {
			const currentTarget = await fs.readlink(linkPath);
			const resolvedCurrentTarget = path.resolve(path.dirname(linkPath), currentTarget);
			if (resolvedCurrentTarget === targetPath) {
				return;
			}
		}
		await removePathIfPresent(linkPath);
	} catch {
		// Path missing; continue.
	}
	await fs.symlink(targetPath, linkPath, "dir");
}

async function writeManagedTmpManifest(input) {
	const manifestPath = path.resolve(input.targetRoot, ".openui-maintenance-manifest.json");
	const manifest = {
		ownerCommand: input.ownerCommand,
		createdAt: new Date().toISOString(),
		runtimeMarker: input.runtimeMarker,
		rebuildCommand: input.rebuildCommand,
		cleanupClass: input.cleanupClass,
		usesExternalPlaywrightCache: true,
		usesExternalInstallSurface: true,
		managedInstallRoot: toPosixPath(input.managedInstallRoot),
		playwrightBrowsersPath: toPosixPath(input.playwrightBrowsersPath),
		npmCacheRoot: toPosixPath(input.npmCacheRoot),
	};
	await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	return manifestPath;
}

async function prepareManagedInstallSurface(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const targetRoot = path.resolve(options.targetRoot ?? rootDir);
	const shouldManage = shouldUseManagedInstallSurface(rootDir, targetRoot);
	const { roots, env, janitorResult } = await buildManagedToolingEnv({
		rootDir,
		env: options.env,
	});
	if (!shouldManage) {
		return {
			managed: false,
			env,
			roots,
			manifestPath: null,
			janitorResult,
		};
	}

	const targetNodeModules = path.resolve(targetRoot, "node_modules");
	await fs.mkdir(targetRoot, { recursive: true });
	await fs.mkdir(roots.managedInstallRoot, { recursive: true });
	await fs.writeFile(
		path.join(roots.managedInstallRoot, ".openui-platform"),
		`${roots.runtimeMarker}\n`,
		"utf8",
	);
	await ensureSymlink(targetNodeModules, roots.managedInstallRoot);
	const manifestPath = await writeManagedTmpManifest({
		targetRoot,
		runtimeMarker: roots.runtimeMarker,
		managedInstallRoot: roots.managedInstallRoot,
		playwrightBrowsersPath: roots.playwrightBrowsersPath,
		npmCacheRoot: roots.npmCacheRoot,
		ownerCommand: options.ownerCommand ?? "unknown",
		rebuildCommand: options.rebuildCommand ?? "unknown",
		cleanupClass: options.cleanupClass ?? "verify-first-maintain",
	});
	return {
		managed: true,
		env,
		roots,
		manifestPath,
		janitorResult,
	};
}

async function runManagedInstallSurfaceSuccessJanitor(options = {}) {
	return maybeRunToolCacheJanitor({
		rootDir: options.rootDir,
		env: options.env,
		reason: options.trigger ?? "managed-tooling-success",
		dryRun: false,
		force: true,
	});
}

export {
	prepareManagedInstallSurface,
	runManagedInstallSurfaceSuccessJanitor,
	shouldUseManagedInstallSurface,
};
