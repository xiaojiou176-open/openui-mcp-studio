import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	pruneCacheDirectorySync,
	resolveCacheRetentionConfigFromEnv,
} from "../packages/runtime-observability/src/cache-retention.js";

const originalEnv = new Map<string, string | undefined>(
	[
		"OPENUI_MCP_WORKSPACE_ROOT",
		"OPENUI_MCP_CACHE_DIR",
		"OPENUI_MCP_CACHE_RETENTION_DAYS",
		"OPENUI_MCP_CACHE_MAX_BYTES",
		"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
	].map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];

function restoreEnv(): void {
	for (const [key, value] of originalEnv) {
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	restoreEnv();
	vi.restoreAllMocks();
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("cache retention low-core branches", () => {
	it("rejects workspace root when it resolves to a file path", () => {
		const rootDir = mkTempDir("openui-cache-root-file-");
		const rootFile = path.join(rootDir, "workspace.txt");
		fs.writeFileSync(rootFile, "not-a-directory", "utf8");

		process.env.OPENUI_MCP_WORKSPACE_ROOT = rootFile;
		process.env.OPENUI_MCP_CACHE_DIR = ".runtime-cache/cache";

		expect(() => resolveCacheRetentionConfigFromEnv()).toThrow(
			/OPENUI_MCP_WORKSPACE_ROOT must point to a directory/,
		);
	});

	it("uses default numeric config when env values are unset", () => {
		const workspaceRoot = mkTempDir("openui-cache-defaults-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		delete process.env.OPENUI_MCP_CACHE_DIR;
		delete process.env.OPENUI_MCP_CACHE_RETENTION_DAYS;
		delete process.env.OPENUI_MCP_CACHE_MAX_BYTES;
		delete process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES;

		const config = resolveCacheRetentionConfigFromEnv(789);
		expect(config.cacheDir).toBe(
			path.join(fs.realpathSync(workspaceRoot), ".runtime-cache/cache"),
		);
		expect(config.retentionDays).toBeGreaterThan(0);
		expect(config.maxBytes).toBeGreaterThan(0);
		expect(config.cleanIntervalMinutes).toBeGreaterThan(0);
		expect(config.nowMs).toBe(789);
	});

	it("skips non-file dir entries and treats ENOENT unlink as removed", () => {
		const cacheDir = mkTempDir("openui-cache-enoent-");
		const externalTarget = path.join(cacheDir, "external-target.txt");
		const symlinkPath = path.join(cacheDir, "symlink-entry");
		const expiredFilePath = path.join(cacheDir, "expired.cache");
		const now = Date.now();

		fs.writeFileSync(externalTarget, "external", "utf8");
		fs.writeFileSync(expiredFilePath, "old", "utf8");
		try {
			fs.symlinkSync(externalTarget, symlinkPath);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EPERM") {
				throw error;
			}
		}
		fs.utimesSync(
			expiredFilePath,
			(now - 2 * 24 * 60 * 60 * 1000) / 1000,
			(now - 2 * 24 * 60 * 60 * 1000) / 1000,
		);

		const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(((
			filePath: fs.PathLike,
		) => {
			if (String(filePath) === expiredFilePath) {
				const enoent = new Error("missing");
				Object.assign(enoent, { code: "ENOENT" });
				throw enoent;
			}
			return undefined;
		}) as typeof fs.unlinkSync);

		const summary = pruneCacheDirectorySync({
			cacheDir,
			retentionDays: 1,
			maxBytes: 1024,
			cleanIntervalMinutes: 10,
			nowMs: now,
		});

		expect(summary.scannedFiles).toBe(2);
		expect(summary.removedExpiredFiles).toBe(1);
		expect(summary.removedCapacityFiles).toBe(0);
		expect(unlinkSpy).toHaveBeenCalledWith(expiredFilePath);
	});
});
