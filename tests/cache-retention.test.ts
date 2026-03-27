import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isCacheCleanupDue,
	pruneCacheDirectorySync,
	resolveCacheRetentionConfigFromEnv,
} from "../packages/runtime-observability/src/cache-retention.js";

const createdCacheDirs = new Set<string>();

function createTempCacheDir(): string {
	const cacheDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "openui-cache-retention-"),
	);
	createdCacheDirs.add(cacheDir);
	return cacheDir;
}

afterEach(() => {
	vi.restoreAllMocks();

	for (const cacheDir of createdCacheDirs) {
		fs.rmSync(cacheDir, { recursive: true, force: true });
	}
	createdCacheDirs.clear();

	delete process.env.OPENUI_MCP_CACHE_DIR;
	delete process.env.OPENUI_MCP_CACHE_RETENTION_DAYS;
	delete process.env.OPENUI_MCP_CACHE_MAX_BYTES;
	delete process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES;
	delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
});

describe("cache retention", () => {
	it("prunes expired files and then applies max-bytes cap", () => {
		const cacheDir = createTempCacheDir();
		const expiredFilePath = path.join(cacheDir, "expired", "a.cache");
		const oldFilePath = path.join(cacheDir, "old", "b.cache");
		const freshFilePath = path.join(cacheDir, "fresh", "c.cache");
		const now = Date.now();

		fs.mkdirSync(path.dirname(expiredFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(oldFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(freshFilePath), { recursive: true });
		fs.writeFileSync(expiredFilePath, "x".repeat(20), "utf8");
		fs.writeFileSync(oldFilePath, "x".repeat(70), "utf8");
		fs.writeFileSync(freshFilePath, "x".repeat(70), "utf8");
		fs.utimesSync(
			expiredFilePath,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			oldFilePath,
			(now - 2 * 60 * 60 * 1000) / 1000,
			(now - 2 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			freshFilePath,
			(now - 60 * 60 * 1000) / 1000,
			(now - 60 * 60 * 1000) / 1000,
		);

		const summary = pruneCacheDirectorySync({
			cacheDir,
			retentionDays: 1,
			maxBytes: 100,
			cleanIntervalMinutes: 60,
			nowMs: now,
		});

		expect(summary.scannedFiles).toBe(3);
		expect(summary.removedExpiredFiles).toBe(1);
		expect(summary.removedCapacityFiles).toBe(1);
		expect(summary.bytesBefore).toBe(160);
		expect(summary.bytesAfter).toBe(70);
		expect(fs.existsSync(expiredFilePath)).toBe(false);
		expect(fs.existsSync(oldFilePath)).toBe(false);
		expect(fs.existsSync(freshFilePath)).toBe(true);
	});

	it("retains idempotency control files during expiry and capacity pressure", () => {
		const cacheDir = createTempCacheDir();
		const now = Date.now();
		const lockFilePath = path.join(cacheDir, "control", "writer.lock");
		const leaseFilePath = path.join(cacheDir, "control", "job.lease.json");
		const expiredCachePath = path.join(cacheDir, "expired", "old.cache");
		const oldCachePath = path.join(cacheDir, "cache", "old.cache");
		const freshCachePath = path.join(cacheDir, "cache", "fresh.cache");

		fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(leaseFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(expiredCachePath), { recursive: true });
		fs.mkdirSync(path.dirname(oldCachePath), { recursive: true });
		fs.mkdirSync(path.dirname(freshCachePath), { recursive: true });

		fs.writeFileSync(lockFilePath, "x".repeat(40), "utf8");
		fs.writeFileSync(leaseFilePath, "x".repeat(40), "utf8");
		fs.writeFileSync(expiredCachePath, "x".repeat(20), "utf8");
		fs.writeFileSync(oldCachePath, "x".repeat(70), "utf8");
		fs.writeFileSync(freshCachePath, "x".repeat(70), "utf8");

		fs.utimesSync(
			lockFilePath,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			leaseFilePath,
			(now - 2 * 60 * 60 * 1000) / 1000,
			(now - 2 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			expiredCachePath,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			oldCachePath,
			(now - 2 * 60 * 60 * 1000) / 1000,
			(now - 2 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			freshCachePath,
			(now - 60 * 60 * 1000) / 1000,
			(now - 60 * 60 * 1000) / 1000,
		);

		const summary = pruneCacheDirectorySync({
			cacheDir,
			retentionDays: 1,
			maxBytes: 100,
			cleanIntervalMinutes: 60,
			nowMs: now,
		});

		expect(summary.scannedFiles).toBe(5);
		expect(summary.removedExpiredFiles).toBe(1);
		expect(summary.removedCapacityFiles).toBe(2);
		expect(summary.bytesBefore).toBe(240);
		expect(summary.bytesAfter).toBe(80);
		expect(fs.existsSync(lockFilePath)).toBe(true);
		expect(fs.existsSync(leaseFilePath)).toBe(true);
		expect(fs.existsSync(expiredCachePath)).toBe(false);
		expect(fs.existsSync(oldCachePath)).toBe(false);
		expect(fs.existsSync(freshCachePath)).toBe(false);
	});

	it("resolves retention config from env and rejects invalid numeric values", () => {
		process.env.OPENUI_MCP_CACHE_DIR = " ./tmp-cache ";
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "2048";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "30";

		const config = resolveCacheRetentionConfigFromEnv(123);
		expect(config.cacheDir).toBe(path.resolve("./tmp-cache"));
		expect(config.retentionDays).toBe(7);
		expect(config.maxBytes).toBe(2048);
		expect(config.cleanIntervalMinutes).toBe(30);
		expect(config.nowMs).toBe(123);

		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "0";
		expect(() => resolveCacheRetentionConfigFromEnv()).toThrow(
			/OPENUI_MCP_CACHE_MAX_BYTES must be a positive integer/,
		);
	});

	it("rejects cache dir that resolves outside workspace root", () => {
		const workspaceRoot = createTempCacheDir();
		const outsideTarget = path.join(
			path.dirname(workspaceRoot),
			`outside-cache-${Date.now().toString(36)}`,
		);

		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = outsideTarget;
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "2048";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "30";

		expect(() => resolveCacheRetentionConfigFromEnv()).toThrow(
			/OPENUI_MCP_CACHE_DIR must resolve inside OPENUI_MCP_WORKSPACE_ROOT/,
		);
	});

	it("resolves default cache dir under workspace root", () => {
		const workspaceRoot = createTempCacheDir();
		const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		delete process.env.OPENUI_MCP_CACHE_DIR;
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "2048";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "30";

		const config = resolveCacheRetentionConfigFromEnv(456);
		expect(config.cacheDir).toBe(
			path.join(canonicalWorkspaceRoot, ".runtime-cache/cache"),
		);
		expect(config.nowMs).toBe(456);
	});

	it("skips files that fail to unlink and uses lexical order when mtimes tie", () => {
		const cacheDir = createTempCacheDir();
		const aPath = path.join(cacheDir, "same-time", "a.cache");
		const bPath = path.join(cacheDir, "same-time", "b.cache");
		const cPath = path.join(cacheDir, "same-time", "c.cache");
		const now = Date.now();

		fs.mkdirSync(path.dirname(aPath), { recursive: true });
		fs.writeFileSync(aPath, "x".repeat(40), "utf8");
		fs.writeFileSync(bPath, "x".repeat(40), "utf8");
		fs.writeFileSync(cPath, "x".repeat(40), "utf8");

		const sameTimeSec = (now - 60_000) / 1000;
		fs.utimesSync(aPath, sameTimeSec, sameTimeSec);
		fs.utimesSync(bPath, sameTimeSec, sameTimeSec);
		fs.utimesSync(cPath, sameTimeSec, sameTimeSec);

		const originalUnlink = fs.unlinkSync.bind(fs);
		const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(((
			filePath: fs.PathLike,
		) => {
			if (String(filePath) === aPath) {
				throw new Error("simulated lock");
			}
			return originalUnlink(filePath);
		}) as typeof fs.unlinkSync);

		const summary = pruneCacheDirectorySync({
			cacheDir,
			retentionDays: 1,
			maxBytes: 70,
			cleanIntervalMinutes: 60,
			nowMs: now,
		});

		expect(summary.removedExpiredFiles).toBe(0);
		expect(summary.removedCapacityFiles).toBe(2);
		expect(fs.existsSync(aPath)).toBe(true);
		expect(fs.existsSync(path.dirname(aPath))).toBe(true);
		unlinkSpy.mockRestore();
	});

	it("returns interval decision for runtime cleanup scheduling", () => {
		const now = Date.now();

		expect(isCacheCleanupDue(null, now, 15)).toBe(true);
		expect(isCacheCleanupDue(now - 5 * 60 * 1000, now, 15)).toBe(false);
		expect(isCacheCleanupDue(now - 15 * 60 * 1000, now, 15)).toBe(true);
		expect(isCacheCleanupDue(now - 40 * 60 * 1000, now, 15)).toBe(true);
	});

	it("does not remove capacity files when bytes stay under limit", () => {
		const cacheDir = createTempCacheDir();
		const freshFilePath = path.join(cacheDir, "fresh", "kept.cache");
		const now = Date.now();

		fs.mkdirSync(path.dirname(freshFilePath), { recursive: true });
		fs.writeFileSync(freshFilePath, "x".repeat(16), "utf8");
		fs.utimesSync(
			freshFilePath,
			(now - 60 * 1000) / 1000,
			(now - 60 * 1000) / 1000,
		);

		const summary = pruneCacheDirectorySync({
			cacheDir,
			retentionDays: 7,
			maxBytes: 1024,
			cleanIntervalMinutes: 60,
			nowMs: now,
		});

		expect(summary.scannedFiles).toBe(1);
		expect(summary.removedExpiredFiles).toBe(0);
		expect(summary.removedCapacityFiles).toBe(0);
		expect(summary.bytesBefore).toBe(16);
		expect(summary.bytesAfter).toBe(16);
		expect(fs.existsSync(freshFilePath)).toBe(true);
	});

	it("keeps expired file in accounting when unlink fails during retention cleanup", () => {
		const cacheDir = createTempCacheDir();
		const expiredFilePath = path.join(cacheDir, "expired", "blocked.cache");
		const freshFilePath = path.join(cacheDir, "fresh", "kept.cache");
		const now = Date.now();

		fs.mkdirSync(path.dirname(expiredFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(freshFilePath), { recursive: true });
		fs.writeFileSync(expiredFilePath, "x".repeat(80), "utf8");
		fs.writeFileSync(freshFilePath, "x".repeat(40), "utf8");
		fs.utimesSync(
			expiredFilePath,
			(now - 2 * 24 * 60 * 60 * 1000) / 1000,
			(now - 2 * 24 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			freshFilePath,
			(now - 60 * 1000) / 1000,
			(now - 60 * 1000) / 1000,
		);

		const originalUnlink = fs.unlinkSync.bind(fs);
		const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(((
			filePath: fs.PathLike,
		) => {
			if (String(filePath) === expiredFilePath) {
				const error = new Error("blocked");
				Object.assign(error, { code: "EPERM" });
				throw error;
			}
			return originalUnlink(filePath);
		}) as typeof fs.unlinkSync);

		const summary = pruneCacheDirectorySync({
			cacheDir,
			retentionDays: 1,
			maxBytes: 1_024,
			cleanIntervalMinutes: 60,
			nowMs: now,
		});

		expect(summary.scannedFiles).toBe(2);
		expect(summary.removedExpiredFiles).toBe(0);
		expect(summary.removedCapacityFiles).toBe(0);
		expect(summary.bytesBefore).toBe(120);
		expect(summary.bytesAfter).toBe(120);
		expect(fs.existsSync(expiredFilePath)).toBe(true);
		expect(fs.existsSync(freshFilePath)).toBe(true);
		unlinkSpy.mockRestore();
	});
});
