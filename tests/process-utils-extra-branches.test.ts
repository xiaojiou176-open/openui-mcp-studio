import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
	vi.doUnmock("node:child_process");
});

describe("runProcess extra branches", () => {
	it("times out cleanly when child.pid is missing", async () => {
		const killSpy = vi.fn();
		const child = new PassThrough() as PassThrough & {
			stdout: PassThrough;
			stderr: PassThrough;
			pid?: number;
			kill: typeof killSpy;
		};
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.pid = undefined;
		child.kill = killSpy;

		vi.doMock("node:child_process", () => ({
			spawn: vi.fn(() => child),
		}));

		const { runProcess } = await import(
			"../packages/shared-runtime/src/process-utils.js"
		);

		const closeTimer = setTimeout(() => {
			child.emit("close", null, "SIGTERM");
		}, 30);

		try {
			const result = await runProcess({
				command: "mocked",
				args: [],
				timeoutMs: 10,
				forceKillAfterMs: 5,
			});

			expect(result.timedOut).toBe(true);
			expect(result.signal).toBe("SIGTERM");
			expect(result.exitCode).toBe(1);
			expect(killSpy).not.toHaveBeenCalled();
		} finally {
			clearTimeout(closeTimer);
		}
	});

	it("appends truncated markers when error events fire after stdout/stderr limits are exceeded", async () => {
		const child = new PassThrough() as PassThrough & {
			stdout: PassThrough;
			stderr: PassThrough;
			pid?: number;
			kill: ReturnType<typeof vi.fn>;
		};
		child.stdout = new PassThrough();
		child.stderr = new PassThrough();
		child.pid = 1234;
		child.kill = vi.fn();

		vi.doMock("node:child_process", () => ({
			spawn: vi.fn(() => child),
		}));

		const { runProcess } = await import(
			"../packages/shared-runtime/src/process-utils.js"
		);

		const resultPromise = runProcess({
			command: "mocked",
			args: [],
			timeoutMs: 100,
			maxStdoutBytes: 4,
			maxStderrBytes: 4,
		});
		await Promise.resolve();

		child.stdout.write("abcdefgh");
		child.stderr.write("ijklmnop");
		child.emit("error", new Error("boom"));

		const result = await resultPromise;
		expect(result.exitCode).toBe(1);
		expect(result.errorMessage).toBe("boom");
		expect(result.stdout).toContain("[truncated]");
		expect(result.stderr).toContain("[truncated]");
		expect(result.timedOut).toBe(false);
	});
});
