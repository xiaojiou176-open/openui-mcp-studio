import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { openuiChatComplete } from "../openui-client.js";
import {
	FunctionResponsesSchema,
	newRequestId,
	resolveShadcnStyleGuide,
	textResult,
} from "./shared.js";

export function registerGenerateTool(server: McpServer): void {
	server.registerTool(
		"openui_generate_ui",
		{
			description: "Generate modern HTML UI from a prompt.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				styleGuide: z.string().optional(),
				model: z.string().optional(),
				workspaceRoot: z.string().optional(),
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
			prompt,
			styleGuide,
			model,
			workspaceRoot,
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

			const system = `You generate modern UI as HTML only.
Return only HTML (no markdown fences).
Use semantic structure and accessibility best practices.`;

			const html = await openuiChatComplete({
				prompt: `${prompt}\n\nStyle constraints:\n${guide}`,
				system,
				model,
				routeKey: "fast",
				temperature: 0.2,
				requestId: newRequestId("generate"),
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
			});

			return textResult(html);
		},
	);
}
