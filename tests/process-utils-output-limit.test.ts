import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { runProcess } from "../packages/shared-runtime/src/process-utils.js";
import { afterEach, vi } from "vitest";

class FakeReadable extends EventEmitter {
	setEncoding(): void {}
}

class FakeChunkedChildProcess extends EventEmitter {
	pid = 5150;
	stdout = new FakeReadable();
	stderr = new FakeReadable();
	kill = vi.fn(() => true);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.doUnmock("node:child_process");
	vi.resetModules();
});

describe("runProcess output limits", () => {
	it("truncates stdout and stderr when output exceeds configured byte limits", async () => {
		const result = await runProcess({
			command: process.execPath,
			args: [
				"-e",
				"process.stdout.write('a'.repeat(200)); process.stderr.write('b'.repeat(200));",
			],
			timeoutMs: 2_000,
			maxStdoutBytes: 64,
			maxStderrBytes: 64,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout.startsWith("a".repeat(64))).toBe(true);
		expect(result.stderr.startsWith("b".repeat(64))).toBe(true);
		expect(result.stdout).toContain("[truncated]");
		expect(result.stderr).toContain("[truncated]");
	});

	it("keeps output unchanged once byte budget is fully consumed", async () => {
		const result = await runProcess({
			command: process.execPath,
			args: [
				"-e",
				"process.stdout.write('a'.repeat(16)); process.stdout.write('b'.repeat(16));",
			],
			timeoutMs: 2_000,
			maxStdoutBytes: 16,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("a".repeat(16));
		expect(result.stdout).not.toContain("b");
		expect(result.stdout).toContain("[truncated]");
	});

	it("keeps later stdout chunks out once the byte budget is already exhausted", async () => {
		vi.resetModules();
		const child = new FakeChunkedChildProcess();
		vi.doMock("node:child_process", () => ({
			spawn: vi.fn(() => child),
		}));

		const { runProcess: runProcessWithMock } = await import(
			"../packages/shared-runtime/src/process-utils.js"
		);
		const pending = runProcessWithMock({
			command: "node",
			args: ["-e", "console.log('unused')"],
			timeoutMs: 2_000,
			maxStdoutBytes: 4,
		});

		child.stdout.emit("data", "abcd");
		child.stdout.emit("data", "EFGH");
		queueMicrotask(() => {
			child.emit("close", 0, null);
		});

		const result = await pending;
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("abcd\n[truncated]\n");
		expect(result.stderr).toBe("");
	});

	it("marks process as timed out when command exceeds timeout", async () => {
		const result = await runProcess({
			command: process.execPath,
			args: ["-e", "setInterval(() => {}, 1000);"],
			timeoutMs: 50,
			forceKillAfterMs: 20,
		});

		expect(result.timedOut).toBe(true);
		expect(result.exitCode).not.toBe(0);
		expect(result.durationMs).toBeGreaterThanOrEqual(50);
	});
});
