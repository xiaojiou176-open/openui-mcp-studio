import os from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

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
	delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship idempotency extra branches", () => {
	it("returns cached payload when inflight wait resolves to ready", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const idempotency = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);

		const detection = {
			workspaceRoot: "/tmp/openui-workspace",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const cachedPayload = {
			workspaceRoot: "/tmp/openui-workspace",
			detection,
			html: "<main>cached-from-ready</main>",
			files: [
				{
					path: "app/page.tsx",
					content: "export default function Page(){return null;}",
				},
			],
			notes: [],
			apply: { written: ["app/page.tsx"], rolledBack: false },
			quality: { passed: true },
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(idempotency.shipIdempotencyStore, "get").mockResolvedValue(
			undefined,
		);
		vi.spyOn(
			idempotency.shipIdempotencyStore,
			"beginExecution",
		).mockResolvedValue({
			status: "inflight",
		});
		vi.spyOn(idempotency.shipIdempotencyStore, "waitFor").mockResolvedValue({
			status: "ready",
			value: cachedPayload,
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship inflight-ready should reuse cache",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "ready-hit-key",
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as {
			summary: { idempotencyHit: boolean };
			html: string;
		};
		expect(payload.summary.idempotencyHit).toBe(true);
		expect(payload.html).toBe("<main>cached-from-ready</main>");
	});

	it("continues pipeline when idempotency lookup best-effort step fails", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const idempotency = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);

		const detection = {
			workspaceRoot: "/tmp/openui-workspace",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const cachedPayload = {
			workspaceRoot: "/tmp/openui-workspace",
			detection,
			html: "<main>cached-from-beginExecution</main>",
			files: [
				{
					path: "app/page.tsx",
					content: "export default function Page(){return null;}",
				},
			],
			notes: [],
			apply: { written: ["app/page.tsx"], rolledBack: false },
			quality: { passed: true },
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(idempotency.shipIdempotencyStore, "get").mockRejectedValue(
			new Error("cache unavailable"),
		);
		vi.spyOn(
			idempotency.shipIdempotencyStore,
			"beginExecution",
		).mockResolvedValue({
			status: "cached",
			value: cachedPayload,
		} as never);

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship should continue after lookup failure",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "lookup-fail-key",
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as {
			steps: Array<{ name: string; status: string; error?: string }>;
			summary: { idempotencyHit: boolean };
		};
		const lookupStep = payload.steps.find(
			(step) => step.name === "idempotency_lookup",
		);
		expect(lookupStep?.status).toBe("error");
		expect(lookupStep?.error).toContain("cache unavailable");
		expect(payload.summary.idempotencyHit).toBe(true);
	});

	it("fails loudly when inflight idempotency wait ends with timeout_missing", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const idempotency = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);

		const detection = {
			workspaceRoot: "/tmp/openui-workspace",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(
			idempotency.shipIdempotencyStore,
			"beginExecution",
		).mockResolvedValue({
			status: "inflight",
		});
		vi.spyOn(idempotency.shipIdempotencyStore, "waitFor").mockResolvedValue({
			status: "timeout_missing",
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "Ship timeout_missing should fail loudly",
				workspaceRoot: "/tmp/openui-workspace",
				idempotencyKey: "timeout-missing-key",
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow(/status=timeout_missing/);
	});
});
