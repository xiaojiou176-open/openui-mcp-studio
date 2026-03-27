import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeReadable extends EventEmitter {}

class FakeChildProcess extends EventEmitter {
	pid = 4242;
	stdout = new FakeReadable();
	stderr = new FakeReadable();
	kill = vi.fn((signal?: NodeJS.Signals) => {
		if (signal === "SIGKILL") {
			queueMicrotask(() => {
				this.emit("close", null, "SIGKILL");
			});
		}
		return true;
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.doUnmock("node:child_process");
	vi.resetModules();
});

describe("runProcess force-kill fallback", () => {
	it("uses child.kill(SIGKILL) when process group SIGKILL throws", async () => {
		vi.resetModules();
		const child = new FakeChildProcess();
		vi.doMock("node:child_process", () => ({
			spawn: vi.fn(() => child),
		}));

		const { runProcess } = await import(
			"../packages/shared-runtime/src/process-utils.js"
		);
		const originalKill = process.kill;
		const killSpy = vi.spyOn(process, "kill").mockImplementation(((
			pid: number | NodeJS.Signals,
			signal?: NodeJS.Signals,
		) => {
			if (typeof pid === "number" && pid < 0 && signal === "SIGKILL") {
				throw Object.assign(new Error("group sigkill blocked"), {
					code: "ESRCH",
				});
			}
			return originalKill(pid as number, signal);
		}) as typeof process.kill);

		const result = await runProcess({
			command: "node",
			args: ["-e", "setInterval(() => {}, 1000);"],
			timeoutMs: 1,
			forceKillAfterMs: 1,
		});

		expect(result.timedOut).toBe(true);
		expect(result.signal).toBe("SIGKILL");
		expect(killSpy).toHaveBeenCalledWith(-child.pid, "SIGTERM");
		expect(killSpy).toHaveBeenCalledWith(-child.pid, "SIGKILL");
		expect(child.kill).toHaveBeenCalledWith("SIGKILL");
	});
});
