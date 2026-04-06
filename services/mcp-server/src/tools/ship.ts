import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_COMPONENTS_DIR, DEFAULT_PAGE_PATH, getWorkspaceRoot } from "../constants.js";
import { executeShipPage, __test__ } from "../ship/core.js";
import { FunctionResponsesSchema, textResult } from "./shared.js";

export function registerShipTool(server: McpServer): void {
	server.registerTool(
		"openui_ship_react_page",
		{
			description:
				"End-to-end ship tool: prompt -> generate -> convert -> apply -> quality gate, with optional planning, acceptance, and review artifacts.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				pagePath: z.string().default(DEFAULT_PAGE_PATH),
				componentsDir: z.string().default(DEFAULT_COMPONENTS_DIR),
				uiImportBase: z.string().optional(),
				styleGuide: z.string().optional(),
				model: z.string().optional(),
				workspaceRoot: z.string().optional(),
				idempotencyKey: z.string().optional(),
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
				uiuxScore: z.number().min(0).max(100).optional(),
				uiuxThreshold: z.number().min(0).max(100).optional(),
				acceptanceCriteria: z.array(z.string()).optional(),
				responsiveRequirements: z.array(z.string()).optional(),
				a11yRequirements: z.array(z.string()).optional(),
				visualRequirements: z.array(z.string()).optional(),
				manualReviewItems: z.array(z.string()).optional(),
				emitArtifacts: z.boolean().default(true),
				emitReviewBundle: z.boolean().default(true),
				dryRun: z.boolean().default(false),
				runCommands: z.boolean().default(false),
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
			idempotencyKey,
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
			uiuxScore,
			uiuxThreshold,
			acceptanceCriteria,
			responsiveRequirements,
			a11yRequirements,
			visualRequirements,
			manualReviewItems,
			emitArtifacts,
			emitReviewBundle,
			dryRun,
			runCommands,
		}) => {
			const root = workspaceRoot || getWorkspaceRoot();
			const execution = await executeShipPage({
				prompt,
				pagePath,
				componentsDir,
				uiImportBase,
				styleGuide,
				model,
				workspaceRoot: root,
				idempotencyKey,
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
				uiuxScore,
				uiuxThreshold,
				acceptanceCriteria,
				responsiveRequirements,
				a11yRequirements,
				visualRequirements,
				manualReviewItems,
				emitArtifacts,
				emitReviewBundle,
				dryRun,
				runCommands,
			});

			return textResult(
				JSON.stringify(
					{
						...execution.payload,
						steps: execution.steps,
						summary: execution.summary,
					},
					null,
					2,
				),
			);
		},
	);
}

export { __test__ };
