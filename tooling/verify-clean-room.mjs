import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";
import { resolveToolCacheRoots } from "./shared/tool-cache-env.mjs";

const DEFAULT_ROOT_ALLOWLIST_PATH = "contracts/governance/root-allowlist.json";

async function runCleanRoomVerification(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const imageLock = await readJsonFile(path.resolve(rootDir, ".github/ci-image.lock.json"));
	const runLayout = await readJsonFile(path.resolve(rootDir, "contracts/runtime/run-layout.json"));
	const errors = [];

	if (!/^sha256:[0-9a-f]{64}$/i.test(String(imageLock.digest ?? "").trim())) {
		errors.push("clean-room verification requires a non-empty immutable CI image digest");
	}
	if (String(runLayout.runsRoot ?? "") !== ".runtime-cache/runs") {
		errors.push('run-layout runsRoot must stay ".runtime-cache/runs" for clean-room reproducibility');
	}

	for (const forbidden of ["node_modules", "coverage", "dist", "build", "playwright-report", "htmlcov"]) {
		try {
			await fs.access(path.resolve(rootDir, forbidden));
			errors.push(`clean-room precondition failed: root still contains ${forbidden}`);
		} catch {
			// expected
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		errors,
	};
}

async function withManagedInstallSurfaceMoved(rootDir, action) {
	const allowlist = await readJsonFile(
		path.resolve(rootDir, DEFAULT_ROOT_ALLOWLIST_PATH),
	);
	const managedInstallSurface = Array.isArray(allowlist.machineManagedInstallSurface)
		? allowlist.machineManagedInstallSurface.map((value) => String(value).trim()).filter(Boolean)
		: [];
	const forbiddenCleanRoomEntries = new Set([
		"node_modules",
		"coverage",
		"dist",
		"build",
		"playwright-report",
		"htmlcov",
	]);
	const staged = [];
	const manifestRoot = path.resolve(
		rootDir,
		".runtime-cache",
		"tmp",
		"verify-clean-room-managed-install-surface",
	);
	await fs.mkdir(manifestRoot, { recursive: true });
	const roots = await resolveToolCacheRoots({
		rootDir,
		validateAmbientEnv: false,
	});
	await fs.mkdir(roots.managedInstallRoot, { recursive: true });
	await fs.writeFile(
		path.join(roots.managedInstallRoot, ".openui-platform"),
		`${roots.runtimeMarker}\n`,
		"utf8",
	);
	await fs.writeFile(
		path.join(manifestRoot, "manifest.json"),
		`${JSON.stringify(
			{
				ownerCommand: "verify:clean-room",
				createdAt: new Date().toISOString(),
				runtimeMarker: roots.runtimeMarker,
				rebuildCommand: "npm run verify:clean-room",
				cleanupClass: "verify-first-maintain",
				usesExternalPlaywrightCache: true,
				usesExternalInstallSurface: true,
				managedInstallRoot: toPosixPath(roots.managedInstallRoot),
				playwrightBrowsersPath: toPosixPath(roots.playwrightBrowsersPath),
				npmCacheRoot: toPosixPath(roots.npmCacheRoot),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	try {
		for (const relativePath of managedInstallSurface) {
			if (!forbiddenCleanRoomEntries.has(relativePath)) {
				continue;
			}
			const sourcePath = path.resolve(rootDir, relativePath);
			try {
				await fs.access(sourcePath);
			} catch {
					continue;
				}
				const targetPath =
					relativePath === "node_modules"
						? roots.managedInstallRoot
						: path.resolve(roots.managedInstallRoot, relativePath);
				await fs.rm(targetPath, { recursive: true, force: true });
				await fs.rename(sourcePath, targetPath);
				staged.push({ sourcePath, targetPath });
		}
		return await action();
	} finally {
		for (const { sourcePath, targetPath } of [...staged].reverse()) {
			try {
				await fs.access(targetPath);
			} catch {
				continue;
			}
			await fs.rename(targetPath, sourcePath);
		}
	}
}

async function main() {
	try {
		const rootDir = process.cwd();
		const result = await withManagedInstallSurfaceMoved(rootDir, () =>
			runCleanRoomVerification({ rootDir }),
		);
		if (!result.ok) {
			console.error("[verify-clean-room] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[verify-clean-room] OK");
	} catch (error) {
		console.error(`[verify-clean-room] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runCleanRoomVerification };
