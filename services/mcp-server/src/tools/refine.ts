import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { openuiChatComplete } from "../openui-client.js";
import {
	FunctionResponsesSchema,
	newRequestId,
	resolveShadcnStyleGuide,
	textResult,
} from "./shared.js";

const InputPartSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("text"),
		text: z.string().min(1),
	}),
	z.object({
		type: z.enum(["image", "video", "audio", "pdf"]),
		mimeType: z.string().min(1),
		data: z.string().min(1),
		mediaResolution: z.enum(["low", "medium", "high", "ultra_high"]).optional(),
	}),
]);

export function registerRefineTool(server: McpServer): void {
	server.registerTool(
		"openui_refine_ui",
		{
			description:
				"Refine existing HTML UI using a natural language instruction. Returns full updated HTML.",
			inputSchema: z.object({
				html: z.string().min(1),
				instruction: z.string().min(1),
				styleGuide: z.string().optional(),
				model: z.string().optional(),
				workspaceRoot: z.string().optional(),
				inputParts: z.array(InputPartSchema).optional(),
				thinkingLevel: z.enum(["low", "high"]).optional(),
				includeThoughts: z.boolean().optional(),
				responseMimeType: z.string().optional(),
				responseJsonSchema: z.record(z.string(), z.unknown()).optional(),
				tools: z.array(z.record(z.string(), z.unknown())).optional(),
				toolChoice: z
					.union([z.string(), z.record(z.string(), z.unknown())])
					.optional(),
				functionResponses: FunctionResponsesSchema.optional(),
				cachedContent: z.string().optional(),
				cacheTtlSeconds: z.number().int().positive().optional(),
				mediaResolution: z
					.enum(["low", "medium", "high", "ultra_high"])
					.optional(),
			}),
		},
		async ({
			html,
			instruction,
			styleGuide,
			model,
			workspaceRoot,
			inputParts,
			thinkingLevel,
			includeThoughts,
			responseMimeType,
			responseJsonSchema,
			tools,
			toolChoice,
			functionResponses,
			cachedContent,
			cacheTtlSeconds,
			mediaResolution,
		}) => {
			const { styleGuide: guide } = await resolveShadcnStyleGuide({
				workspaceRoot,
				styleGuide,
			});

			const system = `You edit existing HTML UI.
Return only the complete updated HTML (no markdown fences).
Keep accessibility and responsive layout.`;

			const updated = await openuiChatComplete({
				system,
				model,
				routeKey: "fast",
				temperature: 0.2,
				requestId: newRequestId("refine"),
				inputParts,
				thinkingLevel,
				includeThoughts,
				responseMimeType,
				responseJsonSchema,
				tools,
				toolChoice,
				functionResponses,
				cachedContent,
				cacheTtlSeconds,
				mediaResolution,
				policyConfig: {
					uiWorkflow: true,
				},
				prompt: `Current HTML:\n${html}\n\nChange request:\n${instruction}\n\nStyle guide:\n${guide}`,
			});

			return textResult(updated);
		},
	);
}
