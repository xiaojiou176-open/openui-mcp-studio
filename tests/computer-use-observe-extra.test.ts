import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerComputerUseTool } from "../services/mcp-server/src/tools/computer-use.js";

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
	vi.restoreAllMocks();
});

describe("computer use observe extra branches", () => {
	it("returns dry-run metadata when invokeModel=false", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_observe_screen")({
			input: {
				text: "Inspect the screen without model invocation.",
				images: [{ mimeType: "image/png", data: "ZmFrZQ==" }],
			},
			invokeModel: false,
		});

		const payload = JSON.parse(readText(result)) as {
			mode: string;
			observation: string;
			imageCount: number;
		};

		expect(payload.mode).toBe("dry-run");
		expect(payload.observation).toContain("invokeModel=false");
		expect(payload.imageCount).toBe(1);
	});

	it("passes media resolution to Gemini and normalizes non-array tool output", async () => {
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		const geminiSpy = vi
			.spyOn(geminiProvider, "computerUseStepWithGemini")
			.mockResolvedValue({
				text: 42 as unknown as string,
				function_calls: null as unknown as Array<Record<string, unknown>>,
				safety_decisions: { blocked: false } as unknown as Array<
					Record<string, unknown>
				>,
			});

		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_observe_screen")({
			input: {
				text: "Inspect image payload.",
				images: [
					{
						mimeType: "image/png",
						data: "ZmFrZQ==",
						mediaResolution: "high",
					},
				],
			},
			invokeModel: true,
		});

		const payload = JSON.parse(readText(result)) as {
			mode: string;
			observation: string;
			functionCalls: unknown[];
			safetyDecisions: unknown[];
		};

		expect(geminiSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				contents: [
					{
						role: "user",
						parts: [
							{
								inline_data: {
									mime_type: "image/png",
									data: "ZmFrZQ==",
								},
								media_resolution: "HIGH",
							},
							{ text: "Inspect image payload." },
						],
					},
				],
			}),
		);
		expect(payload.mode).toBe("gemini");
		expect(payload.observation).toBe("");
		expect(payload.functionCalls).toEqual([]);
		expect(payload.safetyDecisions).toEqual([]);
	});

	it("surfaces provider failures from observe path", async () => {
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		vi.spyOn(geminiProvider, "computerUseStepWithGemini").mockRejectedValue(
			new Error("observe-failed"),
		);

		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		await expect(
			harness.getHandler("openui_observe_screen")({
				input: { text: "Fail the observe call.", images: [] },
				invokeModel: true,
			}),
		).rejects.toThrow("observe-failed");
	});
});
