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
});

describe("idempotency store recovery branches", () => {
	it("cleans up temp files when setIfAbsent rename fails", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-set-if-absent-");
		const store = new IdempotencyStore({ cacheDir, ttlMinutes: 5 });
		const renameSpy = vi
			.spyOn(fs, "rename")
			.mockRejectedValueOnce(new Error("rename-target-failed"));

		await expect(
			store.setIfAbsent("rename-failure", { ok: true }),
		).rejects.toThrow("rename-target-failed");

		expect(renameSpy).toHaveBeenCalledTimes(1);
		const leftovers = await fs.readdir(cacheDir);
		expect(leftovers.some((entry) => entry.endsWith(".tmp"))).toBe(false);
	});

	it("drops malformed and invalid execution lease files", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-recovery-");
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			readExecutionLease: (idempotencyKey: string) => Promise<unknown>;
		};
		const key = "broken-lease";
		const pathToLease = leasePath(cacheDir, key);

		await fs.writeFile(pathToLease, "{not-json", "utf8");
		await expect(store.readExecutionLease(key)).resolves.toBeUndefined();
		await expect(fs.stat(pathToLease)).rejects.toThrow();

		await fs.writeFile(
			pathToLease,
			JSON.stringify({ ownerId: "", expiresAtMs: "bad" }),
			"utf8",
		);
		await expect(store.readExecutionLease(key)).resolves.toBeUndefined();
		await expect(fs.stat(pathToLease)).rejects.toThrow();
	});

	it("rethrows non-ENOENT readExecutionLease failures", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-read-lease-error-");
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			readExecutionLease: (idempotencyKey: string) => Promise<unknown>;
		};
		const key = "lease-read-error";
		const pathToLease = leasePath(cacheDir, key);
		await fs.writeFile(
			pathToLease,
			JSON.stringify({ ownerId: "owner-1", expiresAtMs: Date.now() + 5_000 }),
			"utf8",
		);

		const readSpy = vi
			.spyOn(fs, "readFile")
			.mockRejectedValueOnce(
				Object.assign(new Error("permission-denied"), { code: "EACCES" }),
			);

		await expect(store.readExecutionLease(key)).rejects.toThrow(
			"permission-denied",
		);
		expect(readSpy).toHaveBeenCalled();
	});

	it("cleans up temp lease file when rename fails", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-write-");
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 5,
		}) as unknown as {
			writeExecutionLease: (
				leasePath: string,
				lease: { ownerId: string; expiresAtMs: number },
			) => Promise<void>;
		};
		const key = "rename-failure";
		const pathToLease = leasePath(cacheDir, key);
		const rmSpy = vi.spyOn(fs, "rm");
		const renameSpy = vi
			.spyOn(fs, "rename")
			.mockRejectedValueOnce(new Error("rename-failed"));

		await expect(
			store.writeExecutionLease(pathToLease, {
				ownerId: "owner-1",
				expiresAtMs: Date.now() + 10_000,
			}),
		).rejects.toThrow("rename-failed");

		expect(renameSpy).toHaveBeenCalledTimes(1);
		expect(rmSpy).toHaveBeenCalled();
	});
});
