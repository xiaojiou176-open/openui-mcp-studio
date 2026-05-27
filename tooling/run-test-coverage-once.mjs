#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
	cp,
	mkdir,
	open,
	readFile,
	readdir,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import istanbulCoverage from "istanbul-lib-coverage";
import istanbulReport from "istanbul-lib-report";
import istanbulReports from "istanbul-reports";

const { createCoverageMap } = istanbulCoverage;
const { createContext } = istanbulReport;
const reports = istanbulReports;

const MODE_REQUIRED = "required";
const MODE_ADVISORY = "advisory";
const WAIT_INTERVAL_MS = 300;
const WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 32;
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
		coverageRoot: path.resolve(
			process.cwd(),
			".runtime-cache",
			"runs",
			runKey,
			"artifacts",
			"coverage",
			"vitest",
		),
	};
}

function toPosixPath(value) {
	return String(value).replaceAll(path.sep, "/");
}

function parseBatchSizeFromEnv(env = process.env) {
	const raw = env.OPENUI_COVERAGE_BATCH_SIZE?.trim();
	if (!raw) {
		return DEFAULT_BATCH_SIZE;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return DEFAULT_BATCH_SIZE;
	}
	return parsed;
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

async function discoverCoverageTestFiles(rootDir) {
	const includeRoots = [
		path.resolve(rootDir, "tests"),
		path.resolve(rootDir, "packages"),
		path.resolve(rootDir, "services", "mcp-server", "src"),
	];
	const discovered = [];

	async function walk(currentDir) {
		let entries;
		try {
			entries = await readdir(currentDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (entry.name === "dist" || entry.name === "node_modules") {
				continue;
			}
			const absolutePath = path.join(currentDir, entry.name);
			const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
			if (entry.isDirectory()) {
				if (relativePath === "tests/e2e" || relativePath === "tests/artifacts") {
					continue;
				}
				await walk(absolutePath);
				continue;
			}
			if (!entry.isFile() || !entry.name.endsWith(".test.ts")) {
				continue;
			}
			discovered.push(relativePath);
		}
	}

	for (const includeRoot of includeRoots) {
		await walk(includeRoot);
	}

	return discovered.sort((left, right) => left.localeCompare(right));
}

function chunkArray(items, chunkSize) {
	const chunks = [];
	for (let index = 0; index < items.length; index += chunkSize) {
		chunks.push(items.slice(index, index + chunkSize));
	}
	return chunks;
}

function runCoverageCommand(input) {
	const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
	return new Promise((resolve) => {
		const reportsDirectory = toPosixPath(
			path.relative(process.cwd(), input.reportsDirectory),
		);
		const testFiles = Array.isArray(input.testFiles) ? input.testFiles : [];
		const child = spawn(
			npmBin,
			[
				"run",
				"-s",
				"test:coverage",
				"--",
				"--maxWorkers=1",
				"--coverage.reporter=text",
				"--coverage.reporter=json",
				"--coverage.reporter=json-summary",
				"--coverage.reporter=lcov",
				`--coverage.reportsDirectory=${reportsDirectory}`,
				...testFiles,
			],
			{
				stdio: ["ignore", "pipe", "pipe"],
				env: input.env ?? process.env,
			},
		);

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

async function mergeBatchCoverageReports(paths, batchDirs) {
	const coverageMap = createCoverageMap({});

	for (const batchDir of batchDirs) {
		const finalCoveragePath = path.join(batchDir, "coverage-final.json");
		const raw = await readFile(finalCoveragePath, "utf8");
		coverageMap.merge(JSON.parse(raw));
	}

	await rm(paths.coverageRoot, { recursive: true, force: true });
	await mkdir(paths.coverageRoot, { recursive: true });
	await writeFile(
		path.join(paths.coverageRoot, "coverage-final.json"),
		JSON.stringify(coverageMap.toJSON()),
		"utf8",
	);

	const reportContext = createContext({
		dir: paths.coverageRoot,
		coverageMap,
		defaultSummarizer: "nested",
	});
	reports.create("json-summary").execute(reportContext);
}

async function syncCanonicalCoverageRoot(paths) {
	await rm(COVERAGE_ROOT, { recursive: true, force: true });
	await mkdir(path.dirname(COVERAGE_ROOT), { recursive: true });
	await cp(paths.coverageRoot, COVERAGE_ROOT, {
		recursive: true,
		force: true,
		errorOnExist: false,
	});
}

async function runSharedCoverage(paths) {
	const rootDir = process.cwd();
	await mkdir(paths.root, { recursive: true });
	await mkdir(COVERAGE_ROOT, { recursive: true });
	await mkdir(COVERAGE_TMP, { recursive: true });
	await rm(paths.coverageRoot, { recursive: true, force: true });
	await mkdir(paths.coverageRoot, { recursive: true });
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
		const discoveredTestFiles = await discoverCoverageTestFiles(rootDir);
		const batchSize = parseBatchSizeFromEnv();
		const batches =
			discoveredTestFiles.length > batchSize
				? chunkArray(discoveredTestFiles, batchSize)
				: [discoveredTestFiles];
		let result;

		if (batches.length === 1) {
			result = await runCoverageCommand({
				reportsDirectory: paths.coverageRoot,
				testFiles: batches[0],
			});
		} else {
			const batchDirs = [];
			let mergedStdout = "";
			let mergedStderr = "";
			let exitCode = 0;

			for (const [index, batchFiles] of batches.entries()) {
				const batchDir = path.join(
					paths.coverageRoot,
					"batches",
					`batch-${String(index + 1).padStart(2, "0")}`,
				);
				batchDirs.push(batchDir);
				await rm(batchDir, { recursive: true, force: true });
				await mkdir(batchDir, { recursive: true });

				const batchResult = await runCoverageCommand({
					reportsDirectory: batchDir,
					testFiles: batchFiles,
					env: {
						...process.env,
						OPENUI_BATCH_COVERAGE: "1",
					},
				});
				mergedStdout += batchResult.stdout;
				mergedStderr += batchResult.stderr;
				if (batchResult.exitCode !== 0) {
					exitCode = batchResult.exitCode;
					result = {
						exitCode,
						stdout: mergedStdout,
						stderr: mergedStderr,
						finishedAt: batchResult.finishedAt,
					};
					break;
				}
			}

			if (!result) {
				await mergeBatchCoverageReports(paths, batchDirs);
				result = {
					exitCode,
					stdout: mergedStdout,
					stderr: mergedStderr,
					finishedAt: new Date().toISOString(),
				};
			}
		}

		await syncCanonicalCoverageRoot(paths).catch(() => {});
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
