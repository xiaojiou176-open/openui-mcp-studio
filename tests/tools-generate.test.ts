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

describe("generate tool", () => {
	it("builds html generation request with style constraints", async () => {
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
			styleGuide: "Use grid + card layout",
		});

		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>generated</main>");

		const { registerGenerateTool } = await import("../services/mcp-server/src/tools/generate.js");
		const harness = createToolHarness();
		registerGenerateTool(harness.server);

		const result = await harness.getHandler("openui_generate_ui")({
			prompt: "Build admin dashboard",
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
		expect((request?.prompt as string) || "").toContain(
			"Build admin dashboard",
		);
		expect((request?.prompt as string) || "").toContain(
			"Use grid + card layout",
		);
		expect((request?.system as string) || "").toContain(
			"Return only HTML (no markdown fences).",
		);
		expect((request?.system as string) || "").toContain(
			"Use semantic structure and accessibility best practices.",
		);
		expect((request?.requestId as string) || "").toMatch(/^generate_/);
		expect(request?.policyConfig).toEqual(
			expect.objectContaining({
				uiWorkflow: true,
			}),
		);
		expect(readText(result)).toBe("<main>generated</main>");
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
			styleGuide: "Use grid + card layout",
		});
		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>generated</main>");

		const { registerGenerateTool } = await import("../services/mcp-server/src/tools/generate.js");
		const harness = createToolHarness();
		registerGenerateTool(harness.server);

		await harness.getHandler("openui_generate_ui")({
			prompt: "Build admin dashboard",
			model: "gemini-3-pro-preview",
			workspaceRoot: "/tmp/workspace",
			useFast: true,
		});

		expect(completeSpy).toHaveBeenCalledTimes(1);
		const request = completeSpy.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(request.routeKey).toBe("fast");
		expect(Object.hasOwn(request, "useFast")).toBe(false);
	});

	it("rejects invalid functionResponses payload early", async () => {
		const { registerGenerateTool } = await import("../services/mcp-server/src/tools/generate.js");
		const harness = createToolHarness();
		registerGenerateTool(harness.server);
		const schema = harness.getConfig("openui_generate_ui").inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		expect(() =>
			schema?.parse({
				prompt: "Build admin dashboard",
				functionResponses: [{ name: "lookup_weather", response: "bad-shape" }],
			}),
		).toThrow(/functionResponses/i);
	});

	it("rejects empty function response name", async () => {
		const { registerGenerateTool } = await import("../services/mcp-server/src/tools/generate.js");
		const harness = createToolHarness();
		registerGenerateTool(harness.server);
		const schema = harness.getConfig("openui_generate_ui").inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		expect(() =>
			schema?.parse({
				prompt: "Build admin dashboard",
				functionResponses: [{ name: "", response: { ok: true } }],
			}),
		).toThrow(/functionResponses/i);
	});

	it("rejects empty prompt and keeps tool description stable", async () => {
		const { registerGenerateTool } = await import("../services/mcp-server/src/tools/generate.js");
		const harness = createToolHarness();
		registerGenerateTool(harness.server);

		const config = harness.getConfig("openui_generate_ui");
		expect((config as { description?: string }).description).toBe(
			"Generate modern HTML UI from a prompt.",
		);

		const schema = config.inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		expect(() =>
			schema?.parse({
				prompt: "",
			}),
		).toThrow(/prompt/i);
	});
});
