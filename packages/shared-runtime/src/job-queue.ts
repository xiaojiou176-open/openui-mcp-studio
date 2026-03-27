import { resolveEnvDefaultValue } from "../../contracts/src/env-contract.js";

type QueueTask = {
	run: (signal: AbortSignal) => Promise<unknown> | unknown;
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
};

type QueueRunner<T> =
	| (() => Promise<T> | T)
	| ((signal: AbortSignal) => Promise<T> | T);

export class QueueBackpressureError extends Error {
	public readonly code = "QUEUE_BACKPRESSURE";
	public readonly maxPending: number;

	public constructor(maxPending: number) {
		super(`Job queue pending limit exceeded (maxPending=${maxPending}).`);
		this.name = "QueueBackpressureError";
		this.maxPending = maxPending;
	}
}

function toPositiveInteger(
	input: number | undefined,
	fallback: number,
): number {
	if (typeof input !== "number" || !Number.isInteger(input) || input <= 0) {
		return fallback;
	}
	return input;
}

function readPositiveIntegerEnv(
	envName: string,
	defaultValue: number,
): number {
	const raw = process.env[envName];
	if (raw === undefined || raw.trim() === "") {
		return defaultValue;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return defaultValue;
	}
	return parsed;
}

function getOpenuiQueueConcurrency(): number {
	return readPositiveIntegerEnv(
		"OPENUI_QUEUE_CONCURRENCY",
		Number(resolveEnvDefaultValue("OPENUI_QUEUE_CONCURRENCY")),
	);
}

function getOpenuiQueueMaxPending(): number {
	return readPositiveIntegerEnv(
		"OPENUI_QUEUE_MAX_PENDING",
		Number(resolveEnvDefaultValue("OPENUI_QUEUE_MAX_PENDING")),
	);
}

export class JobQueue {
	private readonly concurrency: number;
	private readonly maxPending: number;
	private readonly safetyTimeoutMs: number;
	private activeCount = 0;
	private readonly pending: QueueTask[] = [];

	constructor(options?: {
		concurrency?: number;
		maxPending?: number;
		safetyTimeoutMs?: number;
	}) {
		this.concurrency = toPositiveInteger(options?.concurrency, 1);
		this.maxPending = toPositiveInteger(
			options?.maxPending,
			getOpenuiQueueMaxPending(),
		);
		this.safetyTimeoutMs = toPositiveInteger(options?.safetyTimeoutMs, 300_000);
	}

	enqueue<T>(run: QueueRunner<T>): Promise<T> {
		if (this.pending.length >= this.maxPending) {
			return Promise.reject(new QueueBackpressureError(this.maxPending));
		}

		return new Promise<T>((resolve, reject) => {
			this.pending.push({
				run: (signal) =>
					(run as (signal: AbortSignal) => Promise<T> | T)(signal),
				resolve: (value) => resolve(value as T),
				reject,
			});
			this.drain();
		});
	}

	private drain(): void {
		while (this.activeCount < this.concurrency && this.pending.length > 0) {
			const task = this.pending.shift();
			if (!task) {
				return;
			}

			this.activeCount += 1;
			const abortController = new AbortController();
			const taskPromise = Promise.resolve().then(() =>
				task.run(abortController.signal),
			);
			let settled = false;
			let slotReleased = false;
			let safetyTimeoutId: ReturnType<typeof setTimeout> | undefined;

			const settleResolve = (value: unknown): void => {
				if (settled) {
					return;
				}
				settled = true;
				task.resolve(value);
			};
			const settleReject = (reason?: unknown): void => {
				if (settled) {
					return;
				}
				settled = true;
				task.reject(reason);
			};
			const releaseSlot = (): void => {
				if (slotReleased) {
					return;
				}
				slotReleased = true;
				if (safetyTimeoutId !== undefined) {
					clearTimeout(safetyTimeoutId);
					safetyTimeoutId = undefined;
				}
				this.activeCount -= 1;
				this.drain();
			};

			taskPromise.then(settleResolve, settleReject).finally(() => {
				releaseSlot();
			});

			try {
				safetyTimeoutId = setTimeout(() => {
					const timeoutError = new Error("Task exceeded safety timeout");
					abortController.abort(timeoutError);
					settleReject(timeoutError);
					releaseSlot();
				}, this.safetyTimeoutMs);
			} catch (error) {
				settleReject(error);
				releaseSlot();
			}
		}
	}
}

export const shipJobQueue = new JobQueue({
	concurrency: getOpenuiQueueConcurrency(),
});
