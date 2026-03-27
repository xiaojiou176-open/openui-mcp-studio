import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdempotencyStore } from "../packages/shared-runtime/src/idempotency-store.js";

const tempDirs: string[] = [];
const ENV_KEYS = ["OPENUI_MCP_WORKSPACE_ROOT", "OPENUI_MCP_CACHE_DIR"] as const;
const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

async function createTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function leasePath(cacheDir: string, key: string): string {
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return path.join(cacheDir, `openui-ship-${hash}.lease.json`);
}

function lockPath(cacheDir: string, key: string): string {
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return path.join(cacheDir, `openui-ship-${hash}.lock`);
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	vi.restoreAllMocks();
});

describe("idempotency store branch coverage", () => {
	it("rejects default cache dir when OPENUI_MCP_CACHE_DIR escapes workspace root", async () => {
		const workspaceRoot = await createTempDir(
			"openui-idempotency-store-workspace-",
		);
		const outsideRoot = await createTempDir(
			"openui-idempotency-store-outside-",
		);
		const previousWorkspaceRoot = process.env.OPENUI_MCP_WORKSPACE_ROOT;
		const previousCacheDir = process.env.OPENUI_MCP_CACHE_DIR;

		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(outsideRoot, "cache");

		try {
			expect(() => new IdempotencyStore()).toThrow(
				/OPENUI_MCP_CACHE_DIR must resolve inside OPENUI_MCP_WORKSPACE_ROOT/,
			);
		} finally {
			if (previousWorkspaceRoot === undefined) {
				delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
			} else {
				process.env.OPENUI_MCP_WORKSPACE_ROOT = previousWorkspaceRoot;
			}
			if (previousCacheDir === undefined) {
				delete process.env.OPENUI_MCP_CACHE_DIR;
			} else {
				process.env.OPENUI_MCP_CACHE_DIR = previousCacheDir;
			}
		}
	});

	it("returns timeout_missing when no value or active lease exists", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		let now = 0;
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 1,
			now: () => {
				now += 10;
				return now;
			},
		});

		const result = await store.waitFor("missing-key", {
			timeoutMs: 15,
			intervalMs: 1,
		});

		expect(result).toEqual({ status: "timeout_missing" });
	});

	it("replaces malformed lease records when acquiring execution ownership", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "malformed-lease";
		await fs.writeFile(leasePath(cacheDir, key), "{broken-json", "utf8");

		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const result = await store.beginExecution(key, { leaseMs: 1_000 });

		expect(result.status).toBe("acquired");
		if (result.status !== "acquired") {
			return;
		}

		const storedLease = JSON.parse(
			await fs.readFile(leasePath(cacheDir, key), "utf8"),
		) as {
			ownerId: string;
			expiresAtMs: number;
		};

		expect(storedLease.ownerId).toBe(result.lease.ownerId);
		expect(storedLease.expiresAtMs).toBeGreaterThan(Date.now());
	});

	it("rejects completion if lease has already expired", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		let now = 1_000;
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
			now: () => now,
		});

		const result = await store.beginExecution<{ ok: boolean }>(
			"expired-complete",
			{
				leaseMs: 5,
			},
		);

		expect(result.status).toBe("acquired");
		if (result.status !== "acquired") {
			return;
		}

		now += 10;

		await expect(result.lease.complete({ ok: true })).rejects.toThrow(
			/Lost idempotency execution lease/,
		);
	});

	it("cleans temporary payload file when completion write fails", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const key = "rename-failure";

		const started = await store.beginExecution<{ value: string }>(key, {
			leaseMs: 5_000,
		});
		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		const originalRename = fs.rename;
		const renameSpy = vi
			.spyOn(fs, "rename")
			.mockImplementation(async (oldPath, newPath) => {
				const nextPath = String(newPath);
				if (nextPath.endsWith(".json")) {
					throw new Error("forced rename failure");
				}
				await originalRename(oldPath, newPath);
			});

		await expect(started.lease.complete({ value: "x" })).rejects.toThrow(
			"forced rename failure",
		);

		const files = await fs.readdir(cacheDir);
		expect(files.filter((name) => name.includes(".tmp"))).toEqual([]);
		expect(renameSpy).toHaveBeenCalled();
	});

	it("does not delete a lock on release when ownership has changed", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "release-owner-check";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const targetLockPath = lockPath(cacheDir, key);
		const releaseLock = await (
			store as unknown as {
				acquireLock: (targetPath: string) => Promise<() => Promise<void>>;
			}
		).acquireLock(targetLockPath);

		await fs.rm(targetLockPath, { force: true });
		await fs.writeFile(targetLockPath, "foreign-owner", "utf8");

		await releaseLock();

		await expect(fs.readFile(targetLockPath, "utf8")).resolves.toBe(
			"foreign-owner",
		);
	});

	it("skips stale lock deletion when observed owner no longer matches", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "stale-owner-mismatch";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const targetLockPath = lockPath(cacheDir, key);
		await fs.writeFile(targetLockPath, "owner-a", "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		const originalReadFile = fs.readFile;
		let readCount = 0;
		vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
			const [target] = args;
			if (String(target) === targetLockPath) {
				readCount += 1;
				if (readCount === 2) {
					return "owner-b";
				}
			}
			return originalReadFile(...args);
		});

		const cleared = await (
			store as unknown as {
				tryClearStaleLock: (targetPath: string) => Promise<boolean>;
			}
		).tryClearStaleLock(targetLockPath);

		expect(cleared).toBe(false);
		await expect(fs.readFile(targetLockPath, "utf8")).resolves.toBe("owner-a");
	});

	it("does not clear stale lock when owner process is still alive", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "stale-owner-alive";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const targetLockPath = lockPath(cacheDir, key);
		await fs.writeFile(targetLockPath, `${process.pid}-still-active`, "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		const cleared = await (
			store as unknown as {
				tryClearStaleLock: (targetPath: string) => Promise<boolean>;
			}
		).tryClearStaleLock(targetLockPath);

		expect(cleared).toBe(false);
		await expect(fs.readFile(targetLockPath, "utf8")).resolves.toContain(
			`${process.pid}-`,
		);
	});

	it("keeps foreign lease files untouched and reports failed renew for wrong owner", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "owner-check";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });

		const started = await store.beginExecution(key, { leaseMs: 5_000 });
		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		const renewed = await (
			store as unknown as {
				renewExecutionLease: (
					idempotencyKey: string,
					ownerId: string,
					leaseMs: number,
				) => Promise<boolean>;
			}
		).renewExecutionLease(key, "wrong-owner", 1_000);
		expect(renewed).toBe(false);

		await (
			store as unknown as {
				clearExecutionLease: (
					idempotencyKey: string,
					ownerId: string,
				) => Promise<void>;
			}
		).clearExecutionLease(key, "wrong-owner");

		await expect(fs.access(leasePath(cacheDir, key))).resolves.toBeUndefined();
	});

	it("keeps completion successful when value is persisted but lease cleanup fails", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "lease-cleanup-failure";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });

		const started = await store.beginExecution<{ value: string }>(key, {
			leaseMs: 5_000,
		});
		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		const targetLeasePath = leasePath(cacheDir, key);
		const originalRm = fs.rm;
		const rmSpy = vi.spyOn(fs, "rm").mockImplementation(async (...args) => {
			const [target] = args;
			if (String(target) === targetLeasePath) {
				throw new Error("forced lease cleanup failure");
			}
			return originalRm(...args);
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await expect(started.lease.complete({ value: "persisted" })).resolves.toBe(
			undefined,
		);
		await expect(store.get<{ value: string }>(key)).resolves.toEqual({
			value: "persisted",
		});
		expect(rmSpy).toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Value persisted but lease cleanup failed"),
			expect.any(Error),
		);
		await expect(fs.access(targetLeasePath)).resolves.toBeUndefined();
	});

	it("returns true when stale lock disappears after compare-and-delete race", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "stale-lock-disappeared";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const targetLockPath = lockPath(cacheDir, key);
		await fs.writeFile(targetLockPath, "owner-without-pid", "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		const storeInternal = store as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
			compareAndDeleteLock: (
				targetPath: string,
				ownerId: string,
				ownedInode?: number,
			) => Promise<boolean>;
		};
		const compareSpy = vi
			.spyOn(storeInternal, "compareAndDeleteLock")
			.mockImplementation(async () => {
				await fs.rm(targetLockPath, { force: true });
				return false;
			});

		const cleared = await storeInternal.tryClearStaleLock(targetLockPath);

		expect(cleared).toBe(true);
		expect(compareSpy).toHaveBeenCalled();
	});

	it("propagates non-ENOENT errors while reading execution lease", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "lease-read-eacces";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			readExecutionLease: (idempotencyKey: string) => Promise<unknown>;
		};
		const targetLeasePath = leasePath(cacheDir, key);
		const originalReadFile = fs.readFile;

		vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
			const [target] = args;
			if (String(target) === targetLeasePath) {
				throw Object.assign(new Error("permission denied"), {
					code: "EACCES",
				});
			}
			return originalReadFile(...args);
		});

		await expect(store.readExecutionLease(key)).rejects.toThrow(
			"permission denied",
		);
	});

	it("removes the lease file when abandon is called by the owner", async () => {
		const cacheDir = await createTempDir("openui-idempotency-store-");
		const key = "abandon-owner-removes-lease";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const started = await store.beginExecution(key, { leaseMs: 5_000 });

		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		await expect(fs.access(leasePath(cacheDir, key))).resolves.toBeUndefined();
		await started.lease.abandon();
		await expect(fs.access(leasePath(cacheDir, key))).rejects.toThrow();
	});
});
