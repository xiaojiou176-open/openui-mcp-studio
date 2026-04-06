import { describe, expect, it } from "vitest";
import { buildReviewBundle } from "../services/mcp-server/src/review-bundle.js";

describe("review bundle build", () => {
	it("keeps a minimal bundle readable when optional inputs are absent", () => {
		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Create a hero",
			workspaceRoot: "/repo",
			targetKind: "page",
			changedPaths: ["apps/web/app/page.tsx"],
			unresolvedItems: [],
		});

		expect(bundle.summary).toMatchObject({
			changedPathCount: 1,
			qualityStatus: "not_run",
			manualFollowUpCount: 0,
			unresolvedCount: 0,
		});
		expect(bundle.autoChecks).toEqual([
			expect.objectContaining({
				label: "Quality gate",
				status: "not_run",
			}),
		]);
		expect(bundle.manualFollowUps).toEqual([]);
		expect(bundle.hotspots).toEqual([]);
	});

	it("adds auto checks, manual follow-ups, hotspots, and summary counts", () => {
		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Create a dashboard shell",
			workspaceRoot: "/repo",
			targetKind: "feature-flow",
			changePlan: {
				version: 1,
				prompt: "Create a dashboard shell",
				targetKind: "feature-flow",
				targetRoot: "apps/web",
				recommendedExecutionMode: "apply_safe",
				recommendedExecutionModeReason: "ready",
				items: [
					{
						path: "apps/web/app/dashboard/page.tsx",
						status: "create",
						reason: "new route",
						source: "input",
						confidence: "high",
						evidence: ["pagePath"],
					},
					{
						path: "apps/web/app/layout.tsx",
						status: "maybe-touch",
						reason: "shared shell",
						source: "prompt_heuristic",
						confidence: "medium",
						evidence: ["layout"],
					},
					{
						path: "apps/web/components/chart.tsx",
						status: "update",
						reason: "existing chart",
						source: "workspace",
						confidence: "high",
						evidence: ["route"],
					},
					{
						path: "apps/web/app/settings/page.tsx",
						status: "blocked",
						reason: "out of scope",
						source: "system",
						confidence: "low",
						evidence: ["block"],
					},
				],
				assumptions: [],
				riskSummary: [],
				unresolvedAssumptions: [],
				reviewFocus: ["Check navigation shell", "Check navigation shell"],
				hotspots: [
					{
						label: "layout-hotspot",
						reason: "shared layout change",
						severity: "high",
						paths: ["apps/web/app/layout.tsx"],
						source: "workspace",
					},
				],
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
					usesCssVariables: true,
					tokenAuthority: "css-variables",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [
					{
						kind: "navigation-surface",
						label: "sidebar.tsx",
						filePath: "components/sidebar.tsx",
						severity: "medium",
						reason: "shared navigation",
					},
				],
				confidence: {
					routing: "high",
					components: "high",
					styling: "high",
					patterns: "medium",
					overall: "high",
				},
				unknowns: ["token authority still needs review"],
			},
			acceptancePack: {
				version: 1,
				prompt: "Create a dashboard shell",
				criteria: [
					{
						id: "quality",
						label: "Quality gate",
						description: "must pass quality",
						kind: "quality_gate",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
					{
						id: "smoke",
						label: "Smoke",
						description: "must pass smoke",
						kind: "smoke",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
					{
						id: "custom-auto",
						label: "Custom automatic check",
						description: "route-specific automatic check",
						kind: "manual_review",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
					{
						id: "design-review",
						label: "Design review",
						description: "needs manual review",
						kind: "manual_review",
						source: "generated",
						required: true,
						evaluationMode: "manual",
						sourceReason: "generated",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["quality_gate", "manual_review"],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "failed",
				passed: false,
				results: [
					{
						id: "quality",
						status: "auto_failed",
						reason: "quality failed",
						evaluationMode: "automatic",
						source: "generated",
						required: true,
						evidence: ["quality_gate"],
					},
					{
						id: "smoke",
						status: "not_run",
						reason: "smoke not run",
						evaluationMode: "automatic",
						source: "generated",
						required: true,
						evidence: ["smoke"],
					},
					{
						id: "custom-auto",
						status: "auto_passed",
						reason: "custom pass",
						evaluationMode: "automatic",
						source: "generated",
						required: true,
						evidence: ["custom"],
					},
					{
						id: "design-review",
						status: "manual_required",
						reason: "needs design signoff",
						evaluationMode: "manual",
						source: "generated",
						required: true,
					},
				],
				summary: {
					total: 4,
					autoPassed: 1,
					autoFailed: 1,
					manualRequired: 1,
					notRun: 1,
					blocked: 0,
				},
			},
			quality: {
				passed: false,
				issuesCount: 3,
				commandFailures: 1,
			},
			smoke: {
				passed: true,
				usedTargetRoot: "apps/web",
			},
			changedPaths: [
				"apps/web/app/dashboard/page.tsx",
				"apps/web/app/layout.tsx",
			],
			unresolvedItems: ["manual review item"],
			routeSummaries: [
				{
					id: "dashboard",
					pagePath: "apps/web/app/dashboard/page.tsx",
					changedPaths: ["apps/web/app/dashboard/page.tsx"],
					qualityStatus: "failed",
					acceptanceVerdict: "failed",
					manualFollowUpCount: 1,
					unresolvedCount: 2,
					artifactDir: ".runtime-cache/run/routes/dashboard",
					dominantIssueRules: ["no-inline-style"],
				},
			],
			autoChecks: [
				{
					label: "Quality gate",
					source: "quality",
					status: "failed",
					details: "issues=3, commandFailures=1",
				},
			],
			manualFollowUps: [
				{
					label: "Review focus",
					reason: "Check navigation shell",
					source: "plan",
				},
			],
			hotspots: [
				{
					label: "layout-hotspot",
					reason: "shared layout change",
					severity: "high",
					source: "plan",
					paths: ["apps/web/app/layout.tsx"],
				},
			],
		});

		expect(bundle.summary).toMatchObject({
			changedPathCount: 2,
			routeCount: 1,
			failedRouteCount: 1,
			createCount: 1,
			updateCount: 1,
			maybeTouchCount: 1,
			blockedCount: 1,
			qualityStatus: "failed",
			acceptanceVerdict: "failed",
		});
		expect(bundle.autoChecks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: "Quality gate", status: "failed" }),
				expect.objectContaining({ label: "Smoke", status: "passed" }),
				expect.objectContaining({
					label: "Custom automatic check",
					status: "passed",
				}),
			]),
		);
		expect(bundle.manualFollowUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: "Design review" }),
				expect.objectContaining({ label: "Workspace unknown" }),
				expect.objectContaining({ label: "Review focus" }),
			]),
		);
		expect(bundle.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: "layout-hotspot" }),
				expect.objectContaining({ label: "quality-gate-failed" }),
				expect.objectContaining({ label: "acceptance-verdict" }),
				expect.objectContaining({ label: "sidebar.tsx" }),
			]),
		);
		expect(bundle.summary?.manualFollowUpCount).toBeGreaterThan(0);
	});

	it("marks blocked acceptance verdicts as high-severity hotspots", () => {
		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Create a settings shell",
			workspaceRoot: "/repo",
			targetKind: "page",
			acceptanceEvaluation: {
				version: 1,
				verdict: "blocked",
				passed: false,
				results: [],
				summary: {
					total: 0,
					autoPassed: 0,
					autoFailed: 0,
					manualRequired: 0,
					notRun: 0,
					blocked: 1,
				},
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
					usesComponentsJson: false,
					usesTailwindConfig: false,
					usesCssVariables: false,
					tokenAuthority: "unknown",
				},
				evidence: [],
				evidenceAnchors: [],
				hotspots: [
					{
						kind: "token-authority",
						label: "styling-unknown",
						severity: "low",
						reason: "token authority is not obvious",
					},
				],
				confidence: {
					routing: "low",
					components: "low",
					styling: "low",
					patterns: "low",
					overall: "low",
				},
				unknowns: [],
			},
			changedPaths: ["apps/web/app/settings/page.tsx"],
			unresolvedItems: ["blocked"],
		});

		expect(bundle.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "acceptance-verdict",
					severity: "high",
				}),
				expect.objectContaining({
					label: "styling-unknown",
					paths: undefined,
				}),
			]),
		);
	});

	it("dedupes repeated follow-ups while preserving smoke fallback details and not-run automatic checks", () => {
		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Create a review shell",
			workspaceRoot: "/repo",
			targetKind: "page",
			changePlan: {
				version: 1,
				prompt: "Create a review shell",
				targetKind: "page",
				targetRoot: "apps/web",
				recommendedExecutionMode: "dry_run_only",
				recommendedExecutionModeReason: "manual review required",
				items: [],
				assumptions: [],
				riskSummary: [],
				unresolvedAssumptions: [],
				reviewFocus: ["Check shell spacing"],
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
					usesComponentsJson: false,
					usesTailwindConfig: false,
					usesCssVariables: false,
					tokenAuthority: "unknown",
				},
				evidence: [],
				evidenceAnchors: [],
				hotspots: [
					{
						kind: "unknown-shell",
						label: "workspace-shell",
						severity: "low",
						reason: "workspace shell still needs mapping",
					},
				],
				confidence: {
					routing: "medium",
					components: "medium",
					styling: "low",
					patterns: "low",
					overall: "medium",
				},
				unknowns: ["token authority pending"],
			},
			acceptancePack: {
				version: 1,
				prompt: "Create a review shell",
				criteria: [
					{
						id: "auto-later",
						label: "Auto later",
						description: "automatic evidence is not ready yet",
						kind: "manual_review",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["manual_review"],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "passed",
				passed: true,
				results: [
					{
						id: "auto-later",
						status: "not_run",
						reason: "awaiting automatic evidence",
						source: "generated",
						required: true,
						evidence: [],
					},
				],
				summary: {
					total: 1,
					autoPassed: 0,
					autoFailed: 0,
					manualRequired: 0,
					notRun: 1,
					blocked: 0,
				},
			},
			quality: {
				passed: true,
				issuesCount: 0,
				commandFailures: 0,
			},
			smoke: {
				passed: false,
			},
			changedPaths: ["apps/web/app/review/page.tsx"],
			unresolvedItems: [],
			autoChecks: [
				{
					label: "Quality gate",
					source: "quality",
					status: "passed",
					details: "issues=0, commandFailures=0",
				},
			],
			manualFollowUps: [
				{
					label: "Review focus",
					reason: "Check shell spacing",
					source: "plan",
				},
			],
		});

		expect(bundle.autoChecks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Quality gate",
					status: "passed",
				}),
				expect.objectContaining({
					label: "Smoke",
					status: "failed",
					details: "Smoke result was attached without an explicit target root.",
				}),
				expect.objectContaining({
					label: "Auto later",
					status: "not_run",
				}),
			]),
		);
		expect(
			bundle.manualFollowUps.filter(
				(item) =>
					item.label === "Review focus" &&
					item.reason === "Check shell spacing",
			),
		).toHaveLength(1);
		expect(bundle.manualFollowUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Auto later",
					reason: "awaiting automatic evidence",
				}),
				expect.objectContaining({
					label: "Workspace unknown",
					reason: "token authority pending",
				}),
			]),
		);
		expect(bundle.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "workspace-shell",
					paths: undefined,
				}),
			]),
		);
		expect(bundle.hotspots).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ label: "quality-gate-failed" }),
				expect.objectContaining({ label: "acceptance-verdict" }),
			]),
		);
	});

	it("surfaces failed automatic acceptance checks as failed auto-check items", () => {
		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Create a guarded shell",
			workspaceRoot: "/repo",
			targetKind: "page",
			changedPaths: ["apps/web/app/page.tsx"],
			unresolvedItems: [],
			acceptancePack: {
				version: 1,
				prompt: "Create a guarded shell",
				criteria: [
					{
						id: "auto-review",
						label: "Auto review",
						description: "Generated automatic review.",
						kind: "manual_review",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["manual_review"],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "failed",
				passed: false,
				results: [
					{
						id: "auto-review",
						status: "auto_failed",
						reason: "automatic contract review failed",
						evaluationMode: "automatic",
						source: "generated",
						required: true,
					},
				],
				summary: {
					total: 1,
					autoPassed: 0,
					autoFailed: 1,
					manualRequired: 0,
					notRun: 0,
					blocked: 0,
				},
			},
		});

		expect(bundle.autoChecks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Auto review",
					status: "failed",
					source: "acceptance",
				}),
			]),
		);
	});
});
