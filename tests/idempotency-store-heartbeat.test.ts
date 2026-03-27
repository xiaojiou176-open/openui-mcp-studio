import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdempotencyStore } from "../packages/shared-runtime/src/idempotency-store.js";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
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

describe("idempotency heartbeat and renew branches", () => {
	it("skips heartbeat renew while lock is held and resumes after release", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-heartbeat-");
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			resolveLockPath: (idempotencyKey: string) => string;
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
			heldLockPaths: Set<string>;
		};

		const key = "heartbeat-lock-held";
		const ownerId = "owner-1";
		const lockPath = store.resolveLockPath(key);
		store.heldLockPaths.add(lockPath);

		const renewSpy = vi
			.spyOn(store, "renewExecutionLease")
			.mockResolvedValue(true);

		vi.useFakeTimers();
		const stop = store.startLeaseHeartbeat(key, ownerId, 5_000, 20);

		await vi.advanceTimersByTimeAsync(60);
		expect(renewSpy).not.toHaveBeenCalled();

		store.heldLockPaths.delete(lockPath);
		await vi.advanceTimersByTimeAsync(40);
		expect(renewSpy).toHaveBeenCalled();

		stop();
	});

	it("renews lease when owner matches and extends expiration", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-renew-");
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const key = "renew-success";
		const started = await store.beginExecution(key, { leaseMs: 500 });

		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		const storeAny = store as unknown as {
			renewExecutionLease: (
				idempotencyKey: string,
				ownerId: string,
				leaseMs: number,
			) => Promise<boolean>;
		};
		const renewed = await storeAny.renewExecutionLease(
			key,
			started.lease.ownerId,
			10_000,
		);

		expect(renewed).toBe(true);
		const persistedLease = JSON.parse(
			await fs.readFile(leasePath(cacheDir, key), "utf8"),
		) as {
			ownerId: string;
			expiresAtMs: number;
		};
		expect(persistedLease.ownerId).toBe(started.lease.ownerId);
		expect(persistedLease.expiresAtMs).toBeGreaterThan(Date.now());
	});
});
