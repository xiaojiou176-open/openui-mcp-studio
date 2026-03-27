import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;
const ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT =
	process.env.OPENUI_MCP_WORKSPACE_ROOT;

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();

	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const block = result.content.find((item) => item.type === "text");
	if (!block?.text) {
		throw new Error("Tool result is missing text content.");
	}
	return block.text;
}

afterEach(() => {
	if (ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT === undefined) {
		delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	} else {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT;
	}
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("smoke tool", () => {
	it("delegates to runNextSmoke with apps/web default target and returns json text", async () => {
		const runNextSmoke = vi.fn(async () => ({
			passed: true,
		}));
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke,
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		const result = await harness.getHandler("openui_next_smoke")({});
		const payload = JSON.parse(readText(result)) as {
			passed: boolean;
		};
		expect(payload).toEqual({ passed: true });
		expect(runNextSmoke).toHaveBeenCalledWith({ targetRoot: "apps/web" });
		expect(runNextSmoke).toHaveBeenCalledTimes(1);
	});

	it("preserves explicit targetRoot instead of forcing apps/web", async () => {
		const runNextSmoke = vi.fn(async () => ({ passed: true }));
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke,
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await harness.getHandler("openui_next_smoke")({
			targetRoot: "apps/web",
		});

		expect(runNextSmoke).toHaveBeenCalledWith({
			targetRoot: "apps/web",
		});
	});

	it("rejects unknown passthrough input instead of forwarding it", async () => {
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke: vi.fn(async () => ({ passed: true })),
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await expect(
			harness.getHandler("openui_next_smoke")({
				probeTimeoutMs: 1_500,
				shellCommand: "rm -rf /",
			}),
		).rejects.toThrow("openui_next_smoke unavailable");
	});

	it("rejects malicious non-finite timing arguments before invoking smoke runner", async () => {
		const runNextSmoke = vi.fn(async () => ({
			passed: true,
		}));
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke,
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await expect(
			harness.getHandler("openui_next_smoke")({
				probeTimeoutMs: Number.POSITIVE_INFINITY,
			}),
		).rejects.toThrow("openui_next_smoke unavailable");
		expect(runNextSmoke).not.toHaveBeenCalled();
	});

	it("throws explicit unavailable error when runNextSmoke export is missing", async () => {
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await expect(harness.getHandler("openui_next_smoke")({})).rejects.toThrow(
			"openui_next_smoke unavailable",
		);
	});

	it("includes missing export detail when next-smoke lacks runNextSmoke", async () => {
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({ runNextSmoke: undefined }));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await expect(harness.getHandler("openui_next_smoke")({})).rejects.toThrow(
			"next-smoke module does not export runNextSmoke.",
		);
	});

	it("reuses cached next-smoke runner for repeated invocations", async () => {
		const runNextSmoke = vi.fn(async () => ({ passed: true }));
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke,
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await harness.getHandler("openui_next_smoke")({ probeTimeoutMs: 10 });
		await harness.getHandler("openui_next_smoke")({ probeTimeoutMs: 20 });

		expect(runNextSmoke).toHaveBeenCalledTimes(2);
		expect(runNextSmoke).toHaveBeenNthCalledWith(1, {
			probeTimeoutMs: 10,
			targetRoot: "apps/web",
		});
		expect(runNextSmoke).toHaveBeenNthCalledWith(2, {
			probeTimeoutMs: 20,
			targetRoot: "apps/web",
		});
	});

	it("returns plain text result when runNextSmoke resolves a string", async () => {
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke: vi.fn(async () => "plain smoke result"),
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		const result = await harness.getHandler("openui_next_smoke")({});
		expect(readText(result)).toBe("plain smoke result");
	});

	it("stringifies non-Error failures from smoke runner", async () => {
		vi.doMock("../services/mcp-server/src/next-smoke.js", () => ({
			runNextSmoke: vi.fn(async () => {
				throw "runner exploded";
			}),
		}));

		const { registerSmokeTool } = await import("../services/mcp-server/src/tools/smoke.js");
		const harness = createToolHarness();
		registerSmokeTool(harness.server);

		await expect(harness.getHandler("openui_next_smoke")({})).rejects.toThrow(
			"openui_next_smoke unavailable: runner exploded",
		);
	});
});

async function writeNextRuntimeFixture(root: string): Promise<void> {
	await fs.mkdir(root, { recursive: true });
	await fs.writeFile(
		path.join(root, "package.json"),
		JSON.stringify({
			name: "fixture",
			private: true,
			dependencies: {
				next: "15.0.0",
			},
		}),
		"utf8",
	);
}

describe("next smoke target root guardrails", () => {
	it("rejects preferred roots outside workspace without falling back", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-smoke-workspace-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-smoke-outside-"),
		);

		try {
			await writeNextRuntimeFixture(outsideRoot);
			process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;

			const [{ chooseRoot }, { LogTailBuffer }] = await Promise.all([
				import("../services/mcp-server/src/next-smoke/target-root.js"),
				import("../services/mcp-server/src/next-smoke/logging.js"),
			]);
			const logs = new LogTailBuffer(20);

				const selected = await chooseRoot(
					{
						targetRoot: outsideRoot,
					},
					logs,
				);

				expect(selected).toMatchObject({
					validation: {
						ok: false,
					},
				});
				expect(logs.snapshot().join("\n")).toContain(
					"outside workspace boundary",
				);
			} finally {
				delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
				await Promise.all([
					fs.rm(workspaceRoot, { recursive: true, force: true }),
					fs.rm(outsideRoot, { recursive: true, force: true }),
				]);
			}
		});
});

describe("next smoke probe timing guardrails", () => {
	it("normalizes invalid and too-small probe timing values", async () => {
		const [{ LogTailBuffer }, probeModule] = await Promise.all([
			import("../services/mcp-server/src/next-smoke/logging.js"),
			import("../services/mcp-server/src/next-smoke/probe.js"),
		]);
		const logs = new LogTailBuffer(20);

		const normalized = probeModule.normalizeProbeTimings({
			timeoutMs: Number.NaN,
			intervalMs: 1,
			logs,
		});

		expect(normalized.timeoutMs).toBeGreaterThanOrEqual(
			probeModule.MIN_PROBE_TIMEOUT_MS,
		);
		expect(normalized.intervalMs).toBeGreaterThanOrEqual(
			probeModule.MIN_PROBE_INTERVAL_MS,
		);
		expect(normalized.intervalMs).toBeLessThanOrEqual(normalized.timeoutMs);
	});
});
