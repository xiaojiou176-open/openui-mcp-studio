import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerConvertTools } from "../services/mcp-server/src/tools/convert.js";
import { registerGenerateTool } from "../services/mcp-server/src/tools/generate.js";
import { registerRefineTool } from "../services/mcp-server/src/tools/refine.js";
import { registerShipTool } from "../services/mcp-server/src/tools/ship.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
type ToolConfig = { inputSchema?: { parse: (value: unknown) => unknown } };

function createToolHarness(): {
	server: McpServer;
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
		getConfig(name: string) {
			const config = configs.get(name);
			if (!config) {
				throw new Error(`Missing tool config: ${name}`);
			}
			return config;
		},
	};
}

describe("tools functionResponses schema contract", () => {
	it("enforces one shared functionResponses rule across convert/generate/refine/ship", () => {
		const harness = createToolHarness();
		registerConvertTools(harness.server);
		registerGenerateTool(harness.server);
		registerRefineTool(harness.server);
		registerShipTool(harness.server);

		const targets: Array<{ name: string; baseInput: Record<string, unknown> }> =
			[
				{
					name: "openui_convert_react_shadcn",
					baseInput: { html: "<main>Hello</main>" },
				},
				{
					name: "openui_generate_ui",
					baseInput: { prompt: "Build dashboard" },
				},
				{
					name: "openui_refine_ui",
					baseInput: { html: "<main>Hello</main>", instruction: "add filters" },
				},
				{
					name: "openui_ship_react_page",
					baseInput: { prompt: "Build dashboard" },
				},
			];

		for (const target of targets) {
			const schema = harness.getConfig(target.name).inputSchema;
			expect(schema).toEqual(
				expect.objectContaining({
					parse: expect.any(Function),
				}),
			);

			expect(() =>
				schema?.parse({
					...target.baseInput,
					functionResponses: [{ name: "", response: { ok: true } }],
				}),
			).toThrow(/functionResponses/i);

			expect(() =>
				schema?.parse({
					...target.baseInput,
					functionResponses: [
						{ name: "lookup_weather", response: "bad-shape" },
					],
				}),
			).toThrow(/functionResponses/i);

			const parsed = schema?.parse({
				...target.baseInput,
				functionResponses: [
					{
						name: "  lookup_weather  ",
						response: { city: "Seattle" },
					},
				],
			}) as { functionResponses: Array<{ name: string }> };

			expect(parsed.functionResponses[0]?.name).toBe("lookup_weather");
		}
	});

	it("keeps convert tool compatible by stripping removed response schema params", () => {
		const harness = createToolHarness();
		registerConvertTools(harness.server);
		const schema = harness.getConfig("openui_convert_react_shadcn").inputSchema;
		expect(schema).toEqual(
			expect.objectContaining({
				parse: expect.any(Function),
			}),
		);

		const parsed = schema?.parse({
			html: "<main>Hello</main>",
			responseMimeType: "text/plain",
			responseJsonSchema: { type: "string" },
		}) as Record<string, unknown>;

		expect(Object.hasOwn(parsed, "responseMimeType")).toBe(false);
		expect(Object.hasOwn(parsed, "responseJsonSchema")).toBe(false);
	});
});
