import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_COMPONENTS_DIR, DEFAULT_PAGE_PATH, getWorkspaceRoot } from "../constants.js";
import { buildChangePlan } from "../plan-change.js";
import { writeRunArtifactJson } from "../ship/artifacts.js";
import { scanWorkspaceProfile } from "../workspace-profile.js";
import { textResult } from "./shared.js";

export function registerPlanTool(server: McpServer): void {
	server.registerTool(
		"openui_plan_change",
		{
			description:
				"Produce a preflight change plan before writing files, using a semantic workspace profile plus prompt-derived risk hints.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				workspaceRoot: z.string().optional(),
				targetRoot: z.string().optional(),
				pagePath: z.string().default(DEFAULT_PAGE_PATH),
				componentsDir: z.string().default(DEFAULT_COMPONENTS_DIR),
				writeArtifact: z.boolean().default(true),
			}),
		},
		async ({
			prompt,
			workspaceRoot,
			targetRoot,
			pagePath,
			componentsDir,
			writeArtifact,
		}) => {
			const root = workspaceRoot || getWorkspaceRoot();
			const workspaceProfile = await scanWorkspaceProfile({
				workspaceRoot: root,
				targetRoot,
			});
			const plan = buildChangePlan({
				prompt,
				workspaceProfile,
				pagePath,
				componentsDir,
			});
			const artifactPath =
				writeArtifact === false
					? undefined
					: await writeRunArtifactJson({
							workspaceRoot: root,
							name: "change-plan",
							payload: plan,
						});
			return textResult(
				JSON.stringify(
					{
						workspaceProfile,
						plan,
						...(artifactPath ? { artifactPath } : {}),
					},
					null,
					2,
				),
			);
		},
	);
}
