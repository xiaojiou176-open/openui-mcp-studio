import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	listWorkspaceFilesRecursive,
	routePathFromAppFile,
} from "../packages/shared-runtime/src/workspace-profile.js";
import { evaluateAcceptanceCriterion } from "../services/mcp-server/src/acceptance/assertions.js";
import { buildAcceptancePack } from "../services/mcp-server/src/acceptance/build.js";
import { evaluateAcceptancePack } from "../services/mcp-server/src/acceptance/evaluate.js";
import { buildChangePlan } from "../services/mcp-server/src/plan-change.js";
import { buildReviewBundle } from "../services/mcp-server/src/review-bundle.js";
import {
	buildWorkspaceComponentEntries,
	buildWorkspacePatternHints,
	buildWorkspaceTokenHints,
	inferComponentCategory,
	inferRouteKind,
} from "../services/mcp-server/src/workspace-profile/patterns.js";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("delivery plane branch coverage", () => {
	it("covers generated acceptance defaults, smoke pass-fail branches, and blocked review hotspots", () => {
		const pack = buildAcceptancePack({
			prompt: "Create a plain settings panel",
			manualReviewItems: ["Product owner confirms copy tone."],
		});

		expect(pack.criteria.map((criterion) => criterion.label)).toEqual(
			expect.arrayContaining([
				"quality-gate-must-pass",
				"prompt-intent-review",
				"manual_review-1",
			]),
		);
		expect(
			pack.criteria.every((criterion) => criterion.sourceReason?.length),
		).toBe(true);

		const smokeCriterion = {
			id: "smoke-check",
			label: "Smoke",
			description: "Run smoke verification",
			kind: "smoke" as const,
			source: "generated" as const,
			required: true,
		};

		expect(
			evaluateAcceptanceCriterion({
				criterion: smokeCriterion,
				qualityPassed: true,
				smokePassed: true,
			}),
		).toMatchObject({ status: "auto_passed" });
		expect(
			evaluateAcceptanceCriterion({
				criterion: smokeCriterion,
				qualityPassed: true,
				smokePassed: false,
			}),
		).toMatchObject({ status: "auto_failed" });

		const evaluation = evaluateAcceptancePack({
			pack,
			qualityPassed: true,
		});
		expect(evaluation.verdict).toBe("manual_review_required");

		const blockedBundle = buildReviewBundle({
			version: 1,
			prompt: "Create a plain settings panel",
			workspaceRoot: "/repo",
			targetKind: "page",
			changedPaths: ["apps/web/app/settings/page.tsx"],
			unresolvedItems: [],
			quality: {
				passed: true,
				issuesCount: 0,
				commandFailures: 0,
			},
			acceptanceEvaluation: {
				...evaluation,
				verdict: "blocked",
				passed: false,
				summary: {
					...evaluation.summary,
					blocked: 1,
				},
			},
		});

		expect(blockedBundle.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "acceptance-verdict",
					severity: "high",
				}),
			]),
		);
	});

	it("builds heuristic acceptance criteria and evaluates quality/smoke/manual branches", () => {
		const pack = buildAcceptancePack({
			prompt:
				"Create a polished mobile pricing hero with keyboard accessible CTA and brand visuals",
		});

		expect(pack.criteria.map((criterion) => criterion.kind)).toEqual(
			expect.arrayContaining([
				"quality_gate",
				"manual_review",
				"responsive",
				"a11y",
				"visual",
			]),
		);

		const manualCriterion = pack.criteria.find(
			(criterion) => criterion.kind === "manual_review",
		);
		expect(manualCriterion?.kind).toBe("manual_review");

		const qualityCriterion = pack.criteria.find(
			(criterion) => criterion.kind === "quality_gate",
		);
		expect(
			evaluateAcceptanceCriterion({
				criterion: qualityCriterion!,
				qualityPassed: false,
			}),
		).toMatchObject({ status: "auto_failed" });

		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "smoke-check",
					label: "Smoke",
					description: "Run smoke verification",
					kind: "smoke",
					source: "generated",
					required: true,
				},
				qualityPassed: true,
			}),
		).toMatchObject({ status: "not_run" });

		expect(
			evaluateAcceptanceCriterion({
				criterion: manualCriterion!,
				qualityPassed: true,
			}),
		).toMatchObject({ status: "manual_required" });
	});

	it("maps explicit acceptance requirement lists and aggregates evaluation summary counts", () => {
		const pack = buildAcceptancePack({
			prompt: "Create a checkout experience",
			acceptanceCriteria: ["Checkout headline mentions shipping."],
			responsiveRequirements: ["Tablet layout keeps summary visible."],
			a11yRequirements: ["Focus order remains logical."],
			visualRequirements: ["Use brand accent on CTA."],
			manualReviewItems: ["PM approves copy tone."],
		});

		expect(
			pack.criteria.filter((criterion) => criterion.source === "input").length,
		).toBeGreaterThanOrEqual(5);

		const evaluation = evaluateAcceptancePack({
			pack: {
				...pack,
				criteria: [
					...pack.criteria,
					{
						id: "smoke-gate",
						label: "Smoke gate",
						description: "Smoke must pass.",
						kind: "smoke",
						source: "generated",
						required: true,
					},
				],
			},
			qualityPassed: true,
			smokePassed: true,
		});

		expect(evaluation.passed).toBe(false);
		expect(evaluation.verdict).toBe("manual_review_required");
		expect(evaluation.summary.autoPassed).toBeGreaterThan(1);
		expect(evaluation.summary.manualRequired).toBeGreaterThan(0);
	});

	it("builds change plans for update and create flows with risk/unresolved branches", () => {
		const sharedProfile = {
			version: 1 as const,
			workspaceRoot: "/repo",
			defaultTargetRoot: "apps/web",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components/generated",
			componentsImportBase: "@/components",
			routingMode: "app-router" as const,
			routeGroups: ["marketing"],
			parallelRouteKeys: [],
			layoutEntries: [
				{
					routePath: "/dashboard",
					filePath: "apps/web/app/(marketing)/dashboard/layout.tsx",
					routeGroupSegments: ["marketing"],
				},
			],
			routeEntries: [
				{
					routePath: "/dashboard",
					filePath: "apps/web/app/dashboard/page.tsx",
					kind: "page" as const,
					sourceRoot: "app" as const,
					routeGroupSegments: [],
					parallelRouteKeys: [],
					dynamicSegments: [],
				},
			],
			componentEntries: [
				{
					filePath: "components/shared/hero.tsx",
					exportNames: ["Hero"],
					category: "shared" as const,
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
				tableFiles: [],
				chartFiles: [],
				navigationFiles: ["components/navigation/sidebar.tsx"],
			},
			styleStack: {
				usesComponentsJson: true,
				usesTailwindConfig: true,
				usesCssVariables: true,
				tokenAuthority: "css-variables" as const,
			},
			evidence: ["fixture"],
			evidenceAnchors: [],
			hotspots: [],
			confidence: {
				routing: "high" as const,
				components: "high" as const,
				styling: "high" as const,
				patterns: "medium" as const,
				overall: "high" as const,
			},
			unknowns: [],
		};

		const updatePlan = buildChangePlan({
			prompt: "Add dashboard layout with sidebar navigation",
			workspaceProfile: sharedProfile,
			pagePath: "apps/web/app/dashboard/page.tsx",
			targetKind: "feature-flow",
		});

		expect(updatePlan.targetKind).toBe("feature-flow");
		expect(updatePlan.recommendedExecutionMode).toBe("apply_safe");
		expect(updatePlan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/app/dashboard/page.tsx",
					status: "update",
					source: "workspace",
					confidence: "high",
				}),
				expect.objectContaining({
					path: "apps/web/app/layout.tsx",
					status: "maybe-touch",
					source: "prompt_heuristic",
				}),
			]),
		);
		expect(updatePlan.riskSummary.length).toBeGreaterThan(0);
		expect(updatePlan.recommendedExecutionModeReason).toContain("Apply-safe");
		expect(updatePlan.reviewFocus).toEqual(
			expect.arrayContaining([
				expect.stringContaining("route-group"),
				expect.stringContaining("navigation"),
			]),
		);
		expect(updatePlan.hotspots?.length).toBeGreaterThan(0);

		const createPlan = buildChangePlan({
			prompt: "Create a settings page",
			workspaceProfile: {
				...sharedProfile,
				routeEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
			},
			pagePath: "apps/web/app/settings/page.tsx",
		});

		expect(createPlan.recommendedExecutionMode).toBe("dry_run_only");
		expect(createPlan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/app/settings/page.tsx",
					status: "create",
				}),
				expect.objectContaining({
					path: "components/generated",
					status: "maybe-touch",
				}),
			]),
		);
		expect(createPlan.unresolvedAssumptions).toEqual(
			expect.arrayContaining([
				expect.stringContaining("component inventory"),
				expect.stringContaining("token files"),
			]),
		);
		expect(createPlan.recommendedExecutionModeReason).toContain("Dry run");
	});

	it("covers explicit component overrides, parallel routes, chart/table hints, and hotspot filtering in change plans", () => {
		const profile = {
			version: 1 as const,
			workspaceRoot: "/repo",
			defaultTargetRoot: "src",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components/generated",
			componentsImportBase: "@/components",
			routingMode: "app-router" as const,
			routeGroups: [],
			parallelRouteKeys: ["modal"],
			layoutEntries: [],
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: ["theme.css"],
				cssVariableFiles: ["theme.css"],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				formFiles: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
				tableFiles: ["components/table/orders.tsx"],
				chartFiles: ["components/chart/sales.tsx"],
				navigationFiles: [],
			},
			styleStack: {
				usesComponentsJson: false,
				usesTailwindConfig: false,
				usesCssVariables: true,
				tokenAuthority: "css-variables" as const,
			},
			evidence: ["fixture"],
			evidenceAnchors: [],
			hotspots: [
				{
					kind: "layout-shell" as const,
					label: "ignored",
					severity: "medium" as const,
					reason: "missing file path",
				},
				{
					kind: "table-surface" as const,
					label: "orders-table",
					filePath: "components/table/orders.tsx",
					severity: "medium" as const,
					reason: "table density",
				},
			],
			confidence: {
				routing: "medium" as const,
				components: "low" as const,
				styling: "high" as const,
				patterns: "medium" as const,
				overall: "low" as const,
			},
			unknowns: [],
		};

		const plan = buildChangePlan({
			prompt: "Refresh analytics widgets",
			workspaceProfile: profile,
			pagePath: "src/dashboard.tsx",
			componentsDir: "custom/components",
		});

		expect(plan.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "src/dashboard.tsx",
					status: "create",
				}),
				expect.objectContaining({
					path: "custom/components",
					status: "maybe-touch",
				}),
			]),
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
					label: "orders-table",
					paths: ["components/table/orders.tsx"],
				}),
			]),
		);
		expect(plan.unresolvedAssumptions).toEqual(
			expect.arrayContaining([
				expect.stringContaining("component inventory"),
				expect.stringContaining("Workspace profile confidence is low"),
			]),
		);
		expect(plan.recommendedExecutionMode).toBe("dry_run_only");
	});

	it("covers workspace helper branches for routes, component categories, pattern hints, and token hints", async () => {
		const root = await mkTempDir("openui-workspace-helper-");
		await fs.mkdir(path.join(root, "components", "ui"), { recursive: true });
		await fs.mkdir(path.join(root, "components", "generated"), {
			recursive: true,
		});
		await fs.mkdir(path.join(root, "components", "shared"), {
			recursive: true,
		});
		await fs.mkdir(path.join(root, "server"), { recursive: true });
		await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
		await fs.mkdir(path.join(root, ".git", "objects"), { recursive: true });

		await fs.writeFile(
			path.join(root, "components", "ui", "button.tsx"),
			"export function Button(){return null;}\n",
		);
		await fs.writeFile(
			path.join(root, "components", "generated", "hero.tsx"),
			"export const GeneratedHero = () => null;\n",
		);
		await fs.writeFile(
			path.join(root, "components", "shared", "card.tsx"),
			"'use client'\nexport class SharedCard {}\n",
		);
		await fs.writeFile(
			path.join(root, "server", "actions.ts"),
			"'use server'\nexport async function save(){ return fetch('/api'); }\n",
		);
		await fs.writeFile(
			path.join(root, "form.tsx"),
			"import { useForm } from 'react-hook-form';\nimport { useQuery } from '@tanstack/react-query';\nexport function Example(){ const form = useForm(); return form && useQuery ? null : null; }\n",
		);
		await fs.writeFile(
			path.join(root, "tailwind.config.ts"),
			"export default {}\n",
		);
		await fs.writeFile(
			path.join(root, "tokens.css"),
			":root { --brand: #000; }\n",
		);
		await fs.writeFile(
			path.join(root, "node_modules", "pkg", "ignored.ts"),
			"export const ignored = true;\n",
		);
		await fs.writeFile(
			path.join(root, ".git", "objects", "ignored.ts"),
			"export const ignoredGit = true;\n",
		);

		const recursiveFiles = await listWorkspaceFilesRecursive(root, () => true);
		expect(recursiveFiles).toEqual(
			expect.arrayContaining([
				"components/generated/hero.tsx",
				"components/shared/card.tsx",
				"components/ui/button.tsx",
				"form.tsx",
				"server/actions.ts",
				"tailwind.config.ts",
				"tokens.css",
			]),
		);
		expect(recursiveFiles.some((file) => file.includes("node_modules"))).toBe(
			false,
		);
		expect(recursiveFiles.some((file) => file.includes(".git"))).toBe(false);

		expect(routePathFromAppFile("app/(marketing)/page.tsx")).toBe("/");
		expect(routePathFromAppFile("src/app/settings/loading.tsx")).toBe(
			"/settings",
		);
		expect(inferRouteKind("app/dashboard/layout.tsx")).toBe("layout");
		expect(inferRouteKind("app/api/route.ts")).toBe("route");
		expect(inferRouteKind("app/page.tsx")).toBe("page");
		expect(inferRouteKind("app/error.tsx")).toBe("error");
		expect(inferRouteKind("app/loading.tsx")).toBe("loading");

		expect(
			inferComponentCategory(
				"components/ui/button.tsx",
				"components/ui",
				"components",
			),
		).toBe("ui");
		expect(
			inferComponentCategory(
				"components/generated/hero.tsx",
				"components/ui",
				"components",
			),
		).toBe("generated");
		expect(
			inferComponentCategory(
				"components/shared/card.tsx",
				"components/ui",
				"components",
			),
		).toBe("shared");
		expect(
			inferComponentCategory("lib/other.ts", "components/ui", "components"),
		).toBe("other");

		const componentEntries = await buildWorkspaceComponentEntries({
			root,
			uiDir: "components/ui",
			componentsDir: "components",
		});
		expect(componentEntries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: "components/ui/button.tsx",
					category: "ui",
					exportNames: ["Button"],
				}),
				expect.objectContaining({
					filePath: "components/generated/hero.tsx",
					category: "generated",
					exportNames: ["GeneratedHero"],
				}),
				expect.objectContaining({
					filePath: "components/shared/card.tsx",
					category: "shared",
					exportNames: ["SharedCard"],
				}),
			]),
		);

		const patternHints = await buildWorkspacePatternHints(root);
		expect(patternHints.formLibraries).toEqual(
			expect.arrayContaining(["react-hook-form", "custom-useForm"]),
		);
		expect(patternHints.dataLibraries).toEqual(
			expect.arrayContaining(["@tanstack/react-query", "fetch"]),
		);
		expect(patternHints.serverActionFiles).toContain("server/actions.ts");
		expect(patternHints.clientComponentFiles).toContain(
			"components/shared/card.tsx",
		);

		const tokenHints = await buildWorkspaceTokenHints(root);
		expect(tokenHints.tokenFiles).toContain("tokens.css");
		expect(tokenHints.cssVariableFiles).toEqual(
			expect.arrayContaining(["tokens.css"]),
		);
		expect(tokenHints.tailwindConfigFiles).toContain("tailwind.config.ts");
	});
});
