import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeShipFeatureFlow } from "../ship/core.js";
import { getWorkspaceRoot } from "../constants.js";
import { textResult } from "./shared.js";

const FeatureFlowRouteSchema = z.object({
	id: z.string().min(1),
	prompt: z.string().min(1),
	pagePath: z.string().min(1),
	componentsDir: z.string().optional(),
});

export function registerShipFeatureFlowTool(server: McpServer): void {
	server.registerTool(
		"openui_ship_feature_flow",
		{
			description:
				"Ship a multi-route feature flow by executing the page-level ship pipeline for each declared route and aggregating the results into one bundle.",
			inputSchema: z.object({
				name: z.string().min(1),
				description: z.string().optional(),
				workspaceRoot: z.string().optional(),
				layoutPath: z.string().optional(),
				sharedComponentsDir: z.string().optional(),
				routes: z.array(FeatureFlowRouteSchema).min(1),
				model: z.string().optional(),
				dryRun: z.boolean().default(false),
				runCommands: z.boolean().default(false),
				thinkingLevel: z.enum(["low", "high"]).optional(),
				includeThoughts: z.boolean().optional(),
			}),
		},
		async ({
			name,
			description,
			workspaceRoot,
			layoutPath,
			sharedComponentsDir,
			routes,
			model,
			dryRun,
			runCommands,
			thinkingLevel,
			includeThoughts,
		}) => {
			const result = await executeShipFeatureFlow({
				name,
				description,
				workspaceRoot: workspaceRoot || getWorkspaceRoot(),
				layoutPath,
				sharedComponentsDir,
				routes,
				model,
				dryRun,
				runCommands,
				thinkingLevel,
				includeThoughts,
			});
			return textResult(JSON.stringify(result, null, 2));
		},
	);
}
