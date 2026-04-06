import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { detectShadcnPaths } from "../path-detection.js";
import { textResult } from "./shared.js";

export function registerDetectTool(server: McpServer): void {
	server.registerTool(
		"openui_detect_shadcn_paths",
		{
			description:
				"Detect shadcn import/path config. Priority: components.json aliases.ui -> folder scan -> default.",
			inputSchema: z.object({
				workspaceRoot: z.string().optional(),
			}),
		},
		async ({ workspaceRoot }) => {
			const result = await detectShadcnPaths(workspaceRoot);
			return textResult(JSON.stringify(result, null, 2));
		},
	);
}
