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

describe("ship idempotency status branches", () => {
	it("reuses cached beginExecution payload immediately", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const idempotency = await import("../packages/shared-runtime/src/idempotency-store.js");

		const payload = {
			workspaceRoot: "/tmp/openui-workspace",
			detection: { source: "cached" },
			html: "<main>cached</main>",
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
			detection: {
				workspaceRoot: "/tmp/openui-workspace",
				source: "default" as const,
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["fixture"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use cards",
		});
		vi.spyOn(
			idempotency.shipIdempotencyStore,
			"beginExecution",
		).mockResolvedValue({
			status: "cached",
			value: payload,
		} as never);

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Reuse cached payload",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "cached-key",
			dryRun: false,
			runCommands: false,
		});

		const parsed = JSON.parse(readText(result)) as {
			summary: { idempotencyHit: boolean };
			html: string;
		};
		expect(parsed.summary.idempotencyHit).toBe(true);
		expect(parsed.html).toBe("<main>cached</main>");
	});

	it("fails when beginExecution returns an unexpected non-acquired status", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const idempotency = await import("../packages/shared-runtime/src/idempotency-store.js");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: {
				workspaceRoot: "/tmp/openui-workspace",
				source: "default" as const,
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["fixture"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use cards",
		});
		vi.spyOn(
			idempotency.shipIdempotencyStore,
			"beginExecution",
		).mockResolvedValue({
			status: "unexpected",
		} as never);

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "Unexpected idempotency status",
				workspaceRoot: "/tmp/openui-workspace",
				idempotencyKey: "unexpected-key",
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow(/did not acquire lease/);
	});
});
