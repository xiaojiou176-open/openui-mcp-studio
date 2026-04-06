import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildAcceptancePack, evaluateAcceptancePack } from "../acceptance-pack.js";
import { getWorkspaceRoot } from "../constants.js";
import { writeRunArtifactJson } from "../ship/artifacts.js";
import { textResult } from "./shared.js";

const stringListSchema = z.array(z.string().min(1)).optional();

export function registerAcceptanceTool(server: McpServer): void {
	server.registerTool(
		"openui_build_acceptance_pack",
		{
			description:
				"Build and optionally evaluate a request-scoped acceptance pack for the current UI change request.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				workspaceRoot: z.string().optional(),
				acceptanceCriteria: stringListSchema,
				responsiveRequirements: stringListSchema,
				a11yRequirements: stringListSchema,
				visualRequirements: stringListSchema,
				manualReviewItems: stringListSchema,
				qualityPassed: z.boolean().optional(),
				smokePassed: z.boolean().optional(),
				writeArtifact: z.boolean().default(true),
			}),
		},
		async ({
			prompt,
			workspaceRoot,
			acceptanceCriteria,
			responsiveRequirements,
			a11yRequirements,
			visualRequirements,
			manualReviewItems,
			qualityPassed,
			smokePassed,
			writeArtifact,
		}) => {
			const root = workspaceRoot || getWorkspaceRoot();
			const pack = buildAcceptancePack({
				prompt,
				acceptanceCriteria,
				responsiveRequirements,
				a11yRequirements,
				visualRequirements,
				manualReviewItems,
			});
			const evaluation =
				typeof qualityPassed === "boolean"
					? evaluateAcceptancePack({
							pack,
							qualityPassed,
							smokePassed,
						})
					: undefined;

			let artifactPath: string | undefined;
			let resultPath: string | undefined;
			if (writeArtifact !== false) {
				artifactPath = await writeRunArtifactJson({
					workspaceRoot: root,
					name: "acceptance-pack",
					payload: pack,
				});
				if (evaluation) {
					resultPath = await writeRunArtifactJson({
						workspaceRoot: root,
						name: "acceptance-result",
						payload: evaluation,
					});
				}
			}

			return textResult(
				JSON.stringify(
					{
						pack,
						...(evaluation ? { evaluation } : {}),
						...(artifactPath ? { artifactPath } : {}),
						...(resultPath ? { resultPath } : {}),
					},
					null,
					2,
				),
			);
		},
	);
}
