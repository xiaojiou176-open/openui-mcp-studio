import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGeminiModelEmbedding } from "../constants.js";
import { embedWithGemini } from "../providers/gemini-provider.js";
import { textResult } from "./shared.js";

export const EmbedContentsSchema = z.union([
	z.string().min(1),
	z.array(z.string().min(1)).min(1),
]);

export const EmbedInputSchema = z.object({
	contents: EmbedContentsSchema,
	model: z.string().optional(),
	outputDimensionality: z.number().int().positive().optional(),
});

export type EmbedInput = z.infer<typeof EmbedInputSchema>;

function normalizeContents(contents: EmbedInput["contents"]): string[] {
	return typeof contents === "string" ? [contents] : contents;
}

export async function embedContentsWithGemini(
	input: EmbedInput,
): Promise<number[][]> {
	const contents = normalizeContents(input.contents);
	return embedWithGemini({
		model: input.model?.trim() || getGeminiModelEmbedding(),
		contents,
		outputDimensionality: input.outputDimensionality,
	});
}

export function registerEmbedTool(server: McpServer): void {
	server.registerTool(
		"openui_embed_content",
		{
			description: "Create Gemini embeddings for one or more text contents.",
			inputSchema: EmbedInputSchema,
		},
		async (args) => {
			const input = EmbedInputSchema.parse(args);
			const embeddings = await embedContentsWithGemini(input);
			return textResult(
				JSON.stringify(
					{
						model: input.model?.trim() || getGeminiModelEmbedding(),
						count: embeddings.length,
						dimensions: embeddings[0]?.length ?? 0,
						embeddings,
					},
					null,
					2,
				),
			);
		},
	);
}
