import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();

	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const text = result.content.find((item) => item.type === "text")?.text;
	if (!text) {
		throw new Error("Missing text payload");
	}
	return text;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("planning and review surfaces", () => {
	it("workspace scan tool returns profile and artifact path", async () => {
		const profile = {
			version: 1,
			workspaceRoot: "/repo",
			defaultTargetRoot: "apps/web",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: [],
				cssVariableFiles: [],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
			},
			evidence: ["fixture"],
			unknowns: [],
		};
		const scanWorkspaceProfile = vi.fn(async () => profile);
		const writeRunArtifactJson = vi.fn(
			async () =>
				".runtime-cache/runs/run/artifacts/openui/workspace-profile.json",
		);
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
		}));

		const { registerWorkspaceScanTool } = await import(
			"../services/mcp-server/src/tools/workspace-scan.js"
		);
		const harness = createToolHarness();
		registerWorkspaceScanTool(harness.server);

		const result = await harness.getHandler("openui_scan_workspace_profile")({
			workspaceRoot: "/repo",
		});

		expect(scanWorkspaceProfile).toHaveBeenCalledWith({
			workspaceRoot: "/repo",
			targetRoot: undefined,
		});
		const payload = JSON.parse(readText(result)) as { artifactPath: string };
		expect(payload.artifactPath).toContain("workspace-profile.json");
	}, 20_000);

	it("workspace scan tool supports inline-only mode without artifacts", async () => {
		const profile = {
			version: 1,
			workspaceRoot: "/repo",
			defaultTargetRoot: "apps/docs",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: [],
				cssVariableFiles: [],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
			},
			evidence: ["fixture"],
			unknowns: ["no routes"],
		};
		const scanWorkspaceProfile = vi.fn(async () => profile);
		const writeRunArtifactJson = vi.fn();
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
		}));

		const { registerWorkspaceScanTool } = await import(
			"../services/mcp-server/src/tools/workspace-scan.js"
		);
		const harness = createToolHarness();
		registerWorkspaceScanTool(harness.server);

		const result = await harness.getHandler("openui_scan_workspace_profile")({
			workspaceRoot: "/repo",
			targetRoot: "apps/docs",
			writeArtifact: false,
		});

		expect(scanWorkspaceProfile).toHaveBeenCalledWith({
			workspaceRoot: "/repo",
			targetRoot: "apps/docs",
		});
		const payload = JSON.parse(readText(result)) as {
			defaultTargetRoot: string;
			artifactPath?: string;
		};
		expect(payload.defaultTargetRoot).toBe("apps/docs");
		expect(payload.artifactPath).toBeUndefined();
		expect(writeRunArtifactJson).not.toHaveBeenCalled();
	});

	it("workspace scan tool falls back to default workspace root when omitted", async () => {
		const scanWorkspaceProfile = vi.fn(async () => ({
			version: 1,
			workspaceRoot: "/default-workspace",
			defaultTargetRoot: "apps/web",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: [],
				cssVariableFiles: [],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
			},
			evidence: ["fixture"],
			unknowns: [],
		}));
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/constants.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/constants.js")
			>("../services/mcp-server/src/constants.js");
			return {
				...actual,
				getWorkspaceRoot: () => "/default-workspace",
			};
		});
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson: vi.fn(
				async () =>
					".runtime-cache/runs/run/artifacts/openui/workspace-profile.json",
			),
		}));

		const { registerWorkspaceScanTool } = await import(
			"../services/mcp-server/src/tools/workspace-scan.js"
		);
		const harness = createToolHarness();
		registerWorkspaceScanTool(harness.server);

		await harness.getHandler("openui_scan_workspace_profile")({});

		expect(scanWorkspaceProfile).toHaveBeenCalledWith({
			workspaceRoot: "/default-workspace",
			targetRoot: undefined,
		});
	});

	it("plan tool returns workspace profile and structured plan", async () => {
		const workspaceProfile = {
			version: 1,
			workspaceRoot: "/repo",
			defaultTargetRoot: "apps/web",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: [],
				cssVariableFiles: [],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
			},
			evidence: ["fixture"],
			unknowns: [],
		};
		const plan = {
			version: 1,
			prompt: "Create a dashboard",
			targetKind: "page",
			targetRoot: "apps/web",
			recommendedExecutionMode: "apply_safe",
			items: [],
			riskSummary: [],
			unresolvedAssumptions: [],
		};
		const scanWorkspaceProfile = vi.fn(async () => workspaceProfile);
		const buildChangePlan = vi.fn(() => plan);
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson: vi.fn(
				async () => ".runtime-cache/runs/run/artifacts/openui/change-plan.json",
			),
		}));

		const { registerPlanTool } = await import(
			"../services/mcp-server/src/tools/plan.js"
		);
		const harness = createToolHarness();
		registerPlanTool(harness.server);

		const result = await harness.getHandler("openui_plan_change")({
			prompt: "Create a dashboard",
			workspaceRoot: "/repo",
		});

		const payload = JSON.parse(readText(result)) as {
			plan: { recommendedExecutionMode: string };
		};
		expect(buildChangePlan).toHaveBeenCalled();
		expect(payload.plan.recommendedExecutionMode).toBe("apply_safe");
	});

	it("plan tool forwards targetRoot and skips artifact writes when disabled", async () => {
		const workspaceProfile = {
			version: 1,
			workspaceRoot: "/repo",
			defaultTargetRoot: "apps/docs",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: [],
				cssVariableFiles: [],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
			},
			evidence: ["fixture"],
			unknowns: [],
		};
		const plan = {
			version: 1,
			prompt: "Create a docs shell",
			targetKind: "page",
			targetRoot: "apps/docs",
			recommendedExecutionMode: "dry_run_only",
			items: [],
			riskSummary: ["docs shell"],
			unresolvedAssumptions: ["needs manual review"],
		};
		const scanWorkspaceProfile = vi.fn(async () => workspaceProfile);
		const buildChangePlan = vi.fn(() => plan);
		const writeRunArtifactJson = vi.fn();
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
		}));

		const { registerPlanTool } = await import(
			"../services/mcp-server/src/tools/plan.js"
		);
		const harness = createToolHarness();
		registerPlanTool(harness.server);

		const result = await harness.getHandler("openui_plan_change")({
			prompt: "Create a docs shell",
			workspaceRoot: "/repo",
			targetRoot: "apps/docs",
			writeArtifact: false,
		});

		const payload = JSON.parse(readText(result)) as {
			workspaceProfile: { defaultTargetRoot: string };
			artifactPath?: string;
		};
		expect(scanWorkspaceProfile).toHaveBeenCalledWith({
			workspaceRoot: "/repo",
			targetRoot: "apps/docs",
		});
		expect(buildChangePlan).toHaveBeenCalled();
		expect(payload.workspaceProfile.defaultTargetRoot).toBe("apps/docs");
		expect(payload.artifactPath).toBeUndefined();
		expect(writeRunArtifactJson).not.toHaveBeenCalled();
	});

	it("plan tool falls back to default workspace root when omitted", async () => {
		const scanWorkspaceProfile = vi.fn(async () => ({
			version: 1,
			workspaceRoot: "/default-workspace",
			defaultTargetRoot: "apps/web",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routeEntries: [],
			componentEntries: [],
			tokenHints: {
				tokenFiles: [],
				cssVariableFiles: [],
				tailwindConfigFiles: [],
			},
			patternHints: {
				formLibraries: [],
				dataLibraries: [],
				serverActionFiles: [],
				clientComponentFiles: [],
			},
			evidence: ["fixture"],
			unknowns: [],
		}));
		const buildChangePlan = vi.fn(() => ({
			version: 1,
			prompt: "Create a dashboard",
			targetKind: "page",
			targetRoot: "apps/web",
			recommendedExecutionMode: "apply_safe",
			items: [],
			riskSummary: [],
			unresolvedAssumptions: [],
		}));
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/constants.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/constants.js")
			>("../services/mcp-server/src/constants.js");
			return {
				...actual,
				getWorkspaceRoot: () => "/default-workspace",
			};
		});
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson: vi.fn(
				async () => ".runtime-cache/runs/run/artifacts/openui/change-plan.json",
			),
		}));

		const { registerPlanTool } = await import(
			"../services/mcp-server/src/tools/plan.js"
		);
		const harness = createToolHarness();
		registerPlanTool(harness.server);

		await harness.getHandler("openui_plan_change")({
			prompt: "Create a dashboard",
		});

		expect(scanWorkspaceProfile).toHaveBeenCalledWith({
			workspaceRoot: "/default-workspace",
			targetRoot: undefined,
		});
		expect(buildChangePlan).toHaveBeenCalled();
	});

	it("acceptance tool builds and evaluates acceptance pack", async () => {
		const { registerAcceptanceTool } = await import(
			"../services/mcp-server/src/tools/acceptance.js"
		);
		const harness = createToolHarness();
		registerAcceptanceTool(harness.server);

		const result = await harness.getHandler("openui_build_acceptance_pack")({
			prompt: "Create an accessible pricing hero",
			acceptanceCriteria: ["Headline should mention pricing."],
			qualityPassed: true,
			smokePassed: true,
			writeArtifact: false,
		});

		const payload = JSON.parse(readText(result)) as {
			pack: { criteria: Array<{ kind: string }> };
			evaluation: { passed: boolean };
		};
		expect(payload.pack.criteria.length).toBeGreaterThan(0);
		expect(payload.evaluation.passed).toBe(false);
		expect(payload.evaluation.verdict).toBe("manual_review_required");
	});

	it("acceptance tool supports pack-only mode without artifacts", async () => {
		const writeRunArtifactJson = vi.fn();
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
		}));

		const { registerAcceptanceTool } = await import(
			"../services/mcp-server/src/tools/acceptance.js"
		);
		const harness = createToolHarness();
		registerAcceptanceTool(harness.server);

		const result = await harness.getHandler("openui_build_acceptance_pack")({
			prompt: "Create a calm settings screen",
			writeArtifact: false,
		});

		const payload = JSON.parse(readText(result)) as {
			pack: { criteria: Array<{ kind: string }> };
			evaluation?: unknown;
			artifactPath?: string;
		};
		expect(payload.pack.criteria.length).toBeGreaterThan(0);
		expect(payload.evaluation).toBeUndefined();
		expect(payload.artifactPath).toBeUndefined();
		expect(writeRunArtifactJson).not.toHaveBeenCalled();
	});

	it("acceptance tool writes pack and evaluation artifacts when requested", async () => {
		const writeRunArtifactJson = vi.fn(
			async ({ name }: { name: string }) =>
				`.runtime-cache/runs/run/artifacts/openui/${name}.json`,
		);
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
		}));
		vi.doMock("../services/mcp-server/src/constants.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/constants.js")
			>("../services/mcp-server/src/constants.js");
			return {
				...actual,
				getWorkspaceRoot: () => "/default-workspace",
			};
		});

		const { registerAcceptanceTool } = await import(
			"../services/mcp-server/src/tools/acceptance.js"
		);
		const harness = createToolHarness();
		registerAcceptanceTool(harness.server);

		const result = await harness.getHandler("openui_build_acceptance_pack")({
			prompt: "Create an accessible pricing hero",
			qualityPassed: false,
			smokePassed: false,
			writeArtifact: true,
		});

		const payload = JSON.parse(readText(result)) as {
			artifactPath?: string;
			resultPath?: string;
			evaluation: { passed: boolean };
		};
		expect(payload.evaluation.passed).toBe(false);
		expect(payload.artifactPath).toContain("acceptance-pack.json");
		expect(payload.resultPath).toContain("acceptance-result.json");
		expect(writeRunArtifactJson).toHaveBeenCalledTimes(2);
	});

	it("acceptance tool can write only the pack artifact through the default workspace root", async () => {
		const writeRunArtifactJson = vi.fn(
			async ({ name }: { name: string }) =>
				`.runtime-cache/runs/run/artifacts/openui/${name}.json`,
		);
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
		}));
		vi.doMock("../services/mcp-server/src/constants.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/constants.js")
			>("../services/mcp-server/src/constants.js");
			return {
				...actual,
				getWorkspaceRoot: () => "/default-workspace",
			};
		});

		const { registerAcceptanceTool } = await import(
			"../services/mcp-server/src/tools/acceptance.js"
		);
		const harness = createToolHarness();
		registerAcceptanceTool(harness.server);

		const result = await harness.getHandler("openui_build_acceptance_pack")({
			prompt: "Create a settings shell",
			writeArtifact: true,
		});

		const payload = JSON.parse(readText(result)) as {
			artifactPath?: string;
			resultPath?: string;
		};
		expect(payload.artifactPath).toContain("acceptance-pack.json");
		expect(payload.resultPath).toBeUndefined();
		expect(writeRunArtifactJson).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceRoot: "/default-workspace",
				name: "acceptance-pack",
			}),
		);
	});

	it("review bundle tool builds unified bundle and markdown artifact paths", async () => {
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile: vi.fn(async () => ({
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routeEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
				patternHints: {
					formLibraries: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
				},
				evidence: ["fixture"],
				unknowns: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan: vi.fn(() => ({
				version: 1,
				prompt: "Create a hero",
				targetKind: "page",
				targetRoot: "apps/web",
				recommendedExecutionMode: "apply_safe",
				items: [
					{ path: "apps/web/app/page.tsx", status: "update", reason: "exists" },
				],
				riskSummary: [],
				unresolvedAssumptions: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson: vi.fn(
				async () =>
					".runtime-cache/runs/run/artifacts/openui/review-bundle.json",
			),
			writeRunArtifactText: vi.fn(
				async () => ".runtime-cache/runs/run/artifacts/openui/review-bundle.md",
			),
		}));

		const { registerReviewBundleTool } = await import(
			"../services/mcp-server/src/tools/review-bundle.js"
		);
		const harness = createToolHarness();
		registerReviewBundleTool(harness.server);

		const result = await harness.getHandler("openui_build_review_bundle")({
			prompt: "Create a hero",
			workspaceRoot: "/repo",
		});

		const payload = JSON.parse(readText(result)) as {
			artifactPath: string;
			markdownPath: string;
			bundle: {
				changedPaths: string[];
				summary?: { changedPathCount: number; manualFollowUpCount: number };
				autoChecks?: Array<{ label: string }>;
				manualFollowUps?: Array<{ label: string }>;
			};
		};
		expect(payload.artifactPath).toContain("review-bundle.json");
		expect(payload.markdownPath).toContain("review-bundle.md");
		expect(payload.bundle.changedPaths).toContain("apps/web/app/page.tsx");
		expect(payload.bundle.summary?.changedPathCount).toBe(1);
		expect(payload.bundle.autoChecks?.length).toBeGreaterThan(0);
		expect(payload.bundle.manualFollowUps?.length).toBeGreaterThan(0);
	});

	it("review bundle tool supports inline-only mode and full acceptance inputs", async () => {
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile: vi.fn(async () => ({
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routeEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
				patternHints: {
					formLibraries: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
				},
				evidence: ["fixture"],
				unknowns: ["tokens unknown"],
			})),
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan: vi.fn(() => ({
				version: 1,
				prompt: "Create a hero",
				targetKind: "page",
				targetRoot: "apps/web",
				recommendedExecutionMode: "dry_run_only",
				items: [],
				riskSummary: [],
				unresolvedAssumptions: ["manual review"],
			})),
		}));
		const writeRunArtifactJson = vi.fn();
		const writeRunArtifactText = vi.fn();
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson,
			writeRunArtifactText,
		}));

		const { registerReviewBundleTool } = await import(
			"../services/mcp-server/src/tools/review-bundle.js"
		);
		const harness = createToolHarness();
		registerReviewBundleTool(harness.server);

		const result = await harness.getHandler("openui_build_review_bundle")({
			prompt: "Create a hero",
			workspaceRoot: "/repo",
			writeArtifact: false,
			responsiveRequirements: ["Tablet keeps CTA visible."],
			a11yRequirements: ["Focus remains visible."],
			visualRequirements: ["Maintain bold contrast."],
			manualReviewItems: ["Design signoff"],
		});

		const payload = JSON.parse(readText(result)) as {
			bundle: { unresolvedItems: string[] };
			artifactPath?: string;
			markdownPath?: string;
		};
		expect(payload.bundle.unresolvedItems).toEqual(
			expect.arrayContaining(["manual review", "tokens unknown"]),
		);
		expect(payload.artifactPath).toBeUndefined();
		expect(payload.markdownPath).toBeUndefined();
		expect(writeRunArtifactJson).not.toHaveBeenCalled();
		expect(writeRunArtifactText).not.toHaveBeenCalled();
	});

	it("review bundle tool includes smoke metadata when smoke input is provided", async () => {
		const buildReviewBundle = vi.fn((input) => input);
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile: vi.fn(async () => ({
				version: 1,
				workspaceRoot: "/repo",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routeEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
				patternHints: {
					formLibraries: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
				},
				evidence: ["fixture"],
				unknowns: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan: vi.fn(() => ({
				version: 1,
				prompt: "Create a hero",
				targetKind: "page",
				targetRoot: "apps/web",
				recommendedExecutionMode: "apply_safe",
				items: [],
				riskSummary: [],
				unresolvedAssumptions: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/review-bundle.js", () => ({
			buildReviewBundle,
			buildReviewBundleMarkdown: vi.fn(() => "# bundle"),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson: vi.fn(),
			writeRunArtifactText: vi.fn(),
		}));

		const { registerReviewBundleTool } = await import(
			"../services/mcp-server/src/tools/review-bundle.js"
		);
		const harness = createToolHarness();
		registerReviewBundleTool(harness.server);

		await harness.getHandler("openui_build_review_bundle")({
			prompt: "Create a hero",
			workspaceRoot: "/repo",
			qualityPassed: true,
			smokePassed: true,
			writeArtifact: false,
		});

		expect(buildReviewBundle).toHaveBeenCalledWith(
			expect.objectContaining({
				smoke: { passed: true, usedTargetRoot: "apps/web" },
			}),
		);
	});

	it("review bundle tool falls back to the default workspace root", async () => {
		const buildReviewBundle = vi.fn((input) => input);
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile: vi.fn(async () => ({
				version: 1,
				workspaceRoot: "/default-workspace",
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routeEntries: [],
				componentEntries: [],
				tokenHints: {
					tokenFiles: [],
					cssVariableFiles: [],
					tailwindConfigFiles: [],
				},
				patternHints: {
					formLibraries: [],
					dataLibraries: [],
					serverActionFiles: [],
					clientComponentFiles: [],
				},
				evidence: ["fixture"],
				unknowns: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan: vi.fn(() => ({
				version: 1,
				prompt: "Create a hero",
				targetKind: "page",
				targetRoot: "apps/web",
				recommendedExecutionMode: "apply_safe",
				items: [],
				riskSummary: [],
				unresolvedAssumptions: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/review-bundle.js", () => ({
			buildReviewBundle,
			buildReviewBundleMarkdown: vi.fn(() => "# bundle"),
		}));
		vi.doMock("../services/mcp-server/src/constants.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/constants.js")
			>("../services/mcp-server/src/constants.js");
			return {
				...actual,
				getWorkspaceRoot: () => "/default-workspace",
			};
		});
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", () => ({
			writeRunArtifactJson: vi.fn(),
			writeRunArtifactText: vi.fn(),
		}));

		const { registerReviewBundleTool } = await import(
			"../services/mcp-server/src/tools/review-bundle.js"
		);
		const harness = createToolHarness();
		registerReviewBundleTool(harness.server);

		await harness.getHandler("openui_build_review_bundle")({
			prompt: "Create a hero",
			writeArtifact: false,
		});

		expect(buildReviewBundle).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceRoot: "/default-workspace",
			}),
		);
	});

	it("feature flow tool delegates to executeShipFeatureFlow", async () => {
		const executeShipFeatureFlow = vi.fn(async () => ({
			version: 1,
			name: "Checkout Flow",
			routes: [],
		}));
		vi.doMock("../services/mcp-server/src/ship/core.js", () => ({
			executeShipFeatureFlow,
		}));

		const { registerShipFeatureFlowTool } = await import(
			"../services/mcp-server/src/tools/ship-feature-flow.js"
		);
		const harness = createToolHarness();
		registerShipFeatureFlowTool(harness.server);

		const result = await harness.getHandler("openui_ship_feature_flow")({
			name: "Checkout Flow",
			workspaceRoot: "/repo",
			layoutPath: "apps/web/app/checkout/layout.tsx",
			sharedComponentsDir: "apps/web/components/checkout",
			routes: [
				{
					id: "checkout",
					prompt: "Checkout page",
					pagePath: "apps/web/app/checkout/page.tsx",
				},
			],
		});

		expect(executeShipFeatureFlow).toHaveBeenCalledTimes(1);
		expect(executeShipFeatureFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				layoutPath: "apps/web/app/checkout/layout.tsx",
				sharedComponentsDir: "apps/web/components/checkout",
			}),
		);
		expect(JSON.parse(readText(result))).toMatchObject({
			version: 1,
			name: "Checkout Flow",
		});
	});

	it("feature flow tool falls back to the default workspace root when omitted", async () => {
		const executeShipFeatureFlow = vi.fn(async () => ({
			version: 1,
			name: "Settings Flow",
			routes: [],
		}));
		vi.doMock("../services/mcp-server/src/ship/core.js", () => ({
			executeShipFeatureFlow,
		}));
		vi.doMock("../services/mcp-server/src/constants.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/constants.js")
			>("../services/mcp-server/src/constants.js");
			return {
				...actual,
				getWorkspaceRoot: () => "/default-workspace",
			};
		});

		const { registerShipFeatureFlowTool } = await import(
			"../services/mcp-server/src/tools/ship-feature-flow.js"
		);
		const harness = createToolHarness();
		registerShipFeatureFlowTool(harness.server);

		await harness.getHandler("openui_ship_feature_flow")({
			name: "Settings Flow",
			routes: [
				{
					id: "settings",
					prompt: "Settings page",
					pagePath: "apps/web/app/settings/page.tsx",
				},
			],
		});

		expect(executeShipFeatureFlow).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceRoot: "/default-workspace",
			}),
		);
	});
});
