import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applyGeneratedFiles } from "../file-ops.js";
import { GeneratedFileSchema, textResult } from "./shared.js";

export function registerApplyTool(server: McpServer): void {
	server.registerTool(
		"openui_apply_files",
		{
			description:
				"Apply generated files to target workspace with transactional rollback on write failure.",
			inputSchema: z.object({
				files: z.array(GeneratedFileSchema).min(1),
				targetRoot: z.string().optional(),
				dryRun: z.boolean().default(false),
				rollbackOnError: z.boolean().default(true),
			}),
		},
		async ({ files, targetRoot, dryRun, rollbackOnError }) => {
			const result = await applyGeneratedFiles({
				files,
				targetRoot,
				dryRun,
				rollbackOnError,
			});

			return textResult(JSON.stringify(result, null, 2));
		},
	);
}
