import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdempotencyStore } from "../packages/shared-runtime/src/idempotency-store.js";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function lockPath(cacheDir: string, key: string): string {
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return path.join(cacheDir, `openui-ship-${hash}.lock`);
}

function recordPath(cacheDir: string, key: string): string {
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return path.join(cacheDir, `openui-ship-${hash}.json`);
}

function leasePath(cacheDir: string, key: string): string {
	const hash = crypto.createHash("sha256").update(key).digest("hex");
	return path.join(cacheDir, `openui-ship-${hash}.lease.json`);
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("idempotency store uncovered branches", () => {
	it("throws from get when record read fails with non-ENOENT error", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "get-eacces";
		const targetRecordPath = recordPath(cacheDir, key);
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const originalReadFile = fs.readFile;

		vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
			if (String(args[0]) === targetRecordPath) {
				throw Object.assign(new Error("permission denied"), { code: "EACCES" });
			}
			return originalReadFile(...args);
		});

		await expect(store.get(key)).rejects.toThrow("permission denied");
	});

	it("removes malformed idempotency payload files during get", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "malformed-record";
		const targetRecordPath = recordPath(cacheDir, key);
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });

		await fs.writeFile(targetRecordPath, "{not-json", "utf8");
		await expect(store.get(key)).resolves.toBeUndefined();
		await expect(fs.stat(targetRecordPath)).rejects.toThrow();
	});

	it("returns cached status when beginExecution finds existing value", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "begin-cached";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });

		await store.set(key, { cached: true });
		await expect(
			store.beginExecution<{ cached: boolean }>(key),
		).resolves.toEqual({
			status: "cached",
			value: { cached: true },
		});
	});

	it("returns false from setIfAbsent when value already exists", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "set-if-absent-existing";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });

		await store.set(key, { value: "first" });
		await expect(store.setIfAbsent(key, { value: "second" })).resolves.toBe(
			false,
		);
	});

	it("returns ready from waitFor using default timeout and interval", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "wait-ready-defaults";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });

		await store.set(key, { ready: true });
		await expect(store.waitFor<{ ready: boolean }>(key)).resolves.toEqual({
			status: "ready",
			value: { ready: true },
		});
	});

	it("returns timeout_inflight when lease remains active after wait timeout", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "wait-timeout-inflight";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const started = await store.beginExecution(key, { leaseMs: 5_000 });

		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		await expect(
			store.waitFor(key, { timeoutMs: 1, intervalMs: 1 }),
		).resolves.toEqual({ status: "timeout_inflight" });
	});

	it("returns inflight from beginExecution when active lease already exists", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "begin-inflight";
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const started = await store.beginExecution(key, { leaseMs: 5_000 });

		expect(started.status).toBe("acquired");
		await expect(store.beginExecution(key)).resolves.toEqual({
			status: "inflight",
		});
	});

	it("removes expired lease before reacquiring execution ownership", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-lease-reacquire";
		const targetLeasePath = leasePath(cacheDir, key);
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const rmSpy = vi.spyOn(fs, "rm");

		await fs.writeFile(
			targetLeasePath,
			JSON.stringify({
				ownerId: "old-owner",
				expiresAtMs: Date.now() - 60_000,
			}),
			"utf8",
		);

		const result = await store.beginExecution(key, { leaseMs: 3_000 });
		expect(result.status).toBe("acquired");
		expect(rmSpy).toHaveBeenCalledWith(targetLeasePath, { force: true });
	});

	it("falls back to undefined owner pid when stale owner id has empty pid segment", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-empty-pid";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		await fs.writeFile(targetLockPath, "-owner-without-pid", "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		await expect(store.tryClearStaleLock(targetLockPath)).resolves.toBe(true);
		await expect(fs.stat(targetLockPath)).rejects.toThrow();
	});

	it("treats EPERM owner probe as alive and keeps stale lock", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-owner-eperm";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		vi.spyOn(process, "kill").mockImplementation((() => {
			throw Object.assign(new Error("no permission"), { code: "EPERM" });
		}) as typeof process.kill);
		await fs.writeFile(targetLockPath, "12345-owner", "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		await expect(store.tryClearStaleLock(targetLockPath)).resolves.toBe(false);
		await expect(fs.readFile(targetLockPath, "utf8")).resolves.toContain(
			"12345-",
		);
	});

	it("clears stale lock when owner pid probe reports dead process", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-owner-dead";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		vi.spyOn(process, "kill").mockImplementation((() => {
			throw Object.assign(new Error("missing process"), { code: "ESRCH" });
		}) as typeof process.kill);
		await fs.writeFile(targetLockPath, "12345-owner", "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		await expect(store.tryClearStaleLock(targetLockPath)).resolves.toBe(true);
		await expect(fs.stat(targetLockPath)).rejects.toThrow();
	});

	it("swallows lock heartbeat refresh failures while lock is held", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "lock-heartbeat-utimes-failure";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			acquireLock: (targetPath: string) => Promise<() => Promise<void>>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		vi.useFakeTimers();
		const utimesSpy = vi
			.spyOn(fs, "utimes")
			.mockRejectedValue(new Error("forced utimes failure"));

		const releaseLock = await store.acquireLock(targetLockPath);
		await vi.advanceTimersByTimeAsync(1_100);
		expect(utimesSpy).toHaveBeenCalled();
		await releaseLock();
	});

	it("throws from acquireLock when lock create fails with non-EEXIST error", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "lock-open-denied";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			acquireLock: (targetPath: string) => Promise<() => Promise<void>>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		vi.spyOn(fs, "open").mockRejectedValueOnce(
			Object.assign(new Error("open denied"), { code: "EACCES" }),
		);

		await expect(store.acquireLock(targetLockPath)).rejects.toThrow(
			"open denied",
		);
	});

	it("throws timeout when lock remains contested and stale cleanup fails", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "lock-timeout";
		let now = 0;
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
			now: () => {
				now += 6_000;
				return now;
			},
		}) as unknown as {
			acquireLock: (targetPath: string) => Promise<() => Promise<void>>;
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		vi.spyOn(fs, "open").mockRejectedValue(
			Object.assign(new Error("already exists"), { code: "EEXIST" }),
		);
		vi.spyOn(store, "tryClearStaleLock").mockResolvedValue(false);

		await expect(store.acquireLock(targetLockPath)).rejects.toThrow(
			/Timed out waiting for idempotency lock/,
		);
	});

	it("returns false when compareAndDeleteLock target already disappeared", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "compare-missing-lock";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			compareAndDeleteLock: (
				targetPath: string,
				ownerId: string,
				ownedInode?: number,
			) => Promise<boolean>;
		};

		await expect(
			store.compareAndDeleteLock(lockPath(cacheDir, key), "owner", 1),
		).resolves.toBe(false);
	});

	it("compares and deletes lock without inode guard when inode is not provided", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "compare-without-inode";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			compareAndDeleteLock: (
				targetPath: string,
				ownerId: string,
				ownedInode?: number,
			) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		await fs.writeFile(targetLockPath, "owner-no-inode", "utf8");
		await expect(
			store.compareAndDeleteLock(targetLockPath, "owner-no-inode"),
		).resolves.toBe(true);
		await expect(fs.stat(targetLockPath)).rejects.toThrow();
	});

	it("throws from compareAndDeleteLock when stat fails with non-ENOENT error", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "compare-stat-eacces";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			compareAndDeleteLock: (
				targetPath: string,
				ownerId: string,
				ownedInode?: number,
			) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);
		const originalStat = fs.stat;

		await fs.writeFile(targetLockPath, "owner", "utf8");
		vi.spyOn(fs, "stat").mockImplementation(async (...args) => {
			if (String(args[0]) === targetLockPath) {
				throw Object.assign(new Error("stat denied"), { code: "EACCES" });
			}
			return originalStat(...args);
		});

		await expect(
			store.compareAndDeleteLock(targetLockPath, "owner", 123),
		).rejects.toThrow("stat denied");
	});

	it("returns true when stale lock path no longer exists", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-lock-missing";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};

		await expect(
			store.tryClearStaleLock(lockPath(cacheDir, key)),
		).resolves.toBe(true);
	});

	it("returns false when lock is fresh and not stale yet", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "fresh-lock-not-stale";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);

		await fs.writeFile(targetLockPath, "recent-owner", "utf8");
		await fs.utimes(targetLockPath, new Date(), new Date());

		await expect(store.tryClearStaleLock(targetLockPath)).resolves.toBe(false);
		await expect(fs.stat(targetLockPath)).resolves.toMatchObject({
			isFile: expect.any(Function),
		});
	});

	it("throws from stale lock cleanup when initial stat fails with non-ENOENT", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-stat-eacces";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);
		const originalStat = fs.stat;

		vi.spyOn(fs, "stat").mockImplementation(async (...args) => {
			if (String(args[0]) === targetLockPath) {
				throw Object.assign(new Error("stat blocked"), { code: "EACCES" });
			}
			return originalStat(...args);
		});

		await expect(store.tryClearStaleLock(targetLockPath)).rejects.toThrow(
			"stat blocked",
		);
	});

	it("throws from stale lock cleanup when final stat fails with non-ENOENT", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const key = "stale-final-stat-eacces";
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			tryClearStaleLock: (targetPath: string) => Promise<boolean>;
			compareAndDeleteLock: (
				targetPath: string,
				ownerId: string,
				ownedInode?: number,
			) => Promise<boolean>;
		};
		const targetLockPath = lockPath(cacheDir, key);
		const originalStat = fs.stat;
		let statCount = 0;

		await fs.writeFile(targetLockPath, "owner-z", "utf8");
		await fs.utimes(targetLockPath, new Date(0), new Date(0));

		vi.spyOn(store, "compareAndDeleteLock").mockResolvedValue(false);
		vi.spyOn(fs, "stat").mockImplementation(async (...args) => {
			if (String(args[0]) === targetLockPath) {
				statCount += 1;
				if (statCount >= 2) {
					throw Object.assign(new Error("final stat denied"), {
						code: "EACCES",
					});
				}
			}
			return originalStat(...args);
		});

		await expect(store.tryClearStaleLock(targetLockPath)).rejects.toThrow(
			"final stat denied",
		);
	});

	it("swallows heartbeat renew rejections", async () => {
		const cacheDir = await createTempDir("openui-idempotency-uncovered-");
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			startLeaseHeartbeat: (
				idempotencyKey: string,
				ownerId: string,
				leaseMs: number,
				heartbeatMs: number,
			) => () => void;
			renewExecutionLease: (
				idempotencyKey: string,
				ownerId: string,
				leaseMs: number,
			) => Promise<boolean>;
		};

		vi.useFakeTimers();
		const renewSpy = vi
			.spyOn(store, "renewExecutionLease")
			.mockRejectedValue(new Error("renew failed"));
		const stop = store.startLeaseHeartbeat(
			"heartbeat-catch",
			"owner-x",
			1_000,
			20,
		);

		await vi.advanceTimersByTimeAsync(60);
		expect(renewSpy).toHaveBeenCalled();
		stop();
	});
});
