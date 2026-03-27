import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_COMPONENTS_DIR, DEFAULT_PAGE_PATH } from "../constants.js";
import {
	convertHtmlToReactShadcn,
	FunctionResponsesSchema,
	requestHtmlFromPrompt,
	resolveShadcnStyleGuide,
	textResult,
} from "./shared.js";

export function registerConvertTools(server: McpServer): void {
	server.registerTool(
		"openui_convert_react_shadcn",
		{
			description:
				"Convert HTML to React + Tailwind (shadcn style), outputting multi-file JSON: { files: [{path, content}], notes?: string[] }.",
			inputSchema: z.object({
				html: z.string().min(1),
				pagePath: z.string().default(DEFAULT_PAGE_PATH),
				componentsDir: z.string().default(DEFAULT_COMPONENTS_DIR),
				uiImportBase: z.string().optional(),
				styleGuide: z.string().optional(),
				model: z.string().optional(),
				workspaceRoot: z.string().optional(),
				thinkingLevel: z.enum(["low", "high"]).optional(),
				includeThoughts: z.boolean().optional(),
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
			pagePath,
			componentsDir,
			uiImportBase,
			styleGuide,
			model,
			workspaceRoot,
			thinkingLevel,
			includeThoughts,
			tools,
			toolChoice,
			functionResponses,
			cachedContent,
			cacheTtlSeconds,
			mediaResolution,
		}) => {
			const { detection, payload } = await convertHtmlToReactShadcn({
				html,
				pagePath,
				componentsDir,
				uiImportBase,
				styleGuide,
				model,
				workspaceRoot,
				thinkingLevel,
				includeThoughts,
				tools,
				toolChoice,
				functionResponses,
				cachedContent,
				cacheTtlSeconds,
				mediaResolution,
			});

			return textResult(
				JSON.stringify(
					{
						detection,
						...payload,
					},
					null,
					2,
				),
			);
		},
	);

	server.registerTool(
		"openui_make_react_page",
		{
			description:
				"One-shot pipeline: prompt -> HTML draft -> React + Tailwind multi-file JSON.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				pagePath: z.string().default(DEFAULT_PAGE_PATH),
				componentsDir: z.string().default(DEFAULT_COMPONENTS_DIR),
				uiImportBase: z.string().optional(),
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
			pagePath,
			componentsDir,
			uiImportBase,
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
			const resolved = await resolveShadcnStyleGuide({
				workspaceRoot,
				uiImportBase,
				styleGuide,
			});

			const html = await requestHtmlFromPrompt({
				prompt,
				styleGuide: resolved.styleGuide,
				model,
				routeKey: "strong",
				temperature: 0.2,
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
				requestIdPrefix: "make_page_html",
			});

			const converted = await convertHtmlToReactShadcn({
				html,
				pagePath,
				componentsDir,
				uiImportBase: resolved.uiImportBase,
				styleGuide: resolved.styleGuide,
				model,
				workspaceRoot,
				detection: resolved.detection,
				thinkingLevel,
				includeThoughts,
				tools,
				toolChoice,
				functionResponses,
				cachedContent,
				cacheTtlSeconds,
				mediaResolution,
			});

			return textResult(
				JSON.stringify(
					{
						detection: converted.detection,
						html,
						files: converted.payload.files,
						notes: converted.payload.notes,
					},
					null,
					2,
				),
			);
		},
	);
}
