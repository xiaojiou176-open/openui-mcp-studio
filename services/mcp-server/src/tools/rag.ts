import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LocalVectorIndex } from "../retrieval/local-index.js";
import { DEFAULT_RETRIEVAL_NAMESPACE } from "../retrieval/types.js";
import { embedContentsWithGemini } from "./embed.js";
import { textResult } from "./shared.js";

const RagDocumentSchema = z.object({
	id: z.string().min(1),
	content: z.string().min(1),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

const RagUpsertInputSchema = z.object({
	namespace: z.string().trim().min(1).default(DEFAULT_RETRIEVAL_NAMESPACE),
	model: z.string().optional(),
	outputDimensionality: z.number().int().positive().optional(),
	documents: z.array(RagDocumentSchema).min(1),
});

const RagSearchInputSchema = z.object({
	namespace: z.string().trim().min(1).default(DEFAULT_RETRIEVAL_NAMESPACE),
	model: z.string().optional(),
	outputDimensionality: z.number().int().positive().optional(),
	query: z.string().min(1),
	topK: z.number().int().min(1).max(20).default(5),
	minScore: z.number().min(-1).max(1).default(0),
});

const ragIndex = new LocalVectorIndex();

function isValidEmbedding(
	embedding: number[] | undefined,
): embedding is number[] {
	if (!Array.isArray(embedding) || embedding.length === 0) {
		return false;
	}

	for (let index = 0; index < embedding.length; index += 1) {
		if (!(index in embedding)) {
			return false;
		}
		if (!Number.isFinite(embedding[index])) {
			return false;
		}
	}

	return true;
}

export function resetRagStateForTests(): void {
	ragIndex.clear();
}

export function registerRagTool(server: McpServer): void {
	server.registerTool(
		"openui_rag_upsert",
		{
			description:
				"Upsert documents into local RAG index using Gemini embeddings.",
			inputSchema: RagUpsertInputSchema,
		},
		async (args) => {
			const input = RagUpsertInputSchema.parse(args);
			const embeddings = await embedContentsWithGemini({
				contents: input.documents.map((doc) => doc.content),
				model: input.model,
				outputDimensionality: input.outputDimensionality,
			});
			if (embeddings.length !== input.documents.length) {
				throw new Error("Embedding count does not match document count.");
			}
			for (let index = 0; index < embeddings.length; index += 1) {
				if (!(index in embeddings) || !isValidEmbedding(embeddings[index])) {
					throw new Error(
						"Embedding generation returned empty or invalid vectors.",
					);
				}
			}

			const result = ragIndex.upsert({
				namespace: input.namespace,
				documents: input.documents.map((document, index) => ({
					...document,
					embedding: embeddings[index],
				})),
			});

			return textResult(
				JSON.stringify(
					{
						operation: "upsert",
						namespace: result.namespace,
						upserted: result.upserted,
						totalDocuments: result.totalDocuments,
					},
					null,
					2,
				),
			);
		},
	);

	server.registerTool(
		"openui_rag_search",
		{
			description: "Search local RAG index using Gemini embeddings.",
			inputSchema: RagSearchInputSchema,
		},
		async (args) => {
			const input = RagSearchInputSchema.parse(args);
			const vectors = await embedContentsWithGemini({
				contents: input.query,
				model: input.model,
				outputDimensionality: input.outputDimensionality,
			});

			if (vectors.length === 0 || !(0 in vectors)) {
				throw new Error("Query embedding is empty or invalid.");
			}
			if (vectors.length !== 1) {
				throw new Error(
					`Query embedding count mismatch: expected 1, got ${vectors.length}.`,
				);
			}
			const queryEmbedding = vectors[0];
			if (!isValidEmbedding(queryEmbedding)) {
				throw new Error("Query embedding is empty or invalid.");
			}
			const result = ragIndex.search({
				namespace: input.namespace,
				queryEmbedding,
				topK: input.topK,
				minScore: input.minScore,
			});

			return textResult(
				JSON.stringify(
					{
						operation: "search",
						namespace: result.namespace,
						totalCandidates: result.totalCandidates,
						hits: result.hits,
					},
					null,
					2,
				),
			);
		},
	);
}
