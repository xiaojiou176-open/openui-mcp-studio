import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const cleanRuntimeScript = path.join(repoRoot, "tooling", "clean-runtime.mjs");

async function createFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeRuntimePathRegistry(rootDir: string) {
	await createFile(
		path.join(rootDir, "contracts", "runtime", "path-registry.json"),
		`${JSON.stringify(
			{
				version: 2,
				categories: {
					build: { paths: [".runtime-cache/build"] },
					runLogs: { paths: [".runtime-cache/runs"] },
					cache: { paths: [".runtime-cache/cache"] },
					reports: { paths: [".runtime-cache/reports/quality-trend"] },
					toolMeta: { paths: [".runtime-cache/env-keyset-drift"] },
				},
				cleanPolicy: {
					resetOnClean: [".runtime-cache/build", ".runtime-cache/cache"],
					purgeOnClean: [
						".runtime-cache/runs",
						".runtime-cache/reports/quality-trend",
					],
					retentionOnly: [".runtime-cache/cache", ".runtime-cache/runs"],
				},
			},
			null,
			2,
		)}\n`,
	);
}

describe("clean runtime script", () => {
	it("cleans runtime folders and preserves directory structure", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-"),
		);
		const unaffectedFile = path.join(tempRoot, "keep", "note.txt");
		const runtimeTargets = [
			path.join(
				tempRoot,
				".runtime-cache",
				"runs",
				"run-123",
				"logs",
				"runtime.jsonl",
			),
			path.join(tempRoot, ".runtime-cache", "cache", "cache.json"),
			path.join(tempRoot, ".runtime-cache", "build", "mcp-server", "bundle.js"),
		];

		try {
			await writeRuntimePathRegistry(tempRoot);
			await Promise.all([
				...runtimeTargets.map((filePath) => createFile(filePath, "data")),
				createFile(unaffectedFile, "keep"),
			]);

			await execFileAsync(process.execPath, [cleanRuntimeScript], {
				cwd: tempRoot,
			});

			const targetDirs = [
				path.join(tempRoot, ".runtime-cache", "build"),
				path.join(tempRoot, ".runtime-cache", "cache"),
			];

			for (const dirPath of targetDirs) {
				const stat = await fs.stat(dirPath);
				expect(stat.isDirectory()).toBe(true);
				const entries = await fs.readdir(dirPath);
				expect(entries).toEqual([]);
			}
			await expect(
				fs.stat(path.join(tempRoot, ".runtime-cache", "runs")),
			).rejects.toMatchObject({ code: "ENOENT" });

			expect(await fs.readFile(unaffectedFile, "utf8")).toBe("keep");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("supports --dry-run and only reports target directories", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-dry-run-"),
		);
		const runtimeTargets = [
			path.join(
				tempRoot,
				".runtime-cache",
				"runs",
				"run-123",
				"logs",
				"runtime.jsonl",
			),
			path.join(tempRoot, ".runtime-cache", "cache", "cache.json"),
			path.join(tempRoot, ".runtime-cache", "build", "mcp-server", "bundle.js"),
		];

		try {
			await writeRuntimePathRegistry(tempRoot);
			await Promise.all(
				runtimeTargets.map((filePath) => createFile(filePath, "data")),
			);

			const { stdout } = await execFileAsync(
				process.execPath,
				[cleanRuntimeScript, "--dry-run"],
				{
					cwd: tempRoot,
				},
			);

			expect(stdout).toContain("[clean:runtime] dry-run targets:");
			for (const targetDir of [
				path.join(tempRoot, ".runtime-cache", "build"),
				path.join(tempRoot, ".runtime-cache", "cache"),
				path.join(tempRoot, ".runtime-cache", "runs"),
			]) {
				expect(stdout).toContain(targetDir);
			}

			for (const targetFile of runtimeTargets) {
				expect(await fs.readFile(targetFile, "utf8")).toBe("data");
			}
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("rejects targets outside workspace and aborts cleaning", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-unsafe-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-outside-"),
		);
		const cacheFile = path.join(
			tempRoot,
			".runtime-cache",
			"cache",
			"cache.json",
		);
		const outsideLogDir = path.join(outsideRoot, "logs");

		try {
			await writeRuntimePathRegistry(tempRoot);
			await createFile(cacheFile, "keep");

			const runPromise = execFileAsync(process.execPath, [cleanRuntimeScript], {
				cwd: tempRoot,
				env: {
					...process.env,
					OPENUI_MCP_CACHE_DIR: outsideLogDir,
				},
			});

			await expect(runPromise).rejects.toMatchObject({ code: 1 });
			await expect(runPromise).rejects.toMatchObject({
				stderr: expect.stringContaining("unsafe target outside workspace"),
			});
			expect(await fs.readFile(cacheFile, "utf8")).toBe("keep");
		} finally {
			await Promise.all([
				fs.rm(tempRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("rejects symlink ancestors that resolve cleanup targets outside workspace", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-symlink-ancestor-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-symlink-outside-"),
		);
		const runtimeCacheLink = path.join(tempRoot, ".runtime-cache");
		const outsideLogFile = path.join(outsideRoot, "logs", "outside.log");
		const unaffectedFile = path.join(tempRoot, "keep", "bundle.js");

		try {
			await writeRuntimePathRegistry(tempRoot);
			await Promise.all([
				createFile(outsideLogFile, "outside-data"),
				createFile(unaffectedFile, "inside-data"),
			]);
			await fs.symlink(outsideRoot, runtimeCacheLink, "dir");

			const runPromise = execFileAsync(process.execPath, [cleanRuntimeScript], {
				cwd: tempRoot,
			});

			await expect(runPromise).rejects.toMatchObject({ code: 1 });
			await expect(runPromise).rejects.toMatchObject({
				stderr: expect.stringContaining("unsafe symlink ancestor detected"),
			});
			expect(await fs.readFile(outsideLogFile, "utf8")).toBe("outside-data");
			expect(await fs.readFile(unaffectedFile, "utf8")).toBe("inside-data");
		} finally {
			await Promise.all([
				fs.rm(tempRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("supports cache retention-only cleanup mode", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-cache-policy-"),
		);
		const cacheDir = path.join(tempRoot, ".runtime-cache", "cache");
		const expiredFile = path.join(cacheDir, "expired", "a.cache");
		const oldFile = path.join(cacheDir, "old", "b.cache");
		const freshFile = path.join(cacheDir, "fresh", "c.cache");
		const now = Date.now();

		try {
			await writeRuntimePathRegistry(tempRoot);
			await Promise.all([
				createFile(expiredFile, "x".repeat(20)),
				createFile(oldFile, "x".repeat(70)),
				createFile(freshFile, "x".repeat(70)),
			]);

			await fs.utimes(
				expiredFile,
				(now - 3 * 24 * 60 * 60 * 1000) / 1000,
				(now - 3 * 24 * 60 * 60 * 1000) / 1000,
			);
			await fs.utimes(
				oldFile,
				(now - 2 * 60 * 60 * 1000) / 1000,
				(now - 2 * 60 * 60 * 1000) / 1000,
			);
			await fs.utimes(
				freshFile,
				(now - 60 * 60 * 1000) / 1000,
				(now - 60 * 60 * 1000) / 1000,
			);

			const { stdout } = await execFileAsync(
				process.execPath,
				[cleanRuntimeScript, "--cache-retention-only"],
				{
					cwd: tempRoot,
					env: {
						...process.env,
						OPENUI_MCP_CACHE_RETENTION_DAYS: "1",
						OPENUI_MCP_CACHE_MAX_BYTES: "100",
					},
				},
			);

			expect(stdout).toContain("cache retention cleaned");
			await expect(fs.stat(cacheDir)).resolves.toMatchObject({
				isDirectory: expect.any(Function),
			});
			await expect(fs.stat(expiredFile)).rejects.toMatchObject({
				code: "ENOENT",
			});
			await expect(fs.stat(oldFile)).rejects.toMatchObject({ code: "ENOENT" });
			expect(await fs.readFile(freshFile, "utf8")).toBe("x".repeat(70));
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("supports --include-e2e-artifacts mode for extended cleanup targets", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-extended-"),
		);
		const runtimeTargets = [
			path.join(
				tempRoot,
				".runtime-cache",
				"runs",
				"run-123",
				"logs",
				"runtime.jsonl",
			),
			path.join(tempRoot, ".runtime-cache", "cache", "cache.json"),
			path.join(tempRoot, ".runtime-cache", "build", "mcp-server", "bundle.js"),
		];
		const extendedTargets = [
			path.join(tempRoot, ".runtime-cache", "ci-gate", "summary.json"),
			path.join(tempRoot, ".runtime-cache", "evidence", "index.json"),
			path.join(tempRoot, ".runtime-cache", "logs", "local.log"),
			path.join(
				tempRoot,
				".runtime-cache",
				"reports",
				"quality-trend",
				"report.json",
			),
		];

		try {
			await writeRuntimePathRegistry(tempRoot);
			await Promise.all(
				[...runtimeTargets, ...extendedTargets].map((filePath) =>
					createFile(filePath, "data"),
				),
			);

			await execFileAsync(
				process.execPath,
				[cleanRuntimeScript, "--include-e2e-artifacts"],
				{
					cwd: tempRoot,
				},
			);

			const recreatedDirs = [
				path.join(tempRoot, ".runtime-cache", "build"),
				path.join(tempRoot, ".runtime-cache", "cache"),
			];
			const purgedDirs = [
				path.join(tempRoot, ".runtime-cache", "runs"),
				path.join(tempRoot, ".runtime-cache", "artifacts"),
				path.join(tempRoot, ".runtime-cache", "ci-gate"),
				path.join(tempRoot, ".runtime-cache", "evidence"),
				path.join(tempRoot, ".runtime-cache", "logs"),
				path.join(tempRoot, ".runtime-cache", "reports", "quality-trend"),
			];

			for (const dirPath of recreatedDirs) {
				const stat = await fs.stat(dirPath);
				expect(stat.isDirectory()).toBe(true);
				const entries = await fs.readdir(dirPath);
				expect(entries).toEqual([]);
			}
			for (const dirPath of purgedDirs) {
				await expect(fs.stat(dirPath)).rejects.toMatchObject({
					code: "ENOENT",
				});
			}
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("removes browser tmp runtime leftovers under .runtime-cache", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-clean-runtime-browser-tmp-"),
		);

		try {
			await writeRuntimePathRegistry(tempRoot);
			await Promise.all([
				createFile(
					path.join(
						tempRoot,
						".runtime-cache",
						"tmp-firefox",
						".last-run.json",
					),
					'{"status":"failed"}',
				),
				createFile(
					path.join(
						tempRoot,
						".runtime-cache",
						"tmp-webkit-clean",
						"artifact.txt",
					),
					"artifact",
				),
			]);

			await execFileAsync(process.execPath, [cleanRuntimeScript], {
				cwd: tempRoot,
			});

			await expect(
				fs.stat(path.join(tempRoot, ".runtime-cache", "tmp-firefox")),
			).rejects.toMatchObject({ code: "ENOENT" });
			await expect(
				fs.stat(path.join(tempRoot, ".runtime-cache", "tmp-webkit-clean")),
			).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
