import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	getTargetBuildManifestStatus,
	writeTargetBuildManifest,
} from "../../../packages/shared-runtime/src/target-build-manifest.js";
import { resolveNextBuildDir } from "../../../packages/shared-runtime/src/next-build-dir.js";

const INSTALL_TIMEOUT_MS = 180_000;
const BUILD_TIMEOUT_MS = 180_000;
const READY_TIMEOUT_MS = 30_000;
const START_RETRY_COUNT = 3;
const START_RETRY_DELAY_MS = 500;
const PREPARE_LOCK_TIMEOUT_MS = 120_000;
const PREPARE_LOCK_POLL_MS = 200;
const SERVER_LOCK_TIMEOUT_MS = 300_000;
const SERVER_LOCK_POLL_MS = 200;
const REQUIRED_NEXT_RUNTIME_PACKAGES = ["next", "react", "react-dom"] as const;

type CommandInput = {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
};

export type AppServer = {
	baseURL: string;
	appRoot: string;
	port: number;
	stop: () => Promise<void>;
};

type AppServerInput = {
	targetRoot?: string;
};

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function getDefaultAppRoot(): string {
	const currentFilePath = fileURLToPath(import.meta.url);
	const currentDir = path.dirname(currentFilePath);
	return path.resolve(currentDir, "..", "..", "..", "apps", "web");
}

function resolveAppRoot(input: AppServerInput | undefined): string {
	if (input?.targetRoot && input.targetRoot.trim().length > 0) {
		return path.resolve(input.targetRoot);
	}
	return getDefaultAppRoot();
}

function getNpmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function getNextBinPath(root: string): string {
	return path.resolve(
		root,
		"node_modules",
		".bin",
		process.platform === "win32" ? "next.cmd" : "next",
	);
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function runCommand(input: CommandInput): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const lines: string[] = [];
		const capture = (chunk: Buffer | string): void => {
			const text = String(chunk).trim();
			if (text.length > 0) {
				lines.push(text);
			}
			if (lines.length > 80) {
				lines.shift();
			}
		};

		child.stdout?.on("data", capture);
		child.stderr?.on("data", capture);

		const timer = setTimeout(() => {
			void terminateChild(child);
		}, input.timeoutMs);

		child.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});

		child.once("close", (code) => {
			clearTimeout(timer);
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`${input.command} ${input.args.join(" ")} failed with code ${String(code)}.\n${lines.join("\n")}`,
				),
			);
		});
	});
}

async function ensureRuntimeDeps(root: string): Promise<void> {
	const requiredFiles = [
		path.resolve(root, "node_modules", "next", "package.json"),
		path.resolve(root, "node_modules", "react", "package.json"),
		path.resolve(root, "node_modules", "react-dom", "package.json"),
	];
	const present = await Promise.all(requiredFiles.map(pathExists));
	if (present.every(Boolean)) {
		return;
	}

	await runCommand({
		command: getNpmCommand(),
		args: ["install", "--no-audit", "--no-fund"],
		cwd: root,
		timeoutMs: INSTALL_TIMEOUT_MS,
	});
}

async function ensureBuild(root: string): Promise<void> {
	const buildDir = await resolveNextBuildDir(root);
	const buildMarker = path.resolve(buildDir, "BUILD_ID");
	if (await pathExists(buildMarker)) {
		await fs.rm(buildDir, { recursive: true, force: true });
	}

	await runCommand({
		command: getNextBinPath(root),
		args: ["build"],
		cwd: root,
		timeoutMs: BUILD_TIMEOUT_MS,
	});
}

async function findOpenPort(): Promise<number> {
	const server = net.createServer();
	return await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to allocate local port."));
				return;
			}

			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

async function waitForServerReady(input: {
	url: string;
	child: ChildProcess;
}): Promise<void> {
	const startedAt = Date.now();
	let lastError = "unknown";
	let consecutiveReadyChecks = 0;

	while (Date.now() - startedAt < READY_TIMEOUT_MS) {
			if (input.child.exitCode !== null || input.child.signalCode !== null) {
				throw new Error(
					`App server exited before ready (code=${String(input.child.exitCode)}, signal=${String(input.child.signalCode)}).`,
				);
			}

		try {
			const response = await fetch(input.url, {
				signal: AbortSignal.timeout(1_000),
			});
			if (response.ok) {
				consecutiveReadyChecks += 1;
				if (consecutiveReadyChecks >= 2) {
					return;
				}
				await delay(100);
				continue;
			}
			lastError = `HTTP ${response.status}`;
			consecutiveReadyChecks = 0;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			consecutiveReadyChecks = 0;
		}

		await delay(200);
	}

	throw new Error(
		`App server did not become ready in ${READY_TIMEOUT_MS}ms (${lastError}).`,
	);
}

async function terminateChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	child.kill("SIGTERM");
	await Promise.race([
		new Promise((resolve) => child.once("exit", resolve)),
		delay(1_500),
	]);
	if (child.exitCode === null && child.signalCode === null) {
		child.kill("SIGKILL");
		await Promise.race([
			new Promise((resolve) => child.once("exit", resolve)),
			delay(1_500),
		]);
	}
}

function parseAppPrepareLockPid(contents: string): number | null {
	const [pidText] = contents.trim().split(":", 2);
	if (!pidText) {
		return null;
	}
	const pid = Number.parseInt(pidText, 10);
	if (!Number.isInteger(pid) || pid <= 0) {
		return null;
	}
	return pid;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (isErrnoException(error) && error.code === "EPERM") {
			return true;
		}
		return false;
	}
}

async function clearStaleAppPrepareLock(
	lockPath: string,
): Promise<boolean> {
	let contents: string;
	try {
		contents = await fs.readFile(lockPath, "utf8");
	} catch (error) {
		if (isErrnoException(error) && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
	const ownerPid = parseAppPrepareLockPid(contents);
	if (ownerPid !== null && isProcessAlive(ownerPid)) {
		return false;
	}
	await fs.rm(lockPath, { force: true });
	return true;
}

async function withAppPrepareLock<T>(
	root: string,
	action: () => Promise<T>,
): Promise<T> {
	const lockPath = path.resolve(root, ".runtime-cache", "app-prepare.lock");
	await fs.mkdir(path.dirname(lockPath), { recursive: true });
	const deadline = Date.now() + PREPARE_LOCK_TIMEOUT_MS;

	while (true) {
		try {
			const handle = await fs.open(lockPath, "wx");
			try {
				await handle.writeFile(`${process.pid}:${Date.now()}`, "utf8");
				return await action();
			} finally {
				await handle.close();
				await fs.rm(lockPath, { force: true });
			}
		} catch (error) {
			if (!(isErrnoException(error) && error.code === "EEXIST")) {
				throw error;
			}
				const staleLockCleared = await clearStaleAppPrepareLock(lockPath);
			if (staleLockCleared) {
				continue;
			}
			if (Date.now() >= deadline) {
					throw new Error(`Timed out waiting for app prepare lock: ${lockPath}`, {
						cause: error,
					});
			}
			await delay(PREPARE_LOCK_POLL_MS);
		}
	}
}

async function acquireAppServerLock(root: string): Promise<() => Promise<void>> {
	const lockPath = path.resolve(root, ".runtime-cache", "app-server.lock");
	await fs.mkdir(path.dirname(lockPath), { recursive: true });
	const deadline = Date.now() + SERVER_LOCK_TIMEOUT_MS;

	while (true) {
		try {
			const handle = await fs.open(lockPath, "wx");
			try {
				await handle.writeFile(`${process.pid}:${Date.now()}`, "utf8");
			} finally {
				await handle.close();
			}

			let released = false;
			return async () => {
				if (released) {
					return;
				}
				released = true;
				await fs.rm(lockPath, { force: true });
			};
		} catch (error) {
			if (!(isErrnoException(error) && error.code === "EEXIST")) {
				throw error;
			}

			const staleLockCleared = await clearStaleAppPrepareLock(lockPath);
			if (staleLockCleared) {
				continue;
			}
			if (Date.now() >= deadline) {
				throw new Error(`Timed out waiting for app server lock: ${lockPath}`, {
					cause: error,
				});
			}
			await delay(SERVER_LOCK_POLL_MS);
		}
	}
}

export async function startAppServer(
	input?: AppServerInput,
): Promise<AppServer> {
	const appRoot = resolveAppRoot(input);
	const releaseServerLock = await acquireAppServerLock(appRoot);
	try {
		await withAppPrepareLock(appRoot, async () => {
			const manifestStatus = await getTargetBuildManifestStatus({
				root: appRoot,
				requiredPackages: REQUIRED_NEXT_RUNTIME_PACKAGES,
			});
			if (!manifestStatus.valid) {
				await ensureRuntimeDeps(appRoot);
				await ensureBuild(appRoot);
				await writeTargetBuildManifest({
					root: appRoot,
					requiredPackages: REQUIRED_NEXT_RUNTIME_PACKAGES,
				});
			}
		});

		let lastError: unknown;
		for (let attempt = 1; attempt <= START_RETRY_COUNT; attempt += 1) {
			const port = await findOpenPort();
			const baseURL = `http://localhost:${port}/`;
			const child = spawn(
				getNextBinPath(appRoot),
				["start", "-p", String(port)],
				{
					cwd: appRoot,
					env: {
						...process.env,
						PORT: String(port),
					},
					stdio: ["ignore", "pipe", "pipe"],
				},
			);

			try {
				await waitForServerReady({ url: baseURL, child });
				return {
					baseURL,
					appRoot,
					port,
					stop: async () => {
						try {
							await terminateChild(child);
						} finally {
							await releaseServerLock();
						}
					},
				};
			} catch (error) {
				lastError = error;
				await terminateChild(child);
				if (attempt < START_RETRY_COUNT) {
					await delay(START_RETRY_DELAY_MS);
				}
			}
		}

		throw lastError instanceof Error ? lastError : new Error(String(lastError));
	} catch (error) {
		await releaseServerLock();
		throw error;
	}
}
