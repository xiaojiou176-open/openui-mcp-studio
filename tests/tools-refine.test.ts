import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;
type ToolConfig = { inputSchema?: { parse: (value: unknown) => unknown } };

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
	getConfig: (name: string) => ToolConfig;
} {
	const handlers = new Map<string, ToolHandler>();
	const configs = new Map<string, ToolConfig>();

	const server = {
		registerTool(name: string, config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
			configs.set(name, (config as ToolConfig) || {});
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
		getConfig(name: string) {
			const config = configs.get(name);
			if (!config) {
				throw new Error(`Missing tool config: ${name}`);
			}
			return config;
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
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("refine tool", () => {
	it("builds refine request with html + instruction + style guide", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: {
				workspaceRoot: "/tmp/workspace",
				source: "default",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["default"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use compact spacing",
		});

		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>refined</main>");

		const { registerRefineTool } = await import("../services/mcp-server/src/tools/refine.js");
		const harness = createToolHarness();
		registerRefineTool(harness.server);

		const result = await harness.getHandler("openui_refine_ui")({
			html: "<main>before</main>",
			instruction: "add filter bar",
			model: "gemini-3-pro-preview",
			workspaceRoot: "/tmp/workspace",
		});

		expect(completeSpy).toHaveBeenCalledTimes(1);
		expect(completeSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "gemini-3-pro-preview",
				routeKey: "fast",
				temperature: 0.2,
			}),
		);

		const request = completeSpy.mock.calls[0]?.[0];
		expect((request?.prompt as string) || "").toContain("<main>before</main>");
		expect((request?.prompt as string) || "").toContain("add filter bar");
		expect((request?.prompt as string) || "").toContain("Use compact spacing");
		expect((request?.system as string) || "").toContain(
			"Return only the complete updated HTML (no markdown fences).",
		);
		expect((request?.system as string) || "").toContain(
			"Keep accessibility and responsive layout.",
		);
		expect((request?.requestId as string) || "").toMatch(/^refine_/);
		expect(request?.policyConfig).toEqual(
			expect.objectContaining({
				uiWorkflow: true,
			}),
		);
		expect(readText(result)).toBe("<main>refined</main>");
	});

	it("does not pass useFast when routeKey is fixed by tool policy", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: {
				workspaceRoot: "/tmp/workspace",
				source: "default",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["default"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use compact spacing",
		});

		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>refined</main>");

		const { registerRefineTool } = await import("../services/mcp-server/src/tools/refine.js");
		const harness = createToolHarness();
		registerRefineTool(harness.server);

		await harness.getHandler("openui_refine_ui")({
			html: "<main>before</main>",
			instruction: "add filter bar",
			useFast: true,
		});

		expect(completeSpy).toHaveBeenCalledTimes(1);
		const request = completeSpy.mock.calls[0]?.[0] as
			| Record<string, unknown>
			| undefined;
		expect(request?.routeKey).toBe("fast");
		expect(Object.hasOwn(request ?? {}, "useFast")).toBe(false);
	});

	it("rejects invalid functionResponses payload early", async () => {
		const { registerRefineTool } = await import("../services/mcp-server/src/tools/refine.js");
		const harness = createToolHarness();
		registerRefineTool(harness.server);
		const schema = harness.getConfig("openui_refine_ui").inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		expect(() =>
			schema?.parse({
				html: "<main>before</main>",
				instruction: "add filter bar",
				functionResponses: [{ name: "", response: { city: "Seattle" } }],
			}),
		).toThrow(/functionResponses/i);
	});

	it("rejects non-object function response payload", async () => {
		const { registerRefineTool } = await import("../services/mcp-server/src/tools/refine.js");
		const harness = createToolHarness();
		registerRefineTool(harness.server);
		const schema = harness.getConfig("openui_refine_ui").inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		expect(() =>
			schema?.parse({
				html: "<main>before</main>",
				instruction: "add filter bar",
				functionResponses: [{ name: "lookup_weather", response: "bad-shape" }],
			}),
		).toThrow(/functionResponses/i);
	});

	it("rejects empty instruction and keeps tool description stable", async () => {
		const { registerRefineTool } = await import("../services/mcp-server/src/tools/refine.js");
		const harness = createToolHarness();
		registerRefineTool(harness.server);

		const config = harness.getConfig("openui_refine_ui");
		expect((config as { description?: string }).description).toBe(
			"Refine existing HTML UI using a natural language instruction. Returns full updated HTML.",
		);

		const schema = config.inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		expect(() =>
			schema?.parse({
				html: "<main>before</main>",
				instruction: "",
			}),
		).toThrow(/instruction/i);
	});
});
