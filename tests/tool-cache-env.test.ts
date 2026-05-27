import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildRepoSpecificExternalToolCacheMetadata,
	computeRuntimeMarker,
	runToolCacheJanitor,
} from "../tooling/shared/tool-cache-env.mjs";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("tool cache env", () => {
	it("keeps the current Node version string in the runtime marker", async () => {
		const rootDir = await mkTempDir("openui-tool-cache-env-");
		await fs.writeFile(
			path.join(rootDir, "package-lock.json"),
			JSON.stringify({ name: "demo", lockfileVersion: 3 }, null, 2),
			"utf8",
		);

		const marker = await computeRuntimeMarker(rootDir);

		expect(marker).toContain(process.version);
	});

	it("surfaces repo-specific external cache metadata with workspace token paths", async () => {
		const rootDir = await mkTempDir("openui-tool-cache-meta-root-");
		const toolCacheBaseRoot = path.join(
			await mkTempDir("openui-tool-cache-meta-base-"),
			"tooling",
		);
		await fs.writeFile(
			path.join(rootDir, "package-lock.json"),
			JSON.stringify({ name: "demo", lockfileVersion: 3 }, null, 2),
			"utf8",
		);

		const metadata = await buildRepoSpecificExternalToolCacheMetadata({
			rootDir,
			env: {
				...process.env,
				OPENUI_TOOL_CACHE_ROOT: toolCacheBaseRoot,
			},
		});
		const normalizedToolCacheBaseRoot = toolCacheBaseRoot.replaceAll("\\", "/");

		expect(metadata.toolCacheBaseRoot).toBe(normalizedToolCacheBaseRoot);
		expect(metadata.workspaceToken).toMatch(/^[0-9a-f]{12}$/);
		expect(metadata.toolCacheRoot).toContain(metadata.workspaceToken);
		expect(metadata.targets.map((entry) => entry.id)).toEqual([
			"tool-cache-root",
			"playwright",
			"install",
			"managed-install",
			"trivy",
			"npm",
			"home",
			"pre-commit",
			"go-mod",
			"go-build",
			"go-path",
		]);
		expect(metadata.applyMode).toBe("janitor-managed");
		expect(metadata.janitorConfig.retentionDays).toBe(3);
		expect(metadata.janitorConfig.maxBytes).toBe(5 * 1024 ** 3);
		expect(
			metadata.targets.find((entry) => entry.id === "tool-cache-root"),
		).toMatchObject({
			measurement: "shallow",
			reportRole: "context-only",
		});
		expect(metadata.targets.find((entry) => entry.id === "home")).toMatchObject(
			{
				measurement: "shallow",
				reportRole: "context-only",
			},
		);
		expect(
			metadata.targets.find((entry) => entry.id === "playwright"),
		).toMatchObject({
			measurement: "recursive",
			reportRole: "sized-target",
		});
		expect(
			metadata.targets.every(
				(entry) =>
					entry.scope === "repo-specific-external" &&
					entry.applyMode === "janitor-managed" &&
					entry.path.startsWith(normalizedToolCacheBaseRoot),
			),
		).toBe(true);
	});

	it("applies TTL-first and capacity-prune janitor cleanup inside the configured tool-cache root", async () => {
		const rootDir = await mkTempDir("openui-tool-cache-janitor-root-");
		const toolCacheBaseRoot = path.join(
			await mkTempDir("openui-tool-cache-janitor-base-"),
			"tooling",
		);
		const env = {
			...process.env,
			OPENUI_TOOL_CACHE_ROOT: toolCacheBaseRoot,
			OPENUI_TOOL_CACHE_RETENTION_DAYS: "1",
			OPENUI_TOOL_CACHE_MAX_BYTES: "100",
			OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES: "60",
		};
		const metadata = await buildRepoSpecificExternalToolCacheMetadata({
			rootDir,
			env,
		});
		const expiredPath = path.join(
			metadata.toolCacheRoot,
			"playwright",
			"old-expired.bin",
		);
		const legacyInstallPath = path.join(
			toolCacheBaseRoot,
			"install",
			"old-install.bin",
		);
		const trivyPath = path.join(toolCacheBaseRoot, "trivy", "db", "cache.bin");
		const oldLargePath = path.join(
			metadata.toolCacheRoot,
			"npm",
			metadata.runtimeMarker,
			"old-large.bin",
		);
		const freshPath = path.join(metadata.toolCacheRoot, "home", "fresh.bin");
		const now = Date.now();
		const expiredSeconds = (now - 3 * 24 * 60 * 60 * 1000) / 1000;
		const oldSeconds = (now - 2 * 60 * 60 * 1000) / 1000;
		const freshSeconds = (now - 60 * 60 * 1000) / 1000;

		await Promise.all([
			fs.mkdir(path.dirname(expiredPath), { recursive: true }),
			fs.mkdir(path.dirname(legacyInstallPath), { recursive: true }),
			fs.mkdir(path.dirname(trivyPath), { recursive: true }),
			fs.mkdir(path.dirname(oldLargePath), { recursive: true }),
			fs.mkdir(path.dirname(freshPath), { recursive: true }),
		]);
		await Promise.all([
			fs.writeFile(expiredPath, "x".repeat(80), "utf8"),
			fs.writeFile(legacyInstallPath, "x".repeat(20), "utf8"),
			fs.writeFile(trivyPath, "x".repeat(20), "utf8"),
			fs.writeFile(oldLargePath, "x".repeat(70), "utf8"),
			fs.writeFile(freshPath, "x".repeat(40), "utf8"),
		]);
		await Promise.all([
			fs.utimes(expiredPath, expiredSeconds, expiredSeconds),
			fs.utimes(legacyInstallPath, expiredSeconds, expiredSeconds),
			fs.utimes(trivyPath, expiredSeconds, expiredSeconds),
			fs.utimes(oldLargePath, oldSeconds, oldSeconds),
			fs.utimes(freshPath, freshSeconds, freshSeconds),
		]);

		const receipt = await runToolCacheJanitor({
			rootDir,
			env,
			force: true,
		});

		expect(receipt.mode).toBe("apply");
		expect(receipt.bytesReclaimed).toBeGreaterThan(0);
		expect(receipt.removedExpiredPaths).toEqual(
			expect.arrayContaining([
				expiredPath.replaceAll("\\", "/"),
				legacyInstallPath.replaceAll("\\", "/"),
				trivyPath.replaceAll("\\", "/"),
			]),
		);
		expect(receipt.removedCapacityPaths).toEqual(
			expect.arrayContaining([oldLargePath.replaceAll("\\", "/")]),
		);
		await expect(fs.stat(expiredPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(fs.stat(legacyInstallPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(fs.stat(trivyPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(fs.stat(oldLargePath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(await fs.readFile(freshPath, "utf8")).toContain("x");
	});
});
