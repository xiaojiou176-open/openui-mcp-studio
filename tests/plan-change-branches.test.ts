import { describe, expect, it } from "vitest";
import { buildChangePlan } from "../services/mcp-server/src/plan-change.js";

describe("plan-change branches", () => {
	it("adds chart/table/parallel-route focus and preserves workspace hotspots with file paths", () => {
		const plan = buildChangePlan({
			prompt: "Create a reporting workspace",
			pagePath: "apps/web/app/reports/page.tsx",
			componentsDir: "apps/web/components/reports",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [
					{
						routePath: "/reports",
						filePath: "apps/web/app/reports/page.tsx",
						kind: "page",
						sourceRoot: "app",
						routeGroupSegments: [],
						parallelRouteKeys: [],
						dynamicSegments: [],
					},
				],
				routeGroups: [],
				parallelRouteKeys: ["modal"],
				layoutEntries: [],
				componentEntries: [
					{
						filePath: "components/shared/chart.tsx",
						exportNames: ["Chart"],
						category: "shared",
					},
				],
				tokenHints: {
					tokenFiles: ["styles/tokens.css"],
					cssVariableFiles: ["app/globals.css"],
					tailwindConfigFiles: ["tailwind.config.ts"],
				},
				patternHints: {
					formLibraries: [],
					formFiles: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
					tableFiles: ["components/table.tsx"],
					chartFiles: ["components/chart.tsx"],
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
						kind: "chart-surface",
						label: "chart.tsx",
						filePath: "components/chart.tsx",
						severity: "medium",
						reason: "chart hotspot",
					},
					{
						kind: "layout-shell",
						label: "missing-filepath",
						severity: "high",
						reason: "should be skipped in plan hotspot merge",
					},
				],
				confidence: {
					routing: "high",
					components: "high",
					styling: "high",
					patterns: "high",
					overall: "high",
				},
				unknowns: [],
			},
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/app/reports/page.tsx",
					status: "update",
				}),
				expect.objectContaining({
					path: "apps/web/components/reports",
					status: "maybe-touch",
				}),
			]),
		);
		expect(plan.riskSummary).toEqual(
			expect.arrayContaining([expect.stringContaining("parallel routes")]),
		);
		expect(plan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("parallel-route"),
				expect.stringContaining("table-heavy"),
				expect.stringContaining("chart surfaces"),
			]),
		);
		expect(plan.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "chart.tsx",
					paths: ["components/chart.tsx"],
				}),
			]),
		);
		expect(plan.hotspots).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "missing-filepath",
				}),
			]),
		);
	});

	it("keeps apply-safe when evidence is strong and no unresolved assumptions are introduced", () => {
		const plan = buildChangePlan({
			prompt: "Create a simple hero section",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [
					{
						routePath: "/",
						filePath: "apps/web/app/page.tsx",
						kind: "page",
						sourceRoot: "app",
						routeGroupSegments: [],
						parallelRouteKeys: [],
						dynamicSegments: [],
					},
				],
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
					tokenFiles: [],
					cssVariableFiles: ["app/globals.css"],
					tailwindConfigFiles: ["tailwind.config.ts"],
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
				hotspots: [],
				confidence: {
					routing: "high",
					components: "high",
					styling: "high",
					patterns: "medium",
					overall: "high",
				},
				unknowns: [],
			},
		});

		expect(plan.recommendedExecutionMode).toBe("apply_safe");
		expect(plan.recommendedExecutionModeReason).toContain("Apply-safe");
	});

	it("falls back to default page/components paths and escalates to dry-run when shell risk signals stack up", () => {
		const plan = buildChangePlan({
			prompt: "Add sidebar navigation for a checkout wizard shell",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [],
				routeGroups: ["(marketing)"],
				parallelRouteKeys: [],
				layoutEntries: [
					{
						routePath: "/",
						filePath: "apps/web/app/layout.tsx",
						kind: "layout",
						sourceRoot: "app",
						routeGroupSegments: ["(marketing)"],
						parallelRouteKeys: [],
						dynamicSegments: [],
					},
				],
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
					tableFiles: ["components/table.tsx"],
					chartFiles: ["components/chart.tsx"],
					navigationFiles: ["components/nav.tsx"],
				},
				styleStack: {
					usesComponentsJson: true,
					usesTailwindConfig: true,
					usesCssVariables: false,
					tokenAuthority: "unknown",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [],
				confidence: {
					routing: "medium",
					components: "low",
					styling: "low",
					patterns: "medium",
					overall: "low",
				},
				unknowns: [],
			},
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/app/page.tsx",
					status: "create",
					source: "input",
				}),
				expect.objectContaining({
					path: "apps/web/components/generated",
					status: "maybe-touch",
				}),
				expect.objectContaining({
					path: "apps/web/app/layout.tsx",
					status: "maybe-touch",
					source: "prompt_heuristic",
				}),
			]),
		);
		expect(plan.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "shared-layout-or-navigation",
					paths: ["apps/web/app/layout.tsx", "apps/web/app/page.tsx"],
				}),
				expect.objectContaining({
					label: "multi-surface-experience",
					paths: ["apps/web/app/page.tsx"],
				}),
				expect.objectContaining({
					label: "route-groups-present",
					paths: ["apps/web/app/layout.tsx"],
				}),
			]),
		);
		expect(plan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("shared layout"),
				expect.stringContaining("route-group"),
				expect.stringContaining("navigation surfaces"),
				expect.stringContaining("table-heavy"),
				expect.stringContaining("chart surfaces"),
			]),
		);
		expect(plan.unresolvedAssumptions).toEqual(
			expect.arrayContaining([
				expect.stringContaining("component inventory"),
				expect.stringContaining("token files"),
				expect.stringContaining("confidence is low"),
			]),
		);
		expect(plan.recommendedExecutionMode).toBe("dry_run_only");
		expect(plan.targetKind).toBe("page");
	});
});
