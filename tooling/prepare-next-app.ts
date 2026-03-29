import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	getTargetBuildManifestStatus,
	writeTargetBuildManifest,
} from "../packages/shared-runtime/src/target-build-manifest.js";
import { resolveNextBuildDir } from "../packages/shared-runtime/src/next-build-dir.js";
import { runProcess } from "../packages/shared-runtime/src/process-utils.js";
import { pathExists } from "../packages/shared-runtime/src/runtime-ops.js";
import { prepareManagedInstallSurface } from "./shared/managed-install-surface.mjs";

const DEFAULT_TIMEOUT_MS = 180_000;
const REQUIRED_NEXT_BUILD_PACKAGES = [
	"next",
	"react",
	"react-dom",
	"typescript",
	"@types/react",
	"@types/react-dom",
] as const;

type CliOptions = {
	targetRoot: string;
};

function isPathOutsideRoot(rootPath: string, candidatePath: string): boolean {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function isErrorWithCode(
	error: unknown,
	code: string,
): error is NodeJS.ErrnoException {
	return (
		Boolean(error) &&
		typeof error === "object" &&
		"code" in error &&
		error.code === code
	);
}

function getDefaultAppRoot(): string {
	const currentFilePath = fileURLToPath(import.meta.url);
	const currentDir = path.dirname(currentFilePath);
	return path.resolve(currentDir, "..", "apps", "web");
}

function parseCliOptions(argv: string[]): CliOptions {
	let targetRoot = getDefaultAppRoot();

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (token === "--target-root") {
			targetRoot = path.resolve(argv[index + 1] ?? targetRoot);
			index += 1;
			continue;
		}
		if (token === "--compat-fixture") {
			throw new Error(
				"--compat-fixture has been removed. apps/web is the only default prepare target.",
			);
		}
		throw new Error(`Unknown flag: ${token}`);
	}

	return { targetRoot: path.resolve(targetRoot) };
}

async function resolveSafeTargetRoot(targetRoot: string): Promise<string> {
	const workspaceRoot = path.resolve(process.cwd());
	const workspaceRealRoot = await fs.realpath(workspaceRoot);
	const resolvedTargetRoot = path.resolve(workspaceRoot, targetRoot);
	if (isPathOutsideRoot(workspaceRoot, resolvedTargetRoot)) {
		throw new Error(
			`--target-root must stay within workspace (received: ${targetRoot}).`,
		);
	}

	let targetStat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		targetStat = await fs.lstat(resolvedTargetRoot);
	} catch (error) {
		if (isErrorWithCode(error, "ENOENT")) {
			throw new Error(
				`--target-root must exist and be a directory (received: ${targetRoot}).`,
				{ cause: error },
			);
		}
		throw new Error(
			`Failed to resolve target root (received: ${targetRoot}).`,
			{ cause: error },
		);
	}

	if (targetStat.isSymbolicLink()) {
		throw new Error(
			`--target-root must not be a symlink (received: ${targetRoot}).`,
		);
	}
	if (!targetStat.isDirectory()) {
		throw new Error(
			`--target-root must be a directory (received: ${targetRoot}).`,
		);
	}

	const targetRealPath = await fs.realpath(resolvedTargetRoot);
	if (isPathOutsideRoot(workspaceRealRoot, targetRealPath)) {
		throw new Error(
			`--target-root resolves outside workspace via symlink (received: ${targetRoot}).`,
		);
	}
	return resolvedTargetRoot;
}

function getNpmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function getNextBinPath(root: string): string {
	if (process.platform !== "win32") {
		try {
			const requireFromRoot = createRequire(path.resolve(root, "package.json"));
			return requireFromRoot.resolve("next/dist/bin/next");
		} catch {
			// Fall back to the local .bin path for fixture-style runtimes.
		}
	}
	return path.resolve(
		root,
		"node_modules",
		".bin",
		process.platform === "win32" ? "next.cmd" : "next",
	);
}

async function runCommand(input: {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
	env?: NodeJS.ProcessEnv;
}): Promise<void> {
	const result = await runProcess({
		command: input.command,
		args: input.args,
		cwd: input.cwd,
		env: input.env ?? process.env,
		timeoutMs: input.timeoutMs,
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.errorMessage) {
		throw new Error(result.errorMessage);
	}

	if (result.exitCode !== 0) {
		throw new Error(
			`${input.command} ${input.args.join(" ")} failed with code ${String(result.exitCode)}.\n${result.stdout}${result.stderr}`,
		);
	}
}

async function ensureRuntimeDeps(root: string): Promise<void> {
	const requireFromRoot = createRequire(path.resolve(root, "package.json"));
	const allInstalled = REQUIRED_NEXT_BUILD_PACKAGES.every((name) => {
		try {
			requireFromRoot.resolve(`${name}/package.json`);
			return true;
		} catch {
			return false;
		}
	});
	if (allInstalled) {
		return;
	}
	const managedSurface = await prepareManagedInstallSurface({
		rootDir: process.cwd(),
		targetRoot: root,
		env: process.env,
		ownerCommand: "prepare-next-app",
		rebuildCommand: "npm run prepare:next-app",
	});

	await runCommand({
		command: getNpmCommand(),
		args: ["install", "--no-audit", "--no-fund"],
		cwd: root,
		timeoutMs: DEFAULT_TIMEOUT_MS,
		env: managedSurface.env,
	});
}

async function getLatestMtimeMs(dirPath: string): Promise<number> {
	if (!(await pathExists(dirPath))) {
		return 0;
	}

	const stack = [dirPath];
	let latest = 0;

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.resolve(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(entryPath);
				continue;
			}
			const stat = await fs.stat(entryPath);
			if (stat.mtimeMs > latest) {
				latest = stat.mtimeMs;
			}
		}
	}

	return latest;
}

async function ensureBuild(root: string): Promise<void> {
	const buildDir = await resolveNextBuildDir(root);
	const buildMarker = path.resolve(buildDir, "BUILD_ID");
	const appDir = path.resolve(root, "app");

	if (await pathExists(buildMarker)) {
		const [buildStat, latestSourceMtime] = await Promise.all([
			fs.stat(buildMarker),
			getLatestMtimeMs(appDir),
		]);
		if (latestSourceMtime <= buildStat.mtimeMs) {
			return;
		}
	}

	await runCommand({
		command: getNextBinPath(root),
		args: ["build", "--webpack"],
		cwd: root,
		timeoutMs: DEFAULT_TIMEOUT_MS,
	});
}

async function main(): Promise<void> {
	const options = parseCliOptions(process.argv.slice(2));
	const targetRoot = await resolveSafeTargetRoot(options.targetRoot);
	const manifestStatus = await getTargetBuildManifestStatus({
		root: targetRoot,
		requiredPackages: REQUIRED_NEXT_BUILD_PACKAGES,
	});

	if (manifestStatus.valid) {
		process.stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					skipped: true,
					reason: manifestStatus.reason,
					manifestPath: manifestStatus.manifestPath,
					targetRoot,
				},
				null,
				2,
			)}\n`,
		);
		return;
	}

	await ensureRuntimeDeps(targetRoot);
	await ensureBuild(targetRoot);
	const manifestPath = await writeTargetBuildManifest({
		root: targetRoot,
		requiredPackages: REQUIRED_NEXT_BUILD_PACKAGES,
	});

	process.stdout.write(
		`${JSON.stringify(
			{
				ok: true,
				skipped: false,
				reason: manifestStatus.reason,
				manifestPath,
				targetRoot,
			},
			null,
			2,
		)}\n`,
	);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`[prepare-next-app] fatal: ${message}\n`);
	process.exit(1);
});
