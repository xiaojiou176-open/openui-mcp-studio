import { afterEach, describe, expect, it, vi } from "vitest";
import {
	JobQueue,
	type QueueBackpressureError,
} from "../packages/shared-runtime/src/job-queue.js";

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

afterEach(() => {
	delete process.env.OPENUI_QUEUE_MAX_PENDING;
});

describe("job queue serialization", () => {
	it("runs queued jobs in deterministic order with default concurrency=1", async () => {
		const queue = new JobQueue();
		const timeline: string[] = [];
		let active = 0;
		let maxActive = 0;

		const runTask = (name: string, ms: number) =>
			queue.enqueue(async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				timeline.push(`start:${name}`);
				await wait(ms);
				timeline.push(`end:${name}`);
				active -= 1;
				return name;
			});

		const results = await Promise.all([
			runTask("a", 30),
			runTask("b", 1),
			runTask("c", 1),
		]);

		expect(results).toEqual(["a", "b", "c"]);
		expect(timeline).toEqual([
			"start:a",
			"end:a",
			"start:b",
			"end:b",
			"start:c",
			"end:c",
		]);
		expect(maxActive).toBe(1);
	});

	it("respects configured concurrency and preserves result completeness", async () => {
		const queue = new JobQueue({ concurrency: 2 });
		let active = 0;
		let maxActive = 0;
		const starts: string[] = [];

		const runTask = (name: string, ms: number) =>
			queue.enqueue(async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				starts.push(name);
				await wait(ms);
				active -= 1;
				return name;
			});

		const results = await Promise.all([
			runTask("a", 40),
			runTask("b", 40),
			runTask("c", 5),
			runTask("d", 5),
		]);

		expect(maxActive).toBe(2);
		expect(starts.slice(0, 2)).toEqual(["a", "b"]);
		expect(results).toEqual(["a", "b", "c", "d"]);
		expect(new Set(results)).toEqual(new Set(["a", "b", "c", "d"]));
	});

	it("rejects enqueue requests when pending queue exceeds maxPending", async () => {
		const queue = new JobQueue({ concurrency: 1, maxPending: 1 });
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = queue.enqueue(async () => {
			await firstGate;
			return "first";
		});
		const second = queue.enqueue(async () => "second");

		await expect(queue.enqueue(async () => "third")).rejects.toMatchObject({
			code: "QUEUE_BACKPRESSURE",
			maxPending: 1,
		} satisfies Pick<QueueBackpressureError, "code" | "maxPending">);

		releaseFirst?.();
		await expect(first).resolves.toBe("first");
		await expect(second).resolves.toBe("second");
	});

	it("uses OPENUI_QUEUE_MAX_PENDING env value and falls back for invalid configuration", async () => {
		process.env.OPENUI_QUEUE_MAX_PENDING = "2";
		const envQueue = new JobQueue();
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = envQueue.enqueue(async () => {
			await firstGate;
			return "first";
		});
		const second = envQueue.enqueue(async () => "second");
		const third = envQueue.enqueue(async () => "third");

		await expect(envQueue.enqueue(async () => "fourth")).rejects.toMatchObject({
			code: "QUEUE_BACKPRESSURE",
			maxPending: 2,
		});

		releaseFirst?.();
		await Promise.all([first, second, third]);

		process.env.OPENUI_QUEUE_MAX_PENDING = "invalid";
		const fallbackQueue = new JobQueue({ maxPending: 0 });
		const pendingTasks = Array.from({ length: 129 }, (_value, index) => {
			if (index === 0) {
				return fallbackQueue.enqueue(async () => {
					await wait(10);
					return index;
				});
			}
			return fallbackQueue.enqueue(async () => index);
		});

		await expect(fallbackQueue.enqueue(async () => -1)).rejects.toMatchObject({
			code: "QUEUE_BACKPRESSURE",
			maxPending: 128,
		});

		await Promise.allSettled(pendingTasks);
	});

	it("propagates task failures and safely exits when internal shift returns undefined", async () => {
		const queue = new JobQueue({ concurrency: 1 });

		await expect(
			queue.enqueue(async () => {
				throw new Error("task failed");
			}),
		).rejects.toThrow("task failed");

		const internal = queue as unknown as {
			activeCount: number;
			pending: Array<{
				run: () => unknown;
				resolve: (value: unknown) => void;
				reject: (reason?: unknown) => void;
			}> & {
				shift: () =>
					| {
							run: () => unknown;
							resolve: (value: unknown) => void;
							reject: (reason?: unknown) => void;
					  }
					| undefined;
			};
			drain: () => void;
		};
		internal.activeCount = 0;
		internal.pending = [
			{
				run: () => undefined,
				resolve: () => undefined,
				reject: () => undefined,
			},
		] as typeof internal.pending;
		internal.pending.shift = () => undefined;

		expect(internal.drain()).toBeUndefined();
	});

	it("releases concurrency slot after timeout even if timed-out task is still pending", async () => {
		const queue = new JobQueue({
			concurrency: 1,
			safetyTimeoutMs: 5,
		});
		let releaseSlowTask: (() => void) | undefined;
		const slowTaskGate = new Promise<void>((resolve) => {
			releaseSlowTask = resolve;
		});

		const slowTask = queue.enqueue(async () => {
			await slowTaskGate;
			return "slow";
		});

		await expect(slowTask).rejects.toThrow("Task exceeded safety timeout");

		const nextTask = queue.enqueue(async () => {
			return "next";
		});

		await expect(
			Promise.race([nextTask, wait(120).then(() => "__stalled__")]),
		).resolves.toBe("next");
		await expect(queue.enqueue(async () => "after-timeout")).resolves.toBe(
			"after-timeout",
		);

		releaseSlowTask?.();
	});

	it("aborts timed out tasks and resumes queue after task exits", async () => {
		const queue = new JobQueue({
			concurrency: 1,
			safetyTimeoutMs: 5,
		});
		let observedAbort = false;

		const timedOutTask = queue.enqueue(async (signal) => {
			await new Promise<void>((resolve) => {
				if (signal.aborted) {
					observedAbort = true;
					resolve();
					return;
				}
				signal.addEventListener(
					"abort",
					() => {
						observedAbort = true;
						resolve();
					},
					{ once: true },
				);
			});
			return "aborted";
		});

		await expect(timedOutTask).rejects.toThrow("Task exceeded safety timeout");
		expect(observedAbort).toBe(true);
		await expect(queue.enqueue(async () => "next")).resolves.toBe("next");
	});

	it("ignores late task rejection after timeout rejection already settled", async () => {
		const queue = new JobQueue({
			concurrency: 1,
			safetyTimeoutMs: 5,
		});

		const timedOutTask = queue.enqueue(async (signal) => {
			await new Promise<void>((_, reject) => {
				signal.addEventListener(
					"abort",
					() => {
						reject(new Error("late-abort-rejection"));
					},
					{ once: true },
				);
			});
			return "never";
		});

		await expect(timedOutTask).rejects.toThrow("Task exceeded safety timeout");
		await expect(queue.enqueue(async () => "next")).resolves.toBe("next");
	});

	it("keeps compatibility with legacy task signature without AbortSignal", async () => {
		const queue = new JobQueue({ concurrency: 1, safetyTimeoutMs: 100 });
		const legacyTask = vi.fn(async () => "legacy");

		await expect(queue.enqueue(legacyTask)).resolves.toBe("legacy");
		expect(legacyTask).toHaveBeenCalledTimes(1);
		await expect(queue.enqueue(async () => "next")).resolves.toBe("next");
	});

	it("falls back to default integers for invalid constructor options", async () => {
		const queue = new JobQueue({
			concurrency: Number.NaN,
			maxPending: 0,
			safetyTimeoutMs: -1,
		});

		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const first = queue.enqueue(async () => {
			await firstGate;
			return "first";
		});
		const others = Array.from({ length: 128 }, (_value, index) =>
			queue.enqueue(async () => index),
		);

		await expect(queue.enqueue(async () => "overflow")).rejects.toMatchObject({
			code: "QUEUE_BACKPRESSURE",
			maxPending: 128,
		});

		releaseFirst?.();
		await Promise.allSettled([first, ...others]);
	});

	it("handles setTimeout failures without leaking active queue slots", async () => {
		const queue = new JobQueue({ concurrency: 1, safetyTimeoutMs: 10 });
		const timeoutSpy = vi
			.spyOn(globalThis, "setTimeout")
			.mockImplementation(() => {
				throw new Error("timer unavailable");
			});

		await expect(queue.enqueue(async () => "x")).rejects.toThrow(
			"timer unavailable",
		);
		timeoutSpy.mockRestore();

		await expect(queue.enqueue(async () => "y")).resolves.toBe("y");
	});
});
