import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as constants from "../services/mcp-server/src/constants.js";
import * as geminiProvider from "../services/mcp-server/src/providers/gemini-provider.js";
import {
	EmbedInputSchema,
	embedContentsWithGemini,
	registerEmbedTool,
} from "../services/mcp-server/src/tools/embed.js";

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

describe("embedding provider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls Gemini embedding provider and preserves vector shape", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini").mockResolvedValue([
			[0.1, -0.2, 0.3],
		]);

		const input = EmbedInputSchema.parse({
			contents: "Design systems keep UI predictable.",
			outputDimensionality: 3,
		});

		const vectors = await embedContentsWithGemini(input);
		expect(vectors).toHaveLength(1);
		expect(vectors[0]).toEqual([0.1, -0.2, 0.3]);
	});

	it("tool returns JSON payload with provider metadata", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini").mockResolvedValue([
			[0.01, 0.02, 0.03],
		]);

		const harness = createToolHarness();
		registerEmbedTool(harness.server);

		const result = await harness.getHandler("openui_embed_content")({
			contents: "Accessibility matters.",
		});

		const payload = JSON.parse(readText(result)) as {
			dimensions: number;
			count: number;
			embeddings: number[][];
		};

		expect(payload.count).toBe(1);
		expect(payload.dimensions).toBe(3);
		expect(payload.embeddings).toEqual([[0.01, 0.02, 0.03]]);
	});

	it("falls back to configured embedding model and supports empty embedding payload", async () => {
		vi.spyOn(constants, "getGeminiModelEmbedding").mockReturnValue(
			"gemini-fallback",
		);
		const embedSpy = vi
			.spyOn(geminiProvider, "embedWithGemini")
			.mockResolvedValue([]);

		const vectors = await embedContentsWithGemini({
			contents: ["a", "b"],
			model: "   ",
		});
		expect(vectors).toEqual([]);
		expect(embedSpy).toHaveBeenCalledWith(
			expect.objectContaining({ model: "gemini-fallback" }),
		);

		const harness = createToolHarness();
		registerEmbedTool(harness.server);
		const result = await harness.getHandler("openui_embed_content")({
			contents: "single",
			model: "   ",
		});
		const payload = JSON.parse(readText(result)) as {
			model: string;
			dimensions: number;
			count: number;
		};
		expect(payload.model).toBe("gemini-fallback");
		expect(payload.count).toBe(0);
		expect(payload.dimensions).toBe(0);
	});
});
