import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

const DETECTION_FIXTURE = {
	workspaceRoot: "/tmp/openui-workspace",
	source: "default" as const,
	uiImportBase: "@/components/ui",
	uiDir: "components/ui",
	componentsImportBase: "@/components",
	componentsDir: "components",
	evidence: ["fixture"],
};

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

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("advanced feature strategy contract", () => {
	it("openui_generate_ui forwards advanced controls to provider call", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: DETECTION_FIXTURE,
			uiImportBase: DETECTION_FIXTURE.uiImportBase,
			styleGuide: "Use compact card grid",
		});

		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>generated</main>");

		const { registerGenerateTool } = await import(
			"../services/mcp-server/src/tools/generate.js"
		);
		const harness = createToolHarness();
		registerGenerateTool(harness.server);

		await harness.getHandler("openui_generate_ui")({
			prompt: "Build dashboard",
			workspaceRoot: "/tmp/openui-workspace",
			thinkingLevel: "high",
			includeThoughts: true,
			responseMimeType: "application/json",
			responseJsonSchema: {
				type: "object",
				properties: { title: { type: "string" } },
			},
			tools: [{ function_declarations: [{ name: "lookup_weather" }] }],
			toolChoice: { type: "function", function: { name: "lookup_weather" } },
			functionResponses: [
				{ name: "lookup_weather", response: { city: "Seattle" } },
			],
			cachedContent: "cache-entry",
			cacheTtlSeconds: 120,
			mediaResolution: "high",
			useFast: true,
		});

		expect(completeSpy).toHaveBeenCalledTimes(1);
		expect(completeSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				routeKey: "fast",
				thinkingLevel: "high",
				includeThoughts: true,
				responseMimeType: "application/json",
				responseJsonSchema: {
					type: "object",
					properties: { title: { type: "string" } },
				},
				tools: [{ function_declarations: [{ name: "lookup_weather" }] }],
				toolChoice: { type: "function", function: { name: "lookup_weather" } },
				functionResponses: [
					{ name: "lookup_weather", response: { city: "Seattle" } },
				],
				cachedContent: "cache-entry",
				cacheTtlSeconds: 120,
				mediaResolution: "high",
			}),
		);
		const request = completeSpy.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(Object.hasOwn(request, "useFast")).toBe(false);
	}, 20_000);

	it("openui_make_react_page keeps strong route while forwarding advanced controls", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: DETECTION_FIXTURE,
			uiImportBase: DETECTION_FIXTURE.uiImportBase,
			styleGuide: "Use strict spacing",
		});

		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>generated</main>");

		const convertSpy = vi
			.spyOn(shared, "convertHtmlToReactShadcn")
			.mockResolvedValue({
				detection: DETECTION_FIXTURE,
				payload: {
					files: [
						{
							path: "app/page.tsx",
							content: "export default function Page() { return null; }",
						},
					],
					notes: ["converted"],
				},
			});

		const { registerConvertTools } = await import(
			"../services/mcp-server/src/tools/convert.js"
		);
		const harness = createToolHarness();
		registerConvertTools(harness.server);

		await harness.getHandler("openui_make_react_page")({
			prompt: "Create marketing page",
			pagePath: "app/page.tsx",
			componentsDir: "components/generated",
			workspaceRoot: "/tmp/openui-workspace",
			thinkingLevel: "high",
			includeThoughts: true,
			responseMimeType: "application/json",
			responseJsonSchema: {
				type: "object",
				properties: { files: { type: "array" } },
			},
			tools: [{ function_declarations: [{ name: "lookup_palette" }] }],
			toolChoice: { type: "function", function: { name: "lookup_palette" } },
			functionResponses: [
				{ name: "lookup_palette", response: { palette: "neutral" } },
			],
			cachedContent: "cache-entry",
			cacheTtlSeconds: 90,
			mediaResolution: "ultra_high",
			useFast: false,
		});

		expect(completeSpy).toHaveBeenCalledTimes(1);
		expect(completeSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				routeKey: "strong",
				thinkingLevel: "high",
				includeThoughts: true,
				responseMimeType: "application/json",
				responseJsonSchema: {
					type: "object",
					properties: { files: { type: "array" } },
				},
				tools: [{ function_declarations: [{ name: "lookup_palette" }] }],
				toolChoice: { type: "function", function: { name: "lookup_palette" } },
				functionResponses: [
					{ name: "lookup_palette", response: { palette: "neutral" } },
				],
				cachedContent: "cache-entry",
				cacheTtlSeconds: 90,
				mediaResolution: "ultra_high",
			}),
		);
		const request = completeSpy.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(Object.hasOwn(request, "useFast")).toBe(false);

		expect(convertSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				thinkingLevel: "high",
				includeThoughts: true,
				toolChoice: { type: "function", function: { name: "lookup_palette" } },
				functionResponses: [
					{ name: "lookup_palette", response: { palette: "neutral" } },
				],
				cachedContent: "cache-entry",
				cacheTtlSeconds: 90,
				mediaResolution: "ultra_high",
			}),
		);
	}, 20_000);
});
