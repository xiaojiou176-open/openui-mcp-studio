import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWorkspaceRoot } from "../constants.js";
import { buildRepoWorkflowSummary } from "../repo-workflow-summary.js";
import { textResult } from "./shared.js";

type RepoWorkflowSummaryToolDeps = {
	getWorkspaceRoot: typeof getWorkspaceRoot;
	buildRepoWorkflowSummary: typeof buildRepoWorkflowSummary;
};

export function registerRepoWorkflowSummaryTool(
	server: McpServer,
	deps: RepoWorkflowSummaryToolDeps = {
		getWorkspaceRoot,
		buildRepoWorkflowSummary,
	},
): void {
	server.registerTool(
		"openui_repo_workflow_summary",
		{
			description:
				"Build a read-only summary of repo-local git state plus GitHub workflow readiness. This tool never mutates remote GitHub state.",
			inputSchema: z.object({
				workspaceRoot: z.string().optional(),
				failedRunsLimit: z.number().int().positive().max(20).default(10),
			}),
		},
		async ({ workspaceRoot, failedRunsLimit }) => {
			const summary = await deps.buildRepoWorkflowSummary({
				workspaceRoot: workspaceRoot || deps.getWorkspaceRoot(),
				failedRunsLimit,
			});

			return textResult(JSON.stringify(summary, null, 2));
		},
	);
}
