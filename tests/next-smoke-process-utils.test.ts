import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogTailBuffer } from "../services/mcp-server/src/next-smoke/logging.js";
import { runBuildStep } from "../services/mcp-server/src/next-smoke/process-build.js";
import {
	createSkippedStart,
	createSkippedStep,
	getCommandForStep,
	getNominalCommand,
} from "../services/mcp-server/src/next-smoke/process-command.js";
import {
	terminateChildProcess,
	waitForExitWithTimeout,
} from "../services/mcp-server/src/next-smoke/process-exit.js";
import { ensureDependenciesInstalled } from "../services/mcp-server/src/next-smoke/process-install.js";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const runtimeRoot = path.join(os.tmpdir(), "openui-next-smoke-tests");
	await fs.mkdir(runtimeRoot, { recursive: true });
	const dir = await fs.mkdtemp(path.join(runtimeRoot, prefix));
	tempDirs.push(dir);
	return dir;
}

class FakeChild extends EventEmitter {
	public exitCode: number | null = null;
	public signalCode: NodeJS.Signals | null = null;
	public pid: number | undefined = 123;
	public kills: NodeJS.Signals[] = [];
	public throwOnKill = false;
	public ignoreSigterm = false;

	public kill(signal: NodeJS.Signals): boolean {
		this.kills.push(signal);
		if (this.throwOnKill) {
			throw new Error("kill failed");
		}
		if (signal === "SIGTERM" && !this.ignoreSigterm) {
			this.exitCode = 0;
			this.emit("exit", 0, null);
		}
		if (signal === "SIGKILL") {
			this.signalCode = "SIGKILL";
			this.emit("exit", null, "SIGKILL");
		}
		return true;
	}
}

afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("next-smoke process utils", () => {
	it("builds nominal/skip commands", () => {
		expect(getNominalCommand("build")).toBe("next build");

		const command = getCommandForStep({ step: "start", cwd: "/tmp/app" });
		expect(command.command).toBe("next start");
		expect(command.executable).toContain("/tmp/app/node_modules/.bin/");
		expect(command.args).toEqual(["start"]);

		expect(createSkippedStep("next build", "x")).toEqual(
			expect.objectContaining({
				ok: false,
				timedOut: false,
				durationMs: 0,
				detail: "x",
			}),
		);
		expect(createSkippedStart("next start", "y")).toEqual(
			expect.objectContaining({
				ok: false,
				cleanup: "not-needed",
				detail: "y",
			}),
		);
	});

	it("waitForExitWithTimeout returns immediate, timeout, and exit paths", async () => {
		const immediate = new FakeChild();
		immediate.exitCode = 1;
		await expect(
			waitForExitWithTimeout(immediate as never, 10),
		).resolves.toEqual({
			exited: true,
			code: 1,
			signal: null,
		});

		vi.useFakeTimers();
		const timeoutChild = new FakeChild();
		const timeoutPromise = waitForExitWithTimeout(timeoutChild as never, 100);
		await vi.advanceTimersByTimeAsync(100);
		await expect(timeoutPromise).resolves.toEqual({
			exited: false,
			code: null,
			signal: null,
		});
		vi.useRealTimers();

		const exitChild = new FakeChild();
		const exitPromise = waitForExitWithTimeout(exitChild as never, 1000);
		exitChild.exitCode = 0;
		exitChild.emit("exit", 0, null);
		await expect(exitPromise).resolves.toEqual({
			exited: true,
			code: 0,
			signal: null,
		});
	});

	it("waitForExitWithTimeout removes listeners on timeout and spawn error", async () => {
		vi.useFakeTimers();
		const timeoutChild = new FakeChild();
		const timeoutPromise = waitForExitWithTimeout(timeoutChild as never, 100);
		expect(timeoutChild.listenerCount("exit")).toBe(1);
		expect(timeoutChild.listenerCount("error")).toBe(1);

		await vi.advanceTimersByTimeAsync(100);
		await expect(timeoutPromise).resolves.toEqual({
			exited: false,
			code: null,
			signal: null,
		});
		expect(timeoutChild.listenerCount("exit")).toBe(0);
		expect(timeoutChild.listenerCount("error")).toBe(0);
		vi.useRealTimers();

		const errorChild = new FakeChild();
		const errorPromise = waitForExitWithTimeout(errorChild as never, 5_000);
		errorChild.emit("error", new Error("spawn failed"));
		await expect(errorPromise).resolves.toEqual({
			exited: false,
			code: null,
			signal: null,
		});
		expect(errorChild.listenerCount("exit")).toBe(0);
		expect(errorChild.listenerCount("error")).toBe(0);
	});

	it("terminateChildProcess handles already-exited, sigterm, and sigterm failure", async () => {
		const alreadyExited = new FakeChild();
		alreadyExited.exitCode = 0;
		await expect(
			terminateChildProcess(alreadyExited as never),
		).resolves.toEqual(
			expect.objectContaining({ ok: true, cleanup: "already-exited" }),
		);

		const active = new FakeChild();
		const terminated = await terminateChildProcess(active as never);
		expect(terminated.ok).toBe(true);
		expect(terminated.cleanup).toBe("sigterm");
		expect(active.kills).toContain("SIGTERM");

		const broken = new FakeChild();
		broken.throwOnKill = true;
		const failed = await terminateChildProcess(broken as never);
		expect(failed.ok).toBe(false);
		expect(failed.cleanup).toBe("failed");
		expect(failed.detail).toContain("Failed to send SIGTERM");
	});

	it("terminateChildProcess uses direct child-handle SIGKILL escalation", async () => {
		vi.useFakeTimers();
		const active = new FakeChild();
		active.ignoreSigterm = true;
		const processKillSpy = vi.spyOn(process, "kill");

		const terminationPromise = terminateChildProcess(active as never);
		await vi.advanceTimersByTimeAsync(1_500);
		await expect(terminationPromise).resolves.toEqual(
			expect.objectContaining({ ok: true, cleanup: "sigkill" }),
		);
		expect(active.kills).toEqual(["SIGTERM", "SIGKILL"]);
		expect(processKillSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});

	it("terminateChildProcess refuses to signal an untracked pid", async () => {
		const untracked = new FakeChild();
		untracked.pid = undefined;

		await expect(terminateChildProcess(untracked as never)).resolves.toEqual(
			expect.objectContaining({
				ok: false,
				cleanup: "failed",
				detail: "Refusing to signal a process without a recorded positive pid.",
			}),
		);
		expect(untracked.kills).toEqual([]);
	});

	it("runBuildStep fails fast on spawn error without waiting full timeout", async () => {
		const timeoutMs = 3_000;
		const logs = new LogTailBuffer(20);
		const missingCwd = path.join(
			await mkTempDir("next-smoke-build-failfast-"),
			"missing-cwd",
		);

		const result = await runBuildStep({
			cwd: missingCwd,
			timeoutMs,
			logs,
			command: {
				command: "next build",
				executable: process.execPath,
				args: ["-e", "console.log('noop')"],
			},
		});

		expect(result.ok).toBe(false);
		expect(result.timedOut).toBe(false);
		expect(result.detail).toContain("failed before execution");
		expect(result.durationMs).toBeLessThan(timeoutMs / 2);
	});

	it("ensureDependenciesInstalled fails fast on spawn error without waiting full timeout", async () => {
		const timeoutMs = 3_000;
		const logs = new LogTailBuffer(20);
		const missingCwd = path.join(
			await mkTempDir("next-smoke-install-failfast-"),
			"missing-cwd",
		);

		const result = await ensureDependenciesInstalled({
			cwd: missingCwd,
			logs,
			timeoutMs,
			requiredPackages: ["next"],
		});

		expect(result.ok).toBe(false);
		expect(result.detail).toContain("failed before execution");
	});
});
