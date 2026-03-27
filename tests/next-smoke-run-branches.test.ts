import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRunWithMocks(options: {
	chooseRoot: unknown;
	ensureDependenciesInstalled?: unknown;
	runBuildStep?: unknown;
	startServerStep?: unknown;
	probeServer?: unknown;
	terminateChildProcess?: unknown;
	findOpenPort?: unknown;
}): Promise<typeof import("../services/mcp-server/src/next-smoke/run.js")> {
	vi.resetModules();

	vi.doMock("../services/mcp-server/src/next-smoke/target-root.js", () => ({
		chooseRoot: options.chooseRoot,
	}));

	vi.doMock("../services/mcp-server/src/next-smoke/process.js", () => ({
		createSkippedStart: (command: string, reason: string) => ({
			ok: false,
			command,
			exitCode: null,
			timedOut: false,
			durationMs: 0,
			detail: reason,
			pid: null,
			cleanup: "not-needed",
		}),
		createSkippedStep: (command: string, reason: string) => ({
			ok: false,
			command,
			exitCode: null,
			timedOut: false,
			durationMs: 0,
			detail: reason,
		}),
		ensureDependenciesInstalled:
			options.ensureDependenciesInstalled ??
			vi.fn(async () => ({ ok: true, detail: "deps ok" })),
		findOpenPort: options.findOpenPort ?? vi.fn(async () => 3210),
		getCommandForStep: ({ step, cwd }: { step: string; cwd: string }) => ({
			executable: `${cwd}/node_modules/.bin/next`,
			command: `next ${step}`,
			args: [step],
		}),
		getNominalCommand: (step: "build" | "start") => `next ${step}`,
		runBuildStep:
			options.runBuildStep ??
			vi.fn(async () => ({
				ok: true,
				command: "next build",
				exitCode: 0,
				timedOut: false,
				durationMs: 1,
				detail: "build ok",
			})),
		startServerStep:
			options.startServerStep ??
			vi.fn(async () => ({
				step: {
					ok: true,
					command: "next start",
					exitCode: null,
					timedOut: false,
					durationMs: 1,
					detail: "start ok",
					pid: 222,
					cleanup: "not-needed",
				},
				child: { pid: 222, exitCode: null, signalCode: null },
			})),
		terminateChildProcess:
			options.terminateChildProcess ??
			vi.fn(async () => ({ ok: true, cleanup: "sigterm", detail: "cleaned" })),
	}));

	vi.doMock("../services/mcp-server/src/next-smoke/probe.js", () => ({
		createSkippedProbe: (url: string, reason: string) => ({
			ok: false,
			url,
			statusCode: null,
			durationMs: 0,
			detail: reason,
		}),
		probeServer:
			options.probeServer ??
			vi.fn(async (input: { url: string }) => ({
				ok: true,
				url: input.url,
				statusCode: 200,
				durationMs: 1,
				detail: "probe ok",
			})),
	}));

	return import("../services/mcp-server/src/next-smoke/run.js");
}

describe("next-smoke run branches", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns skipped steps when target selection fails", async () => {
			const run = await loadRunWithMocks({
				chooseRoot: vi.fn(async () => ({
					validation: {
					ok: false,
					reason: "missing package.json",
					root: "/missing",
				},
			})),
		});

		const result = await run.runNextSmoke({});
		expect(result.passed).toBe(false);
		expect(result.build.detail).toContain("Target selection failed");
		expect(result.start.detail).toContain("no usable target root");
		expect(result.probe.detail).toContain("did not run");
	});

	it("returns skipped build/start/probe when dependency install fails", async () => {
			const run = await loadRunWithMocks({
				chooseRoot: vi.fn(async () => ({
					validation: { ok: true, root: "/ok", reason: "ok" },
			})),
			ensureDependenciesInstalled: vi.fn(async () => ({
				ok: false,
				detail: "npm install failed",
			})),
		});

		const result = await run.runNextSmoke({});
		expect(result.passed).toBe(false);
		expect(result.build.detail).toContain("dependency install failed");
		expect(result.start.detail).toContain("build did not run");
	});

	it("returns start-failed probe when start step has no child", async () => {
			const run = await loadRunWithMocks({
				chooseRoot: vi.fn(async () => ({
					validation: { ok: true, root: "/ok", reason: "ok" },
			})),
			startServerStep: vi.fn(async () => ({
				step: {
					ok: false,
					command: "next start",
					exitCode: 1,
					timedOut: false,
					durationMs: 1,
					detail: "start exploded",
					pid: null,
					cleanup: "not-needed",
				},
				child: null,
			})),
		});

		const result = await run.runNextSmoke({ probePath: "/health" });
		expect(result.passed).toBe(false);
		expect(result.start.detail).toContain("start exploded");
		expect(result.probe.detail).toContain("Skipped because start failed");
		expect(result.probe.url).toContain("/health");
	});

	it("marks start as failed when cleanup fails after successful probe", async () => {
			const run = await loadRunWithMocks({
				chooseRoot: vi.fn(async () => ({
					validation: { ok: true, root: "/ok", reason: "ok" },
			})),
			terminateChildProcess: vi.fn(async () => ({
				ok: false,
				cleanup: "failed",
				detail: "kill failed",
			})),
		});

		const result = await run.runNextSmoke({ probePath: "/" });
		expect(result.build.ok).toBe(true);
		expect(result.probe.ok).toBe(true);
		expect(result.start.ok).toBe(false);
		expect(result.start.cleanup).toBe("failed");
		expect(result.start.detail).toContain("Cleanup: kill failed");
		expect(result.passed).toBe(false);
	});
});
