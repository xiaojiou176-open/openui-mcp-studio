#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MODE_REQUIRED = "required";
const MODE_ADVISORY = "advisory";
const WAIT_INTERVAL_MS = 300;
const WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const COVERAGE_ROOT = path.resolve(
	process.cwd(),
	".runtime-cache",
	"coverage",
	"vitest",
);
const COVERAGE_TMP = path.resolve(COVERAGE_ROOT, ".tmp");

function sanitizeRunKey(runKey) {
	return String(runKey ?? "")
		.trim()
		.replace(/[^A-Za-z0-9._-]/g, "-")
		.replace(/^-+|-+$/g, "") || "default";
}

function parseMode(argv) {
	for (const token of argv) {
		if (token.startsWith("--mode=")) {
			const mode = token.slice("--mode=".length).trim();
			if (mode === MODE_REQUIRED || mode === MODE_ADVISORY) {
				return mode;
			}
		}
	}
	return MODE_REQUIRED;
}

function getRunPaths() {
	const configuredRunKey = process.env.OPENUI_CI_GATE_RUN_KEY?.trim();
	const runKey = sanitizeRunKey(configuredRunKey || String(process.pid || "default"));
	const root = path.resolve(
		process.cwd(),
		".runtime-cache",
		"runs",
		runKey,
		"meta",
	);
	return {
		runKey,
		root,
		cacheFile: path.resolve(root, `test-coverage-${runKey}.json`),
		lockFile: path.resolve(root, `test-coverage-${runKey}.lock`),
	};
}

async function readCachedResult(cacheFile) {
	try {
		const raw = await readFile(cacheFile, "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed?.exitCode !== "number") {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

async function waitForCache(cacheFile) {
	const deadline = Date.now() + WAIT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const raw = await readFile(cacheFile, "utf8");
			return JSON.parse(raw);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
		}
	}
	throw new Error(
		`Timed out waiting for shared coverage result: ${path.relative(process.cwd(), cacheFile)}`,
	);
}

function runCoverageCommand() {
	const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
	return new Promise((resolve) => {
		const child = spawn(npmBin, ["run", "-s", "test:coverage"], {
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			stdout += chunk;
			process.stdout.write(chunk);
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk;
			process.stderr.write(chunk);
		});

		child.on("close", (code) => {
			resolve({
				exitCode: typeof code === "number" ? code : 1,
				stdout,
				stderr,
				finishedAt: new Date().toISOString(),
			});
		});

		child.on("error", (error) => {
			resolve({
				exitCode: 1,
				stdout,
				stderr: `${stderr}\n${error.message}`.trim(),
				finishedAt: new Date().toISOString(),
			});
		});
	});
}

async function runSharedCoverage(paths) {
	await mkdir(paths.root, { recursive: true });
	await mkdir(COVERAGE_ROOT, { recursive: true });
	await mkdir(COVERAGE_TMP, { recursive: true });
	const cached = await readCachedResult(paths.cacheFile);
	if (cached) {
		return cached;
	}

	/** @type {import("node:fs/promises").FileHandle | undefined} */
	let lockHandle;
	try {
		lockHandle = await open(paths.lockFile, "wx");
	} catch (error) {
		if (error && typeof error === "object" && error.code === "EEXIST") {
			return waitForCache(paths.cacheFile);
		}
		throw error;
	}

	try {
		const result = await runCoverageCommand();
		const payload = {
			...result,
			mode: "shared",
			runKey: paths.runKey,
			createdAt: new Date().toISOString(),
		};
		await writeFile(paths.cacheFile, JSON.stringify(payload, null, 2), "utf8");
		return payload;
	} finally {
		await lockHandle.close().catch(() => {});
		await unlink(paths.lockFile).catch(() => {});
	}
}

function printAdvisoryFailure(result) {
	process.stderr.write(
		`[ci:gate][advisory] test:coverage exited ${result.exitCode}; continuing because advisory mode is enabled.\n`,
	);
}

async function main() {
	const mode = parseMode(process.argv.slice(2));
	const paths = getRunPaths();
	const result = await runSharedCoverage(paths);

	if (result.exitCode === 0) {
		process.exit(0);
	}

	if (mode === MODE_ADVISORY) {
		printAdvisoryFailure(result);
		process.exit(0);
	}

	process.exit(result.exitCode);
}

main().catch((error) => {
	const message =
		error instanceof Error ? error.stack || error.message : String(error);
	process.stderr.write(`[ci:gate] run-test-coverage-once fatal: ${message}\n`);
	process.exit(1);
});
