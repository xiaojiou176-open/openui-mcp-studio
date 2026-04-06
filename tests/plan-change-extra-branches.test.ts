import { describe, expect, it } from "vitest";
import { buildChangePlan } from "../services/mcp-server/src/plan-change.js";

describe("plan-change extra branches", () => {
	it("stays apply-safe when shared-surface hints are absent and confidence is high", () => {
		const plan = buildChangePlan({
			prompt: "Create a simple profile card page",
			pagePath: "apps/web/app/profile/page.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components/shared",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [
					{
						routePath: "/profile",
						filePath: "apps/web/app/profile/page.tsx",
						kind: "page",
						sourceRoot: "app",
						routeGroupSegments: [],
						parallelRouteKeys: [],
						dynamicSegments: [],
					},
				],
				routeGroups: undefined as unknown as string[],
				parallelRouteKeys: undefined as unknown as string[],
				layoutEntries: [],
				componentEntries: [
					{
						filePath: "components/shared/profile-card.tsx",
						exportNames: ["ProfileCard"],
						category: "shared",
					},
				],
				tokenHints: {
					tokenFiles: ["app/globals.css"],
					cssVariableFiles: ["app/globals.css"],
					tailwindConfigFiles: ["tailwind.config.ts"],
				},
				patternHints: {
					formLibraries: [],
					formFiles: undefined as unknown as string[],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
					tableFiles: undefined as unknown as string[],
					chartFiles: undefined as unknown as string[],
					navigationFiles: undefined as unknown as string[],
				},
				styleStack: {
					usesComponentsJson: true,
					usesTailwindConfig: true,
					usesCssVariables: true,
					tokenAuthority: "css-variables",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: undefined as unknown as {
					kind: string;
					label: string;
					severity: "low" | "medium" | "high";
					reason: string;
					filePath?: string;
				}[],
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

		expect(plan.recommendedExecutionMode).toBe("apply_safe");
		expect(plan.recommendedExecutionModeReason).toContain("Apply-safe");
		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/app/profile/page.tsx",
					status: "update",
					source: "workspace",
				}),
				expect.objectContaining({
					path: "components/shared",
					status: "maybe-touch",
				}),
			]),
		);
		expect(plan.riskSummary).toEqual([]);
		expect(plan.reviewFocus).toEqual([]);
		expect(plan.unresolvedAssumptions).toEqual([]);
		expect(plan.hotspots).toEqual([]);
	});

	it("widens the plan and downgrades to dry-run when heuristics and low-confidence signals stack up", () => {
		const plan = buildChangePlan({
			prompt: "Create a dashboard layout navigation wizard settings shell",
			pagePath: "apps/web/app/admin/page.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components/shared",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [],
				routeGroups: ["marketing"],
				parallelRouteKeys: [],
				layoutEntries: [
					{
						routePath: "/",
						filePath: "apps/web/app/layout.tsx",
						routeGroupSegments: [],
					},
				],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
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
					navigationFiles: ["components/navigation/sidebar.tsx"],
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
					routing: "medium",
					components: "low",
					styling: "medium",
					patterns: "medium",
					overall: "low",
				},
				unknowns: ["route shell still ambiguous"],
			},
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/app/admin/page.tsx",
					status: "create",
					source: "input",
				}),
				expect.objectContaining({
					path: "components/shared",
					status: "maybe-touch",
				}),
				expect.objectContaining({
					path: "apps/web/app/layout.tsx",
					status: "maybe-touch",
					source: "prompt_heuristic",
				}),
			]),
		);
		expect(plan.riskSummary).toEqual(
			expect.arrayContaining([
				expect.stringContaining("shared layout or navigation"),
				expect.stringContaining("multi-step or multi-surface"),
				expect.stringContaining("route groups"),
			]),
		);
		expect(plan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("shared layout or navigation"),
				expect.stringContaining("larger feature flow"),
				expect.stringContaining("route-group structure"),
				expect.stringContaining("shared navigation code"),
			]),
		);
		expect(plan.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "shared-layout-or-navigation",
					paths: ["apps/web/app/layout.tsx", "apps/web/app/admin/page.tsx"],
				}),
				expect.objectContaining({
					label: "multi-surface-experience",
					paths: ["apps/web/app/admin/page.tsx"],
				}),
				expect.objectContaining({
					label: "route-groups-present",
					paths: ["apps/web/app/layout.tsx"],
				}),
			]),
		);
		expect(plan.unresolvedAssumptions).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					"did not discover an existing component inventory",
				),
				expect.stringContaining("did not discover obvious token files"),
				expect.stringContaining("confidence is low"),
			]),
		);
		expect(plan.recommendedExecutionMode).toBe("dry_run_only");
		expect(plan.recommendedExecutionModeReason).toContain("Dry run");
	});

	it("uses the shared app layout fallback and keeps missing hotspot file paths out of the merged plan", () => {
		const plan = buildChangePlan({
			prompt: "Create a layout shell with sidebar navigation",
			pagePath: "src/pages/home.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "src",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components/shared",
				componentsImportBase: "@/components",
				routingMode: "pages-router",
				routeEntries: [],
				routeGroups: ["marketing"],
				parallelRouteKeys: [],
				layoutEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: ["src/styles.css"],
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
					navigationFiles: ["components/nav/sidebar.tsx"],
				},
				styleStack: {
					usesComponentsJson: false,
					usesTailwindConfig: false,
					usesCssVariables: true,
					tokenAuthority: "css-variables",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [
					{
						kind: "layout-shell",
						label: "skip-missing-path",
						severity: "high",
						reason: "should not leak without a file path",
					},
				],
				confidence: {
					routing: "medium",
					components: "low",
					styling: "high",
					patterns: "high",
					overall: "medium",
				},
				unknowns: [],
			},
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "app/layout.tsx",
					status: "maybe-touch",
					source: "prompt_heuristic",
				}),
			]),
		);
		expect(plan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("shared navigation"),
				expect.stringContaining("table-heavy"),
				expect.stringContaining("chart surfaces"),
			]),
		);
		expect(plan.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "route-groups-present",
					paths: [],
				}),
			]),
		);
		expect(plan.hotspots).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "skip-missing-path",
				}),
			]),
		);
		expect(plan.unresolvedAssumptions).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					"did not discover an existing component inventory",
				),
			]),
		);
	});

	it("treats missing optional workspace arrays as empty and still keeps the dry-run fallback honest", () => {
		const plan = buildChangePlan({
			prompt: "Add footer navigation for an account settings shell",
			pagePath: "pages/account.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "",
				componentsImportBase: "@/components",
				routingMode: "pages-router",
				routeEntries: [],
				routeGroups: ["ops"],
				parallelRouteKeys: undefined as unknown as string[],
				layoutEntries: undefined as unknown as Array<{
					routePath: string;
					filePath: string;
					routeGroupSegments: string[];
				}>,
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
				patternHints: {
					formLibraries: [],
					formFiles: undefined as unknown as string[],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
					tableFiles: undefined as unknown as string[],
					chartFiles: undefined as unknown as string[],
					navigationFiles: undefined as unknown as string[],
				},
				styleStack: {
					usesComponentsJson: false,
					usesTailwindConfig: false,
					usesCssVariables: false,
					tokenAuthority: "unknown",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: undefined as unknown as Array<{
					label: string;
					reason: string;
					severity: "low" | "medium" | "high";
					filePath?: string;
				}>,
				confidence: {
					routing: "medium",
					components: "low",
					styling: "low",
					patterns: "low",
					overall: "low",
				},
				unknowns: [],
			} as never,
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "pages/account.tsx",
					status: "create",
				}),
				expect.objectContaining({
					path: "apps/web/components/generated",
					status: "maybe-touch",
				}),
				expect.objectContaining({
					path: "app/layout.tsx",
					status: "maybe-touch",
					source: "prompt_heuristic",
				}),
			]),
		);
		expect(plan.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "route-groups-present",
					paths: [],
				}),
			]),
		);
		expect(plan.riskSummary).toEqual(
			expect.arrayContaining([expect.stringContaining("route groups")]),
		);
		expect(plan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("shared layout or navigation"),
				expect.stringContaining("larger feature flow"),
				expect.stringContaining("route-group structure"),
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
	});

	it("keeps hotspot review items only when workspace hotspots carry concrete file paths", () => {
		const plan = buildChangePlan({
			prompt: "Create a dashboard shell",
			pagePath: "apps/web/app/dashboard/page.tsx",
			workspaceProfile: {
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components/shared",
				componentsImportBase: "@/components",
				routingMode: "app-router",
				routeEntries: [],
				routeGroups: [],
				parallelRouteKeys: ["modal"],
				layoutEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: ["tailwind.config.ts"],
				},
				patternHints: {
					formLibraries: [],
					formFiles: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
					tableFiles: ["dashboard-table.tsx"],
					chartFiles: ["sales-chart.tsx"],
					navigationFiles: ["components/navigation/sidebar.tsx"],
				},
				styleStack: {
					usesComponentsJson: true,
					usesTailwindConfig: true,
					usesCssVariables: false,
					tokenAuthority: "tailwind-only",
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [
					{
						kind: "layout-shell",
						label: "skip-missing-path",
						severity: "high",
						reason: "should not leak without a file path",
					},
					{
						kind: "layout-shell",
						label: "real-file-hotspot",
						severity: "medium",
						reason: "concrete file",
						filePath: "apps/web/app/layout.tsx",
					},
				],
				confidence: {
					routing: "medium",
					components: "medium",
					styling: "medium",
					patterns: "high",
					overall: "medium",
				},
				unknowns: [],
			},
		});

		expect(plan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("parallel-route behavior"),
				expect.stringContaining("table-heavy"),
				expect.stringContaining("chart surfaces"),
				expect.stringContaining("shared navigation code"),
			]),
		);
		expect(plan.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "real-file-hotspot",
					paths: ["apps/web/app/layout.tsx"],
				}),
				expect.objectContaining({
					label: "multi-surface-experience",
				}),
			]),
		);
		expect(plan.hotspots).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "skip-missing-path",
				}),
			]),
		);
	});
});
