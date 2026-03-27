import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveEnvDefaultValue } from "../../contracts/src/env-contract.js";
import { isPathInsideRootWithRealpath } from "./path-utils.js";

type IdempotencyRecord<T> = {
	expiresAtMs: number;
	value: T;
};

type ExecutionLeaseRecord = {
	ownerId: string;
	expiresAtMs: number;
};

export type IdempotencyExecutionLease = {
	ownerId: string;
	leaseMs: number;
	heartbeatMs: number;
	startHeartbeat: () => () => void;
	complete: <T>(value: T) => Promise<void>;
	abandon: () => Promise<void>;
};

export type BeginExecutionResult<T> =
	| { status: "acquired"; lease: IdempotencyExecutionLease }
	| { status: "cached"; value: T }
	| { status: "inflight" };

export type WaitForResult<T> =
	| { status: "ready"; value: T }
	| { status: "timeout_inflight" }
	| { status: "timeout_missing" };

const LOCK_RETRY_MS = 20;
const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const DEFAULT_EXECUTION_LEASE_MS = 30_000;
const DEFAULT_EXECUTION_HEARTBEAT_MS = 1_000;
const LOCK_HEARTBEAT_MS = 1_000;

function resolveWorkspaceRoot(): string {
	const fallback = String(resolveEnvDefaultValue("OPENUI_MCP_WORKSPACE_ROOT"));
	const raw = process.env.OPENUI_MCP_WORKSPACE_ROOT?.trim();
	return path.resolve(raw || fallback);
}

function resolveCacheDirWithinWorkspace(): string {
	const workspaceRoot = resolveWorkspaceRoot();
	const fallback = String(resolveEnvDefaultValue("OPENUI_MCP_CACHE_DIR"));
	const raw = process.env.OPENUI_MCP_CACHE_DIR?.trim();
	const candidate = raw || fallback;
	const resolved = path.isAbsolute(candidate)
		? path.resolve(candidate)
		: path.resolve(workspaceRoot, candidate);
	if (!isPathInsideRootWithRealpath(workspaceRoot, resolved)) {
		throw new Error(
			`OPENUI_MCP_CACHE_DIR must resolve inside OPENUI_MCP_WORKSPACE_ROOT (${workspaceRoot}).`,
		);
	}
	return resolved;
}

function getOpenuiIdempotencyTtlMinutes(): number {
	const fallback = Number(resolveEnvDefaultValue("OPENUI_IDEMPOTENCY_TTL_MINUTES"));
	const raw = process.env.OPENUI_IDEMPOTENCY_TTL_MINUTES?.trim();
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(
			`OPENUI_IDEMPOTENCY_TTL_MINUTES must be a positive integer, received: ${JSON.stringify(raw)}.`,
		);
	}
	return parsed;
}

function getOpenuiMcpCacheDirWithinWorkspace(): string {
	return resolveCacheDirWithinWorkspace();
}

function isFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function isFileAlreadyExists(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "EEXIST"
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function parseOwnerPid(ownerId: string): number | undefined {
	const [rawPid] = ownerId.split("-", 1);
	if (!rawPid) {
		return undefined;
	}
	const pid = Number.parseInt(rawPid, 10);
	if (!Number.isInteger(pid) || pid <= 0) {
		return undefined;
	}
	return pid;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "EPERM"
		) {
			return true;
		}
		return false;
	}
}

export class IdempotencyStore {
	private readonly cacheDir: string;
	private readonly ttlMinutes: number;
	private readonly now: () => number;
	private readonly lockTimeoutMs: number;
	private readonly heldLockPaths = new Set<string>();

	constructor(options?: {
		cacheDir?: string;
		ttlMinutes?: number;
		now?: () => number;
		lockTimeoutMs?: number;
	}) {
		this.cacheDir = options?.cacheDir || getOpenuiMcpCacheDirWithinWorkspace();
		this.ttlMinutes = options?.ttlMinutes ?? getOpenuiIdempotencyTtlMinutes();
		this.now = options?.now ?? (() => Date.now());
		this.lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
	}

	async get<T>(idempotencyKey: string): Promise<T | undefined> {
		const targetPath = this.resolvePath(idempotencyKey);
		let raw: string;
		try {
			raw = await fs.readFile(targetPath, "utf8");
		} catch (error) {
			if (isFileNotFound(error)) {
				return undefined;
			}
			throw error;
		}

		let parsed: IdempotencyRecord<T>;
		try {
			parsed = JSON.parse(raw) as IdempotencyRecord<T>;
		} catch {
			await fs.rm(targetPath, { force: true });
			return undefined;
		}

		if (
			!parsed ||
			typeof parsed !== "object" ||
			typeof parsed.expiresAtMs !== "number" ||
			parsed.expiresAtMs <= this.now()
		) {
			await fs.rm(targetPath, { force: true });
			return undefined;
		}

		return parsed.value;
	}

	async set<T>(idempotencyKey: string, value: T): Promise<void> {
		await this.setIfAbsent(idempotencyKey, value);
	}

	async setIfAbsent<T>(idempotencyKey: string, value: T): Promise<boolean> {
		await fs.mkdir(this.cacheDir, { recursive: true });
		const targetPath = this.resolvePath(idempotencyKey);
		const releaseLock = await this.acquireLock(
			this.resolveLockPath(idempotencyKey),
		);
		try {
			const existingValue = await this.get<T>(idempotencyKey);
			if (existingValue !== undefined) {
				return false;
			}

			const tempPath = `${targetPath}.${process.pid}.${Date.now().toString(36)}.${crypto
				.randomBytes(8)
				.toString("hex")}.tmp`;
			const payload: IdempotencyRecord<T> = {
				expiresAtMs: this.now() + this.ttlMinutes * 60_000,
				value,
			};

			try {
				await fs.writeFile(tempPath, JSON.stringify(payload), "utf8");
				await fs.rename(tempPath, targetPath);
			} catch (error) {
				await fs.rm(tempPath, { force: true });
				throw error;
			}

			return true;
		} finally {
			await releaseLock();
		}
	}

	async waitFor<T>(
		idempotencyKey: string,
		options: { timeoutMs?: number; intervalMs?: number } = {},
	): Promise<WaitForResult<T>> {
		const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
		const intervalMs = options.intervalMs ?? LOCK_RETRY_MS;
		const start = this.now();

		while (this.now() - start <= timeoutMs) {
			const value = await this.get<T>(idempotencyKey);
			if (value !== undefined) {
				return {
					status: "ready",
					value,
				};
			}
			await sleep(intervalMs);
		}

		const lease = await this.readExecutionLease(idempotencyKey);
		if (lease && lease.expiresAtMs > this.now()) {
			return { status: "timeout_inflight" };
		}
		return { status: "timeout_missing" };
	}

	async beginExecution<T>(
		idempotencyKey: string,
		options: {
			leaseMs?: number;
			heartbeatMs?: number;
		} = {},
	): Promise<BeginExecutionResult<T>> {
		await fs.mkdir(this.cacheDir, { recursive: true });
		const releaseLock = await this.acquireLock(
			this.resolveLockPath(idempotencyKey),
		);
		try {
			const existingValue = await this.get<T>(idempotencyKey);
			if (existingValue !== undefined) {
				return {
					status: "cached",
					value: existingValue,
				};
			}

			const now = this.now();
			const leaseMs = options.leaseMs ?? DEFAULT_EXECUTION_LEASE_MS;
			const heartbeatMs = options.heartbeatMs ?? DEFAULT_EXECUTION_HEARTBEAT_MS;
			const leasePath = this.resolveExecutionLeasePath(idempotencyKey);
			const existingLease = await this.readExecutionLease(idempotencyKey);
			if (existingLease && existingLease.expiresAtMs > now) {
				return { status: "inflight" };
			}
			if (existingLease) {
				await fs.rm(leasePath, { force: true });
			}

			const ownerId = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
			await this.writeExecutionLease(leasePath, {
				ownerId,
				expiresAtMs: now + leaseMs,
			});

			const lease: IdempotencyExecutionLease = {
				ownerId,
				leaseMs,
				heartbeatMs,
				startHeartbeat: () =>
					this.startLeaseHeartbeat(
						idempotencyKey,
						ownerId,
						leaseMs,
						heartbeatMs,
					),
				complete: async <V>(value: V) => {
					await this.completeExecution(idempotencyKey, ownerId, value);
				},
				abandon: async () => {
					await this.clearExecutionLease(idempotencyKey, ownerId);
				},
			};

			return {
				status: "acquired",
				lease,
			};
		} finally {
			await releaseLock();
		}
	}

	private async acquireLock(lockPath: string): Promise<() => Promise<void>> {
		const start = this.now();
		while (true) {
			try {
				const lockHandle = await fs.open(lockPath, "wx");
				const ownerId = `${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
				await lockHandle.writeFile(ownerId, "utf8");
				const ownedInode = (await lockHandle.stat()).ino;
				const heartbeat = setInterval(() => {
					void fs.utimes(lockPath, new Date(), new Date()).catch(() => {
						// Lock refresh is best effort. Stale checks still verify ownership.
					});
				}, LOCK_HEARTBEAT_MS);
				heartbeat.unref?.();
				this.heldLockPaths.add(lockPath);
				return async () => {
					clearInterval(heartbeat);
					try {
						await lockHandle.close();
						await this.compareAndDeleteLock(lockPath, ownerId, ownedInode);
					} finally {
						this.heldLockPaths.delete(lockPath);
					}
				};
			} catch (error) {
				if (!isFileAlreadyExists(error)) {
					throw error;
				}

				const waitedMs = this.now() - start;
					if (waitedMs >= this.lockTimeoutMs) {
						const cleared = await this.tryClearStaleLock(lockPath);
						if (!cleared) {
							throw new Error(
							`Timed out waiting for idempotency lock: ${lockPath}`,
							{
								cause: error,
							},
						);
					}
				}
				await sleep(LOCK_RETRY_MS);
			}
		}
	}

	private async compareAndDeleteLock(
		lockPath: string,
		ownerId: string,
		ownedInode?: number,
	): Promise<boolean> {
		try {
			if (typeof ownedInode === "number") {
				const currentStat = await fs.stat(lockPath);
				if (currentStat.ino !== ownedInode) {
					return false;
				}
			}
			const currentOwnerId = await fs.readFile(lockPath, "utf8");
			if (currentOwnerId !== ownerId) {
				return false;
			}
			await fs.rm(lockPath, { force: true });
			return true;
		} catch (error) {
			if (isFileNotFound(error)) {
				return false;
			}
			throw error;
		}
	}

	private async tryClearStaleLock(lockPath: string): Promise<boolean> {
		let observedOwnerId: string | undefined;
		let observedInode: number | undefined;
		try {
			const stat = await fs.stat(lockPath);
			const lockAgeMs = this.now() - stat.mtimeMs;
				if (lockAgeMs < this.lockTimeoutMs) {
					return false;
				}
			observedInode = stat.ino;
			observedOwnerId = await fs.readFile(lockPath, "utf8").catch(() => "");
			const ownerPid = parseOwnerPid(observedOwnerId);
			if (ownerPid !== undefined && isProcessAlive(ownerPid)) {
				return false;
			}
			console.warn(
				`[idempotency-store] Clearing stale lock: ${lockPath}, owner: ${observedOwnerId}`,
			);
		} catch (error) {
			if (isFileNotFound(error)) {
				return true;
			}
			throw error;
		}

		const cleared = await this.compareAndDeleteLock(
			lockPath,
			observedOwnerId ?? "",
			observedInode,
		);
		if (cleared) {
			return true;
		}
		try {
			await fs.stat(lockPath);
			return false;
		} catch (error) {
			if (isFileNotFound(error)) {
				return true;
			}
			throw error;
		}
	}

	private resolveLockPath(idempotencyKey: string): string {
		const hash = crypto
			.createHash("sha256")
			.update(idempotencyKey)
			.digest("hex");
		return path.join(this.cacheDir, `openui-ship-${hash}.lock`);
	}

	private resolveExecutionLeasePath(idempotencyKey: string): string {
		const hash = crypto
			.createHash("sha256")
			.update(idempotencyKey)
			.digest("hex");
		return path.join(this.cacheDir, `openui-ship-${hash}.lease.json`);
	}

	private resolvePath(idempotencyKey: string): string {
		const hash = crypto
			.createHash("sha256")
			.update(idempotencyKey)
			.digest("hex");
		return path.join(this.cacheDir, `openui-ship-${hash}.json`);
	}

	private async readExecutionLease(
		idempotencyKey: string,
	): Promise<ExecutionLeaseRecord | undefined> {
		const leasePath = this.resolveExecutionLeasePath(idempotencyKey);
		let raw: string;
		try {
			raw = await fs.readFile(leasePath, "utf8");
		} catch (error) {
			if (isFileNotFound(error)) {
				return undefined;
			}
			throw error;
		}

		let parsed: ExecutionLeaseRecord;
		try {
			parsed = JSON.parse(raw) as ExecutionLeaseRecord;
		} catch {
			await fs.rm(leasePath, { force: true });
			return undefined;
		}

		if (
			!parsed ||
			typeof parsed !== "object" ||
			typeof parsed.ownerId !== "string" ||
			parsed.ownerId.length === 0 ||
			typeof parsed.expiresAtMs !== "number"
		) {
			await fs.rm(leasePath, { force: true });
			return undefined;
		}

		return parsed;
	}

	private async writeExecutionLease(
		leasePath: string,
		lease: ExecutionLeaseRecord,
	): Promise<void> {
		const tempPath = `${leasePath}.${process.pid}.${Date.now().toString(36)}.${crypto
			.randomBytes(8)
			.toString("hex")}.tmp`;
		try {
			await fs.writeFile(tempPath, JSON.stringify(lease), "utf8");
			await fs.rename(tempPath, leasePath);
		} catch (error) {
			await fs.rm(tempPath, { force: true });
			throw error;
		}
	}

	private startLeaseHeartbeat(
		idempotencyKey: string,
		ownerId: string,
		leaseMs: number,
		heartbeatMs: number,
	): () => void {
		const lockPath = this.resolveLockPath(idempotencyKey);
		const interval = setInterval(() => {
			if (this.heldLockPaths.has(lockPath)) {
				return;
			}
			void this.renewExecutionLease(idempotencyKey, ownerId, leaseMs).catch(
				() => {
					// Heartbeat is best effort. Ownership checks happen during complete().
				},
			);
		}, heartbeatMs);
		interval.unref?.();
		return () => {
			clearInterval(interval);
		};
	}

	private async renewExecutionLease(
		idempotencyKey: string,
		ownerId: string,
		leaseMs: number,
	): Promise<boolean> {
		const lockPath = this.resolveLockPath(idempotencyKey);
		const leasePath = this.resolveExecutionLeasePath(idempotencyKey);
		const releaseLock = await this.acquireLock(lockPath);
		try {
			const lease = await this.readExecutionLease(idempotencyKey);
			if (!lease || lease.ownerId !== ownerId) {
				return false;
			}

			await this.writeExecutionLease(leasePath, {
				ownerId,
				expiresAtMs: this.now() + leaseMs,
			});
			return true;
		} finally {
			await releaseLock();
		}
	}

	private async completeExecution<T>(
		idempotencyKey: string,
		ownerId: string,
		value: T,
	): Promise<void> {
		const lockPath = this.resolveLockPath(idempotencyKey);
		const leasePath = this.resolveExecutionLeasePath(idempotencyKey);
		const targetPath = this.resolvePath(idempotencyKey);
		const releaseLock = await this.acquireLock(lockPath);
		try {
			const lease = await this.readExecutionLease(idempotencyKey);
			if (
				!lease ||
				lease.ownerId !== ownerId ||
				lease.expiresAtMs <= this.now()
			) {
				throw new Error(
					`Lost idempotency execution lease for key: ${idempotencyKey}`,
				);
			}

			const payload: IdempotencyRecord<T> = {
				expiresAtMs: this.now() + this.ttlMinutes * 60_000,
				value,
			};
			const tempPath = `${targetPath}.${process.pid}.${Date.now().toString(36)}.${crypto
				.randomBytes(8)
				.toString("hex")}.tmp`;
			try {
				await fs.writeFile(tempPath, JSON.stringify(payload), "utf8");
				await fs.rename(tempPath, targetPath);
			} catch (error) {
				await fs.rm(tempPath, { force: true });
				throw error;
			}
			await fs.rm(leasePath, { force: true }).catch((error) => {
				console.warn(
					`[idempotency-store] Value persisted but lease cleanup failed: ${leasePath}`,
					error,
				);
			});
		} finally {
			await releaseLock();
		}
	}

	private async clearExecutionLease(
		idempotencyKey: string,
		ownerId: string,
	): Promise<void> {
		const lockPath = this.resolveLockPath(idempotencyKey);
		const leasePath = this.resolveExecutionLeasePath(idempotencyKey);
		const releaseLock = await this.acquireLock(lockPath);
		try {
			const lease = await this.readExecutionLease(idempotencyKey);
			if (lease && lease.ownerId === ownerId) {
				await fs.rm(leasePath, { force: true });
			}
		} finally {
			await releaseLock();
		}
	}
}

export const shipIdempotencyStore = new IdempotencyStore();
