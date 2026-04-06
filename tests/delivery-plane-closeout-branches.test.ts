import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateAcceptanceCriterion } from "../services/mcp-server/src/acceptance/assertions.js";
import { buildChangePlan } from "../services/mcp-server/src/plan-change.js";
import { buildReviewBundle } from "../services/mcp-server/src/review-bundle.js";

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("delivery-plane closeout branches", () => {
	it("covers fallback plan heuristics and reviewer-facing acceptance branches", () => {
		const smokeFailure = evaluateAcceptanceCriterion({
			criterion: {
				id: "smoke-gate",
				label: "Smoke gate",
				description: "Smoke must pass.",
				kind: "smoke",
				source: "generated",
				required: true,
			},
			qualityPassed: true,
			smokePassed: false,
		});

		expect(smokeFailure).toMatchObject({
			status: "auto_failed",
			reason: "Smoke verification failed.",
		});

		const manualFallback = evaluateAcceptanceCriterion({
			criterion: {
				id: "manual-review",
				label: "Manual review",
				description: "Needs a reviewer.",
				kind: "manual_review",
				source: "generated",
				required: true,
				evaluationMode: undefined as never,
			},
			qualityPassed: true,
		});

		expect(manualFallback).toMatchObject({
			status: "manual_required",
			evaluationMode: "manual",
		});

		const plan = buildChangePlan({
			prompt: "Add layout navigation shell",
			pagePath: "src/pages/home.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routingMode: "pages-router",
				routeEntries: [],
				routeGroups: [],
				parallelRouteKeys: [],
				layoutEntries: [],
				componentEntries: [
					{
						filePath: "components/shared/hero.tsx",
						exportNames: ["Hero"],
						category: "shared",
					},
				],
				tokenHints: {
					tokenFiles: ["styles/tokens.css"],
					cssVariableFiles: ["styles/tokens.css"],
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
					usesTailwindConfig: false,
					usesCssVariables: true,
					tokenAuthority: "css-variables",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [],
				confidence: {
					routing: "high",
					components: "high",
					styling: "high",
					patterns: "low",
					overall: "high",
				},
				unknowns: [],
			},
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "src/pages/home.tsx",
					status: "create",
				}),
				expect.objectContaining({
					path: "app/layout.tsx",
					status: "maybe-touch",
				}),
			]),
		);
		expect(plan.riskSummary).toEqual(
			expect.arrayContaining([
				expect.stringContaining("shared layout or navigation"),
			]),
		);
		expect(plan.reviewFocus).not.toEqual(
			expect.arrayContaining([
				expect.stringContaining("route-group structure"),
				expect.stringContaining("parallel-route behavior"),
				expect.stringContaining("shared navigation code"),
				expect.stringContaining("table-heavy surfaces"),
				expect.stringContaining("chart surfaces"),
			]),
		);

		const bundle = buildReviewBundle({
			version: 1,
			prompt: "Audit a route",
			workspaceRoot: "/repo",
			targetKind: "page",
			changedPaths: ["apps/web/app/page.tsx"],
			acceptancePack: {
				version: 1,
				criteria: [],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "manual_review_required",
				passed: false,
				results: [
					{
						id: "missing-criterion",
						status: "not_run",
						reason: "Smoke verification was not executed.",
						evaluationMode: "automatic",
						source: "generated",
						required: true,
						evidence: ["smoke"],
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
			unresolvedItems: [],
		});

		expect(bundle.autoChecks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "missing-criterion",
					status: "not_run",
				}),
			]),
		);
		expect(bundle.manualFollowUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "missing-criterion",
				}),
			]),
		);
	});

	it("covers blocked and passed acceptance-pack verdict branches via mocked criterion evaluation", async () => {
		const criterion = {
			id: "criterion-1",
			label: "Criterion",
			description: "Criterion",
			kind: "manual_review" as const,
			source: "generated" as const,
			required: true,
			evaluationMode: "manual" as const,
		};

		vi.doMock("../services/mcp-server/src/acceptance/assertions.js", () => ({
			evaluateAcceptanceCriterion: vi.fn(() => ({
				id: "criterion-1",
				status: "blocked",
				reason: "Shared shell blocker",
				evaluationMode: "manual",
				source: "generated",
				required: true,
			})),
		}));

		const blockedModule = await import(
			"../services/mcp-server/src/acceptance/evaluate.js"
		);
		const blocked = blockedModule.evaluateAcceptancePack({
			pack: {
				version: 1,
				criteria: [criterion],
			},
			qualityPassed: true,
		});

		expect(blocked.verdict).toBe("blocked");
		expect(blocked.passed).toBe(false);

		vi.resetModules();
		vi.doMock("../services/mcp-server/src/acceptance/assertions.js", () => ({
			evaluateAcceptanceCriterion: vi.fn(() => ({
				id: "criterion-1",
				status: "auto_passed",
				reason: "All checks passed",
				evaluationMode: "automatic",
				source: "generated",
				required: true,
				evidence: ["quality_gate"],
			})),
		}));

		const passedModule = await import(
			"../services/mcp-server/src/acceptance/evaluate.js"
		);
		const passed = passedModule.evaluateAcceptancePack({
			pack: {
				version: 1,
				criteria: [criterion],
			},
			qualityPassed: true,
		});

		expect(passed.verdict).toBe("passed");
		expect(passed.passed).toBe(true);
		expect(passed.summary).toMatchObject({
			autoPassed: 1,
			autoFailed: 0,
			manualRequired: 0,
			notRun: 0,
			blocked: 0,
		});
	});

	it("covers hotspot fallback when workspace metadata omits optional arrays", () => {
		const plan = buildChangePlan({
			prompt: "Refresh hero copy",
			pagePath: "src/pages/landing.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routingMode: "pages-router",
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
				hotspots: undefined as never,
				confidence: {
					routing: "medium",
					components: "low",
					styling: "low",
					patterns: "low",
					overall: "low",
				},
				unknowns: [],
			},
		});

		expect(plan.hotspots).toEqual([]);
		expect(plan.recommendedExecutionMode).toBe("dry_run_only");
	});
});
