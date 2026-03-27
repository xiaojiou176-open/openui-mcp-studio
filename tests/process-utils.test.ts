import { afterEach, describe, expect, it, vi } from "vitest";
import { runProcess } from "../packages/shared-runtime/src/process-utils.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runProcess", () => {
	it("captures stdout, stderr, and success exit code", async () => {
		const result = await runProcess({
			command: process.execPath,
			args: ["-e", "process.stdout.write('out'); process.stderr.write('err');"],
			timeoutMs: 2_000,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("out");
		expect(result.stderr).toBe("err");
		expect(result.timedOut).toBe(false);
		expect(result.signal).toBeNull();
		expect(result.errorMessage).toBeNull();
	});

	it("reports spawn errors when command cannot be launched", async () => {
		const result = await runProcess({
			command: "/__openui_non_existent_command__",
			args: [],
			timeoutMs: 500,
		});

		expect(result.exitCode).toBe(1);
		expect(typeof result.errorMessage).toBe("string");
		expect((result.errorMessage ?? "").length).toBeGreaterThan(0);
		expect(result.timedOut).toBe(false);
	});

	it("marks timeout and force-kills when process ignores SIGTERM", async () => {
		const script =
			"process.on('SIGTERM', () => {}); setInterval(() => {}, 100);";
		const result = await runProcess({
			command: process.execPath,
			args: ["-e", script],
			timeoutMs: 50,
			forceKillAfterMs: 20,
		});

		expect(result.timedOut).toBe(true);
		expect(["SIGKILL", "SIGTERM"]).toContain(result.signal);
		expect(result.exitCode).toBe(1);
	});

	it("falls back to child.kill when process group signal throws", async () => {
		const script =
			"process.on('SIGTERM', () => {}); setInterval(() => {}, 100);";
		const originalKill = process.kill;
		const killSpy = vi.spyOn(process, "kill").mockImplementation(((
			pid: number | NodeJS.Signals,
			signal?: NodeJS.Signals,
		) => {
			if (typeof pid === "number" && pid < 0) {
				throw Object.assign(new Error("group signal not allowed"), {
					code: "ESRCH",
				});
			}
			return originalKill(pid as number, signal);
		}) as typeof process.kill);

		try {
			const result = await runProcess({
				command: process.execPath,
				args: ["-e", script],
				timeoutMs: 50,
				forceKillAfterMs: 20,
			});

			expect(result.timedOut).toBe(true);
			expect(result.exitCode).toBe(1);
			expect(killSpy).toHaveBeenCalledWith(expect.any(Number), "SIGTERM");
		} finally {
			killSpy.mockRestore();
		}
	});

	it("falls back to default timeout and output budgets for invalid numeric inputs", async () => {
		const result = await runProcess({
			command: process.execPath,
			args: [
				"-e",
				"process.stdout.write('x'.repeat(32)); process.stderr.write('y'.repeat(32));",
			],
			timeoutMs: Number.NaN,
			maxStdoutBytes: 0,
			maxStderrBytes: -1,
			forceKillAfterMs: 0,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("x".repeat(32));
		expect(result.stderr).toContain("y".repeat(32));
		expect(result.timedOut).toBe(false);
	});
});
