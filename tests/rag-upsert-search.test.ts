import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as geminiProvider from "../services/mcp-server/src/providers/gemini-provider.js";
import {
	registerRagTool,
	resetRagStateForTests,
} from "../services/mcp-server/src/tools/rag.js";

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
	resetRagStateForTests();
	vi.restoreAllMocks();
});

describe("rag upsert/search", () => {
	it("upserts documents and returns ranked hits", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini")
			.mockResolvedValueOnce([
				[0.9, 0.1],
				[0.1, 0.9],
			])
			.mockResolvedValueOnce([[0.88, 0.12]]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		const upsertResult = await harness.getHandler("openui_rag_upsert")({
			namespace: "docs",
			documents: [
				{
					id: "doc-1",
					content: "UI design tokens for button and card spacing.",
				},
				{ id: "doc-2", content: "Database migration and rollback checklist." },
			],
		});

		const upsertPayload = JSON.parse(readText(upsertResult)) as {
			upserted: number;
			totalDocuments: number;
		};

		expect(upsertPayload.upserted).toBe(2);
		expect(upsertPayload.totalDocuments).toBe(2);

		const searchResult = await harness.getHandler("openui_rag_search")({
			namespace: "docs",
			query: "UI design tokens for button and card spacing.",
			topK: 1,
		});

		const searchPayload = JSON.parse(readText(searchResult)) as {
			hits: Array<{ id: string; score: number }>;
		};

		expect(searchPayload.hits).toHaveLength(1);
		expect(searchPayload.hits[0]?.id).toBe("doc-1");
		expect(searchPayload.hits[0]?.score).toBeGreaterThanOrEqual(0);
	});

	it("rejects whitespace-only namespace instead of silently defaulting", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini").mockResolvedValue([[1, 0]]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await expect(
			harness.getHandler("openui_rag_upsert")({
				namespace: "   ",
				documents: [{ id: "doc-1", content: "UI content" }],
			}),
		).rejects.toThrow();

		await expect(
			harness.getHandler("openui_rag_search")({
				namespace: "   ",
				query: "UI content",
			}),
		).rejects.toThrow();
	});

	it("rejects upsert when embedder returns empty vectors", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini").mockResolvedValue([[]]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await expect(
			harness.getHandler("openui_rag_upsert")({
				namespace: "docs",
				documents: [{ id: "doc-1", content: "UI content" }],
			}),
		).rejects.toThrow("empty or invalid vectors");
	});

	it("rejects search when query embedding is empty", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini")
			.mockResolvedValueOnce([[1, 0]])
			.mockResolvedValueOnce([[]]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await harness.getHandler("openui_rag_upsert")({
			namespace: "docs",
			documents: [{ id: "doc-1", content: "UI content" }],
		});

		await expect(
			harness.getHandler("openui_rag_search")({
				namespace: "docs",
				query: "UI content",
			}),
		).rejects.toThrow("Query embedding is empty or invalid");
	});

	it("rejects upsert when embedder count mismatches document count", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini").mockResolvedValue([[0.1, 0.9]]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await expect(
			harness.getHandler("openui_rag_upsert")({
				namespace: "docs",
				documents: [
					{ id: "doc-1", content: "UI content" },
					{ id: "doc-2", content: "More content" },
				],
			}),
		).rejects.toThrow("Embedding count does not match document count");
	});

	it("treats missing query vectors as invalid embedding payload", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini")
			.mockResolvedValueOnce([[1, 0]])
			.mockResolvedValueOnce([]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await harness.getHandler("openui_rag_upsert")({
			namespace: "docs",
			documents: [{ id: "doc-1", content: "UI content" }],
		});

		await expect(
			harness.getHandler("openui_rag_search")({
				namespace: "docs",
				query: "UI content",
			}),
		).rejects.toThrow("Query embedding is empty or invalid");
	});

	it("rejects search when query embedding count is not exactly one", async () => {
		vi.spyOn(geminiProvider, "embedWithGemini")
			.mockResolvedValueOnce([[1, 0]])
			.mockResolvedValueOnce([
				[1, 0],
				[0, 1],
			]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await harness.getHandler("openui_rag_upsert")({
			namespace: "docs",
			documents: [{ id: "doc-1", content: "UI content" }],
		});

		await expect(
			harness.getHandler("openui_rag_search")({
				namespace: "docs",
				query: "UI content",
			}),
		).rejects.toThrow("Query embedding count mismatch: expected 1, got 2.");
	});

	it("rejects sparse upsert embeddings with missing indexes", async () => {
		const sparse = [1, 2] as number[];
		delete sparse[1];
		vi.spyOn(geminiProvider, "embedWithGemini").mockResolvedValue([sparse]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await expect(
			harness.getHandler("openui_rag_upsert")({
				namespace: "docs",
				documents: [{ id: "doc-1", content: "UI sparse embedding" }],
			}),
		).rejects.toThrow(
			"Embedding generation returned empty or invalid vectors.",
		);
	});

	it("rejects sparse query embeddings with missing indexes", async () => {
		const sparseQuery = [0.9, 0.1] as number[];
		delete sparseQuery[0];
		vi.spyOn(geminiProvider, "embedWithGemini")
			.mockResolvedValueOnce([[1, 0]])
			.mockResolvedValueOnce([sparseQuery]);

		const harness = createToolHarness();
		registerRagTool(harness.server);

		await harness.getHandler("openui_rag_upsert")({
			namespace: "docs",
			documents: [{ id: "doc-1", content: "UI content" }],
		});

		await expect(
			harness.getHandler("openui_rag_search")({
				namespace: "docs",
				query: "UI content",
			}),
		).rejects.toThrow("Query embedding is empty or invalid");
	});
});
