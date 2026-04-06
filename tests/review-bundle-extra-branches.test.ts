import { describe, expect, it } from "vitest";
import { buildReviewBundle } from "../services/mcp-server/src/review-bundle.js";

describe("review bundle extra branches", () => {
	it("dedupes repeated follow-ups and marks blocked acceptance as a high-severity hotspot", () => {
		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Check blocked review bundle",
			workspaceRoot: "/repo",
			targetKind: "page",
			changePlan: {
				version: 1,
				prompt: "Check blocked review bundle",
				targetKind: "page",
				targetRoot: "apps/web",
				recommendedExecutionMode: "dry_run_only",
				recommendedExecutionModeReason: "manual review needed",
				items: [],
				assumptions: [],
				riskSummary: [],
				unresolvedAssumptions: [],
				reviewFocus: ["Check token authority"],
				hotspots: [],
			},
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [],
				routeGroups: [],
				parallelRouteKeys: [],
				layoutEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
				patternHints: {
					formLibraries: [],
					formFiles: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
					tableFiles: [],
					chartFiles: [],
					navigationFiles: [],
				},
				styleStack: {
					usesComponentsJson: true,
					usesTailwindConfig: true,
					usesCssVariables: false,
					tokenAuthority: "tailwind-only",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [],
				confidence: {
					routing: "high",
					components: "medium",
					styling: "medium",
					patterns: "low",
					overall: "medium",
				},
				unknowns: ["Check token authority"],
			},
			acceptancePack: {
				version: 1,
				prompt: "Check blocked review bundle",
				criteria: [
					{
						id: "manual-review",
						label: "Manual review",
						description: "needs signoff",
						kind: "manual_review",
						source: "generated",
						required: true,
						evaluationMode: "manual",
						sourceReason: "generated",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["manual_review"],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "blocked",
				passed: false,
				results: [
					{
						id: "manual-review",
						status: "manual_required",
						reason: "Check token authority",
						evaluationMode: "manual",
						source: "generated",
						required: true,
					},
				],
				summary: {
					total: 1,
					autoPassed: 0,
					autoFailed: 0,
					manualRequired: 1,
					notRun: 0,
					blocked: 1,
				},
			},
			changedPaths: ["apps/web/app/page.tsx"],
			unresolvedItems: ["manual review still required"],
			manualFollowUps: [
				{
					label: "Review focus",
					reason: "Check token authority",
					source: "plan",
				},
			],
		});

		expect(
			bundle.manualFollowUps.filter(
				(item) =>
					item.label === "Review focus" &&
					item.source === "plan" &&
					item.reason === "Check token authority",
			),
		).toHaveLength(1);
		expect(bundle.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "acceptance-verdict",
					severity: "high",
					source: "acceptance",
				}),
			]),
		);
		expect(bundle.summary).toMatchObject({
			manualFollowUpCount: bundle.manualFollowUps.length,
			acceptanceVerdict: "blocked",
			unresolvedCount: 1,
		});
	});
});
