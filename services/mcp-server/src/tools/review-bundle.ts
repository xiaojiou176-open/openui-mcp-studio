import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildAcceptancePack, evaluateAcceptancePack } from "../acceptance-pack.js";
import { DEFAULT_COMPONENTS_DIR, DEFAULT_PAGE_PATH, getWorkspaceRoot } from "../constants.js";
import { buildChangePlan } from "../plan-change.js";
import { buildReviewBundle, buildReviewBundleMarkdown } from "../review-bundle.js";
import { writeRunArtifactJson, writeRunArtifactText } from "../ship/artifacts.js";
import { scanWorkspaceProfile } from "../workspace-profile.js";
import { textResult } from "./shared.js";

export function registerReviewBundleTool(server: McpServer): void {
	server.registerTool(
		"openui_build_review_bundle",
		{
			description:
				"Build a reviewer-facing bundle by combining workspace profile, change plan, and optional acceptance evaluation into one JSON/Markdown package.",
			inputSchema: z.object({
				prompt: z.string().min(1),
				workspaceRoot: z.string().optional(),
				targetRoot: z.string().optional(),
				pagePath: z.string().default(DEFAULT_PAGE_PATH),
				componentsDir: z.string().default(DEFAULT_COMPONENTS_DIR),
				acceptanceCriteria: z.array(z.string().min(1)).optional(),
				responsiveRequirements: z.array(z.string().min(1)).optional(),
				a11yRequirements: z.array(z.string().min(1)).optional(),
				visualRequirements: z.array(z.string().min(1)).optional(),
				manualReviewItems: z.array(z.string().min(1)).optional(),
				qualityPassed: z.boolean().default(true),
				smokePassed: z.boolean().optional(),
				writeArtifact: z.boolean().default(true),
			}),
		},
		async ({
			prompt,
			workspaceRoot,
			targetRoot,
			pagePath,
			componentsDir,
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
			const workspaceProfile = await scanWorkspaceProfile({
				workspaceRoot: root,
				targetRoot,
			});
			const changePlan = buildChangePlan({
				prompt,
				workspaceProfile,
				pagePath,
				componentsDir,
			});
			const acceptancePack = buildAcceptancePack({
				prompt,
				acceptanceCriteria,
				responsiveRequirements,
				a11yRequirements,
				visualRequirements,
				manualReviewItems,
			});
			const acceptanceEvaluation = evaluateAcceptancePack({
				pack: acceptancePack,
				qualityPassed,
				smokePassed,
			});
			const bundle = buildReviewBundle({
				version: 1,
				prompt,
				workspaceRoot: root,
				targetKind: "page",
				changePlan,
				workspaceProfile,
				acceptancePack,
				acceptanceEvaluation,
				quality: {
					passed: qualityPassed,
					issuesCount: 0,
					commandFailures: 0,
				},
				smoke:
					typeof smokePassed === "boolean"
						? { passed: smokePassed, usedTargetRoot: workspaceProfile.defaultTargetRoot }
						: undefined,
				changedPaths: changePlan.items
					.filter((item) => item.status !== "blocked")
					.map((item) => item.path),
				unresolvedItems: [
					...changePlan.unresolvedAssumptions,
					...workspaceProfile.unknowns,
				],
			});

			let artifactPath: string | undefined;
			let markdownPath: string | undefined;
			if (writeArtifact !== false) {
				artifactPath = await writeRunArtifactJson({
					workspaceRoot: root,
					name: "review-bundle",
					payload: bundle,
				});
				markdownPath = await writeRunArtifactText({
					workspaceRoot: root,
					name: "review-bundle",
					text: buildReviewBundleMarkdown(bundle),
				});
			}

			return textResult(
				JSON.stringify(
					{
						bundle,
						...(artifactPath ? { artifactPath } : {}),
						...(markdownPath ? { markdownPath } : {}),
					},
					null,
					2,
				),
			);
		},
	);
}
