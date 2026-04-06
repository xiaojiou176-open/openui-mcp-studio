import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWorkspaceRoot } from "../constants.js";
import { writeRunArtifactJson } from "../ship/artifacts.js";
import { scanWorkspaceProfile } from "../workspace-profile.js";
import { textResult } from "./shared.js";

export function registerWorkspaceScanTool(server: McpServer): void {
	server.registerTool(
		"openui_scan_workspace_profile",
		{
			description:
				"Scan the target frontend workspace and return a semantic workspace profile for routes, components, tokens, and implementation hints.",
			inputSchema: z.object({
				workspaceRoot: z.string().optional(),
				targetRoot: z.string().optional(),
				writeArtifact: z.boolean().default(true),
			}),
		},
		async ({ workspaceRoot, targetRoot, writeArtifact }) => {
			const root = workspaceRoot || getWorkspaceRoot();
			const profile = await scanWorkspaceProfile({
				workspaceRoot: root,
				targetRoot,
			});
			const artifactPath =
				writeArtifact === false
					? undefined
					: await writeRunArtifactJson({
							workspaceRoot: root,
							name: "workspace-profile",
							payload: profile,
						});
			return textResult(
				JSON.stringify(
					{
						...profile,
						...(artifactPath ? { artifactPath } : {}),
					},
					null,
					2,
				),
			);
		},
	);
}
