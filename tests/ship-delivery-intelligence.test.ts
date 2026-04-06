import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

const tempDirs: string[] = [];
const originalWorkspaceRoot = process.env.OPENUI_MCP_WORKSPACE_ROOT;
const originalCacheDir = process.env.OPENUI_MCP_CACHE_DIR;

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

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
		throw new Error("Missing tool text payload");
	}
	return text;
}

afterEach(async () => {
	if (originalWorkspaceRoot === undefined) {
		delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	} else {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = originalWorkspaceRoot;
	}
	if (originalCacheDir === undefined) {
		delete process.env.OPENUI_MCP_CACHE_DIR;
	} else {
		process.env.OPENUI_MCP_CACHE_DIR = originalCacheDir;
	}
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship delivery intelligence branches", () => {
	it("skips delivery intelligence collection when artifacts and review bundle are both disabled", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-no-intel-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const scanWorkspaceProfile = vi.fn();
		const buildChangePlan = vi.fn();
		const buildReviewBundle = vi.fn();
		const writeRunArtifactJson = vi.fn();
		const writeRunArtifactText = vi.fn();

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>plain</main>"),
				convertHtmlToReactShadcn: vi.fn(async () => ({
					detection,
					payload: {
						files: [
							{
								path: "app/page.tsx",
								content: "export default function Page(){return null;}",
							},
						],
						notes: [],
					},
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(async () => ({
					targetRoot: workspaceRoot,
					dryRun: true,
					rollbackOnError: true,
					plan: [{ path: "app/page.tsx", status: "create" as const }],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async () => ({
					passed: true,
					issues: [],
					commandResults: [],
					checkedFiles: ["app/page.tsx"],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/review-bundle.js", () => ({
			buildReviewBundle,
			buildReviewBundleMarkdown: vi.fn(() => "# bundle"),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson,
				writeRunArtifactText,
			};
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship without extra intelligence",
			workspaceRoot,
			dryRun: true,
			runCommands: false,
			emitArtifacts: false,
			emitReviewBundle: false,
		});

		const payload = JSON.parse(readText(result)) as {
			workspaceProfile?: unknown;
			changePlan?: unknown;
			reviewBundle?: unknown;
			artifacts?: unknown;
			steps: Array<{ name: string }>;
		};
		expect(scanWorkspaceProfile).not.toHaveBeenCalled();
		expect(buildChangePlan).not.toHaveBeenCalled();
		expect(buildReviewBundle).not.toHaveBeenCalled();
		expect(writeRunArtifactJson).not.toHaveBeenCalled();
		expect(writeRunArtifactText).not.toHaveBeenCalled();
		expect(payload.workspaceProfile).toBeUndefined();
		expect(payload.changePlan).toBeUndefined();
		expect(payload.reviewBundle).toBeUndefined();
		expect(payload.artifacts).toBeUndefined();
		expect(
			payload.steps.some((step) => step.name === "scan_workspace_profile"),
		).toBe(false);
	});

	it("collects workspace profile, plan, acceptance, and review bundle even when artifact emission is disabled", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-with-intel-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const workspaceProfile = {
			version: 1,
			workspaceRoot,
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
			unknowns: ["token review needed"],
		};
		const changePlan = {
			version: 1,
			prompt: "Ship with review bundle",
			targetKind: "page" as const,
			targetRoot: "apps/web",
			recommendedExecutionMode: "dry_run_only" as const,
			items: [],
			riskSummary: ["shared shell"],
			unresolvedAssumptions: ["needs manual review"],
		};
		const acceptancePack = {
			version: 1,
			prompt: "Ship with review bundle",
			criteria: [
				{
					id: "quality",
					label: "quality",
					description: "quality gate",
					kind: "quality_gate" as const,
					source: "generated" as const,
					required: true,
				},
			],
			unresolvedAssumptions: [],
			recommendedChecks: ["quality_gate"],
		};
		const acceptanceEvaluation = {
			version: 1,
			verdict: "passed" as const,
			passed: true,
			results: [
				{ id: "quality", status: "auto_passed" as const, reason: "ok" },
			],
			summary: {
				total: 1,
				autoPassed: 1,
				autoFailed: 0,
				manualRequired: 0,
				notRun: 0,
				blocked: 0,
			},
		};
		const reviewBundle = {
			version: 1,
			prompt: "Ship with review bundle",
			workspaceRoot,
			targetKind: "page" as const,
			changePlan,
			workspaceProfile,
			acceptancePack,
			acceptanceEvaluation,
			quality: { passed: true, issuesCount: 0, commandFailures: 0 },
			changedPaths: ["app/page.tsx"],
			unresolvedItems: ["needs manual review", "token review needed"],
		};
		const scanWorkspaceProfile = vi.fn(async () => workspaceProfile);
		const buildChangePlan = vi.fn(() => changePlan);
		const buildReviewBundle = vi.fn(() => reviewBundle);
		const writeRunArtifactJson = vi.fn();
		const writeRunArtifactText = vi.fn();

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>rich</main>"),
				convertHtmlToReactShadcn: vi.fn(async () => ({
					detection,
					payload: {
						files: [
							{
								path: "app/page.tsx",
								content: "export default function Page(){return null;}",
							},
						],
						notes: ["converted"],
					},
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(async () => ({
					targetRoot: workspaceRoot,
					dryRun: true,
					rollbackOnError: true,
					plan: [{ path: "app/page.tsx", status: "create" as const }],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async () => ({
					passed: true,
					issues: [],
					commandResults: [
						{
							name: "lint",
							command: "npm run lint",
							status: "passed",
							exitCode: 0,
							stdout: "",
							stderr: "",
							durationMs: 10,
						},
						{
							name: "typecheck",
							command: "npm run typecheck",
							status: "failed",
							exitCode: 1,
							stdout: "",
							stderr: "failed",
							durationMs: 20,
						},
					],
					checkedFiles: ["app/page.tsx"],
					acceptancePack,
					acceptanceEvaluation,
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/review-bundle.js", () => ({
			buildReviewBundle,
			buildReviewBundleMarkdown: vi.fn(() => "# bundle"),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson,
				writeRunArtifactText,
			};
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship with review bundle",
			workspaceRoot,
			dryRun: true,
			runCommands: false,
			emitArtifacts: false,
			emitReviewBundle: true,
		});

		const payload = JSON.parse(readText(result)) as {
			workspaceProfile?: typeof workspaceProfile;
			changePlan?: typeof changePlan;
			acceptancePack?: typeof acceptancePack;
			acceptanceEvaluation?: typeof acceptanceEvaluation;
			reviewBundle?: typeof reviewBundle;
			artifacts?: unknown;
			steps: Array<{ name: string }>;
		};

		expect(scanWorkspaceProfile).toHaveBeenCalledTimes(1);
		expect(buildChangePlan).toHaveBeenCalledTimes(1);
		expect(buildReviewBundle).toHaveBeenCalledWith(
			expect.objectContaining({
				quality: expect.objectContaining({
					commandFailures: 1,
				}),
			}),
		);
		expect(writeRunArtifactJson).not.toHaveBeenCalled();
		expect(writeRunArtifactText).not.toHaveBeenCalled();
		expect(payload.workspaceProfile).toEqual(workspaceProfile);
		expect(payload.changePlan).toEqual(changePlan);
		expect(payload.acceptancePack).toEqual(acceptancePack);
		expect(payload.acceptanceEvaluation).toEqual(acceptanceEvaluation);
		expect(payload.reviewBundle).toEqual(reviewBundle);
		expect(payload.artifacts).toBeUndefined();
		expect(
			payload.steps.some((step) => step.name === "scan_workspace_profile"),
		).toBe(true);
		expect(
			payload.steps.some((step) => step.name === "write_run_artifacts"),
		).toBe(false);
	});

	it("writes delivery artifacts without building a review bundle when only artifact emission is enabled", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifact-only-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const workspaceProfile = {
			version: 1,
			workspaceRoot,
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
		const changePlan = {
			version: 1,
			prompt: "Ship with artifacts only",
			targetKind: "page" as const,
			targetRoot: "apps/web",
			recommendedExecutionMode: "apply_safe" as const,
			items: [],
			riskSummary: [],
			unresolvedAssumptions: [],
		};
		const acceptancePack = {
			version: 1,
			prompt: "Ship with artifacts only",
			criteria: [
				{
					id: "quality",
					label: "quality",
					description: "quality gate",
					kind: "quality_gate" as const,
					source: "generated" as const,
					required: true,
				},
			],
			unresolvedAssumptions: [],
			recommendedChecks: ["quality_gate"],
		};
		const acceptanceEvaluation = {
			version: 1,
			verdict: "passed" as const,
			passed: true,
			results: [
				{ id: "quality", status: "auto_passed" as const, reason: "ok" },
			],
			summary: {
				total: 1,
				autoPassed: 1,
				autoFailed: 0,
				manualRequired: 0,
				notRun: 0,
				blocked: 0,
			},
		};
		const scanWorkspaceProfile = vi.fn(async () => workspaceProfile);
		const buildChangePlan = vi.fn(() => changePlan);
		const buildReviewBundle = vi.fn();
		const writeRunArtifactJson = vi.fn(
			async ({ name }: { name: string }) =>
				`.runtime-cache/runs/run/artifacts/openui/${name}.json`,
		);
		const writeRunArtifactText = vi.fn();

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>artifact-only</main>"),
				convertHtmlToReactShadcn: vi.fn(async () => ({
					detection,
					payload: {
						files: [
							{
								path: "app/page.tsx",
								content: "export default function Page(){return null;}",
							},
						],
						notes: [],
					},
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(async () => ({
					targetRoot: workspaceRoot,
					dryRun: true,
					rollbackOnError: true,
					plan: [{ path: "app/page.tsx", status: "create" as const }],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async () => ({
					passed: true,
					issues: [],
					commandResults: [],
					checkedFiles: ["app/page.tsx"],
					acceptancePack,
					acceptanceEvaluation,
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/review-bundle.js", () => ({
			buildReviewBundle,
			buildReviewBundleMarkdown: vi.fn(() => "# bundle"),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson,
				writeRunArtifactText,
			};
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship with artifacts only",
			workspaceRoot,
			dryRun: true,
			runCommands: false,
			emitArtifacts: true,
			emitReviewBundle: false,
		});

		const payload = JSON.parse(readText(result)) as {
			reviewBundle?: unknown;
			artifacts?: Record<string, string>;
			steps: Array<{ name: string }>;
		};

		expect(buildReviewBundle).not.toHaveBeenCalled();
		expect(payload.reviewBundle).toBeUndefined();
		expect(payload.artifacts).toEqual({
			workspaceProfile:
				".runtime-cache/runs/run/artifacts/openui/workspace-profile.json",
			changePlan: ".runtime-cache/runs/run/artifacts/openui/change-plan.json",
			acceptancePack:
				".runtime-cache/runs/run/artifacts/openui/acceptance-pack.json",
			acceptanceResult:
				".runtime-cache/runs/run/artifacts/openui/acceptance-result.json",
		});
		expect(writeRunArtifactJson).toHaveBeenCalledTimes(4);
		expect(writeRunArtifactText).not.toHaveBeenCalled();
		expect(
			payload.steps.some((step) => step.name === "write_run_artifacts"),
		).toBe(true);
	});

	it("keeps artifact emission honest when artifact writers return no file paths", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-missing-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const scanWorkspaceProfile = vi.fn(async () => ({
			version: 1,
			workspaceRoot,
			defaultTargetRoot: "apps/web",
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsDir: "components",
			componentsImportBase: "@/components",
			routingMode: "app-router" as const,
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
				tokenAuthority: "tailwind-only" as const,
			},
			evidence: ["fixture"],
			evidenceAnchors: [],
			hotspots: [],
			confidence: {
				routing: "high" as const,
				components: "medium" as const,
				styling: "medium" as const,
				patterns: "low" as const,
				overall: "medium" as const,
			},
			unknowns: [],
		}));
		const buildChangePlan = vi.fn(() => ({
			version: 1,
			prompt: "Ship with missing artifact paths",
			targetKind: "page" as const,
			targetRoot: "apps/web",
			recommendedExecutionMode: "apply_safe" as const,
			recommendedExecutionModeReason: "ready",
			items: [],
			riskSummary: [],
			unresolvedAssumptions: [],
			reviewFocus: [],
			hotspots: [],
		}));

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>artifactless</main>"),
				convertHtmlToReactShadcn: vi.fn(async () => ({
					detection,
					payload: {
						files: [
							{
								path: "app/page.tsx",
								content: "export default function Page(){return null;}",
							},
						],
						notes: [],
					},
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(async () => ({
					targetRoot: workspaceRoot,
					dryRun: true,
					rollbackOnError: true,
					plan: [{ path: "app/page.tsx", status: "create" as const }],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async () => ({
					passed: true,
					issues: [],
					commandResults: [],
					checkedFiles: ["app/page.tsx"],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile,
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan,
		}));
		vi.doMock("../services/mcp-server/src/review-bundle.js", () => ({
			buildReviewBundle: vi.fn(() => ({
				version: 1,
				prompt: "Ship with missing artifact paths",
				workspaceRoot,
				targetKind: "page" as const,
				changedPaths: ["app/page.tsx"],
				unresolvedItems: [],
				manualFollowUps: [],
			})),
			buildReviewBundleMarkdown: vi.fn(() => "# missing paths"),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson: vi.fn(async () => undefined),
				writeRunArtifactText: vi.fn(async () => undefined),
			};
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship with missing artifact paths",
			workspaceRoot,
			dryRun: true,
			runCommands: false,
			emitArtifacts: true,
			emitReviewBundle: true,
		});

		const payload = JSON.parse(readText(result)) as {
			artifacts?: Record<string, string>;
			reviewBundle?: unknown;
		};

		expect(payload.reviewBundle).toEqual(
			expect.objectContaining({
				version: 1,
				targetKind: "page",
				changedPaths: ["app/page.tsx"],
				manualFollowUps: [],
			}),
		);
		expect(payload.artifacts).toEqual({});
	});

	it("executes feature-flow shipping with default generated components dir and review artifacts", async () => {
		const workspaceRoot = await mkTempDir("openui-feature-flow-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>fixture</main>"),
				convertHtmlToReactShadcn: vi.fn(
					async ({ pagePath }: { pagePath: string }) => ({
						detection,
						payload: {
							files: [
								{
									path: pagePath,
									content:
										'export default function Page(){return "mock-page";}',
								},
							],
							notes: [],
						},
					}),
				),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(
					async ({ files }: { files: Array<{ path: string }> }) => ({
						targetRoot: workspaceRoot,
						dryRun: true,
						rollbackOnError: true,
						plan: files.map((file) => ({
							path: file.path,
							status: "create" as const,
						})),
					}),
				),
			};
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async () => ({
					passed: true,
					issues: [],
					commandResults: [],
					checkedFiles: [],
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson: vi.fn(
					async ({
						name,
						subdirSegments,
					}: {
						name: string;
						subdirSegments?: string[];
					}) =>
						`.runtime-cache/runs/run/artifacts/openui/${[
							...(subdirSegments || []),
							`${name}.json`,
						].join("/")}`,
				),
				writeRunArtifactText: vi.fn(
					async ({
						name,
						subdirSegments,
					}: {
						name: string;
						subdirSegments?: string[];
					}) =>
						`.runtime-cache/runs/run/artifacts/openui/${[
							...(subdirSegments || []),
							`${name}.md`,
						].join("/")}`,
				),
				resolveRunArtifactDirectoryRelativePath: vi.fn(
					(subdirSegments?: string[]) =>
						`.runtime-cache/runs/run/artifacts/openui/${(subdirSegments || []).join("/")}`,
				),
			};
		});
		vi.doMock("../services/mcp-server/src/review-bundle.js", async () =>
			vi.importActual<
				typeof import("../services/mcp-server/src/review-bundle.js")
			>("../services/mcp-server/src/review-bundle.js"),
		);

		const { executeShipFeatureFlow } = await import(
			"../services/mcp-server/src/ship/core.js"
		);
		const result = await executeShipFeatureFlow({
			name: "Checkout Flow",
			description: "Multi-step checkout",
			workspaceRoot,
			layoutPath: "apps/web/app/checkout/layout.tsx",
			sharedComponentsDir: "apps/web/components/checkout",
			routes: [
				{
					id: "cart",
					prompt: "Cart page",
					pagePath: "apps/web/app/cart/page.tsx",
				},
				{
					id: "checkout",
					prompt: "Checkout page",
					pagePath: "apps/web/app/checkout/page.tsx",
					componentsDir: "apps/web/components/custom",
				},
			],
			dryRun: true,
			runCommands: false,
		});

		expect(result.description).toBe("Multi-step checkout");
		expect(result.plan).toMatchObject({
			routeCount: 2,
			layoutPath: "apps/web/app/checkout/layout.tsx",
			sharedComponentsDir: "apps/web/components/checkout",
		});
		expect(result.routes).toHaveLength(2);
		expect(result.routes[0]?.pagePath).toBe("apps/web/app/cart/page.tsx");
		expect(result.routes[0]?.artifacts?.artifactDir).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.routes[0]?.artifacts?.artifactDir).toContain(
			"/routes/01-cart",
		);
		expect(result.routes[1]?.artifacts?.artifactDir).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.routes[1]?.artifacts?.artifactDir).toContain(
			"/routes/02-checkout",
		);
		expect(result.routes[0]?.artifacts?.files?.workspaceProfile).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.routes[0]?.artifacts?.files?.workspaceProfile).toContain(
			"/routes/01-cart/workspace-profile.json",
		);
		expect(result.routes[1]?.artifacts?.files?.reviewBundleMarkdown).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.routes[1]?.artifacts?.files?.reviewBundleMarkdown).toContain(
			"/routes/02-checkout/review-bundle.md",
		);
		expect(result.summary).toMatchObject({
			routeCount: 2,
			passedRouteCount: 2,
			failedRouteCount: 0,
		});
		expect(result.quality).toMatchObject({
			passed: true,
			passedRouteCount: 2,
			failedRouteCount: 0,
		});
		expect(result.acceptance?.evaluation?.verdict).toBe(
			"manual_review_required",
		);
		expect(result.reviewBundle?.routeSummaries).toHaveLength(2);
		expect(result.reviewBundle?.sharedImpact).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "shared-layout",
				}),
				expect.objectContaining({
					label: "shared-components",
				}),
			]),
		);
		expect(result.artifacts?.featureFlowPlan).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.artifacts?.featureFlowPlan).toContain(
			"/feature-flow-plan.json",
		);
		expect(result.artifacts?.featureFlowAcceptance).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.artifacts?.featureFlowAcceptance).toContain(
			"/feature-flow-acceptance.json",
		);
		expect(result.artifacts?.featureFlowReviewBundle).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.artifacts?.featureFlowReviewBundle).toContain(
			"/feature-flow-review-bundle.json",
		);
		expect(result.artifacts?.routeArtifacts?.cart?.artifactDir).toContain(
			"feature-flow/checkout-flow/",
		);
		expect(result.artifacts?.routeArtifacts?.cart?.artifactDir).toContain(
			"/routes/01-cart",
		);
		expect(result.routes.map((route) => route.summary.changedPaths)).toEqual(
			expect.arrayContaining([
				expect.arrayContaining(["apps/web/app/cart/page.tsx"]),
				expect.arrayContaining(["apps/web/app/checkout/page.tsx"]),
			]),
		);
	});

	it("aggregates failed routes and shared touchpoints into feature-level quality and review", async () => {
		const workspaceRoot = await mkTempDir("openui-feature-flow-failed-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>fixture</main>"),
				convertHtmlToReactShadcn: vi.fn(
					async ({ pagePath }: { pagePath: string }) => ({
						detection,
						payload: {
							files: [
								{
									path: pagePath,
									content:
										'export default function Page(){return "mock-page";}',
								},
								{
									path: "apps/web/components/generated/shared-card.tsx",
									content: "export function SharedCard(){return null;}",
								},
							],
							notes: [],
						},
					}),
				),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(
					async ({ files }: { files: Array<{ path: string }> }) => ({
						targetRoot: workspaceRoot,
						dryRun: true,
						rollbackOnError: true,
						plan: files.map((file) => ({
							path: file.path,
							status: "create" as const,
						})),
					}),
				),
			};
		});
		let qualityCall = 0;
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async () => {
					qualityCall += 1;
					if (qualityCall === 1) {
						return {
							passed: false,
							issues: [
								{
									rule: "no-inline-style",
									severity: "error" as const,
									message: "inline style found",
									filePath: "apps/web/app/cart/page.tsx",
								},
							],
							commandResults: [
								{
									name: "lint",
									command: "npm run lint",
									status: "failed" as const,
									exitCode: 1,
									stdout: "",
									stderr: "failed",
									durationMs: 5,
								},
							],
							checkedFiles: [
								"apps/web/app/cart/page.tsx",
								"apps/web/components/generated/shared-card.tsx",
							],
						};
					}
					return {
						passed: true,
						issues: [],
						commandResults: [],
						checkedFiles: [
							"apps/web/app/checkout/page.tsx",
							"apps/web/components/generated/shared-card.tsx",
						],
					};
				}),
			};
		});
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson: vi.fn(
					async ({
						name,
						subdirSegments,
					}: {
						name: string;
						subdirSegments?: string[];
					}) =>
						`.runtime-cache/runs/run/artifacts/openui/${[
							...(subdirSegments || []),
							`${name}.json`,
						].join("/")}`,
				),
				writeRunArtifactText: vi.fn(
					async ({
						name,
						subdirSegments,
					}: {
						name: string;
						subdirSegments?: string[];
					}) =>
						`.runtime-cache/runs/run/artifacts/openui/${[
							...(subdirSegments || []),
							`${name}.md`,
						].join("/")}`,
				),
				resolveRunArtifactDirectoryRelativePath: vi.fn(
					(subdirSegments?: string[]) =>
						`.runtime-cache/runs/run/artifacts/openui/${(subdirSegments || []).join("/")}`,
				),
			};
		});
		vi.doMock("../services/mcp-server/src/review-bundle.js", async () =>
			vi.importActual<
				typeof import("../services/mcp-server/src/review-bundle.js")
			>("../services/mcp-server/src/review-bundle.js"),
		);

		const { executeShipFeatureFlow } = await import(
			"../services/mcp-server/src/ship/core.js"
		);
		const result = await executeShipFeatureFlow({
			name: "Checkout Flow",
			workspaceRoot,
			routes: [
				{
					id: "cart",
					prompt: "Cart page",
					pagePath: "apps/web/app/cart/page.tsx",
				},
				{
					id: "checkout",
					prompt: "Checkout page",
					pagePath: "apps/web/app/checkout/page.tsx",
				},
			],
			dryRun: true,
			runCommands: false,
		});

		expect(result.quality).toMatchObject({
			passed: false,
			anyFailed: true,
			passedRouteCount: 1,
			failedRouteCount: 1,
			issuesCount: 1,
			commandFailures: 1,
			dominantIssueRules: ["no-inline-style"],
		});
		expect(result.quality.hotspotPaths).toEqual(
			expect.arrayContaining(["apps/web/app/cart/page.tsx"]),
		);
		expect(result.reviewBundle?.sharedImpact).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "multi-route-touchpoint",
					paths: ["apps/web/components/generated/shared-card.tsx"],
				}),
			]),
		);
		expect(result.reviewBundle?.hotspots).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "route-cart-quality",
					severity: "high",
				}),
			]),
		);
		expect(result.reviewBundle?.manualFollowUps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Feature-level follow-up",
				}),
			]),
		);
		expect(result.acceptance.routeResults).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "cart",
					verdict: "failed",
					autoFailedCount: 1,
				}),
				expect.objectContaining({
					id: "checkout",
					verdict: "manual_review_required",
				}),
			]),
		);
	});

	it("keeps feature-flow artifacts sparse when artifact writers return no file paths", async () => {
		const workspaceRoot = await mkTempDir("openui-feature-flow-no-artifacts-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"ship-cache",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: vi.fn(async () => ({
					detection,
					uiImportBase: detection.uiImportBase,
					styleGuide: "Use cards",
				})),
				requestHtmlFromPrompt: vi.fn(async () => "<main>fixture</main>"),
				convertHtmlToReactShadcn: vi.fn(
					async ({ pagePath }: { pagePath: string }) => ({
						detection,
						payload: {
							files: [
								{
									path: pagePath,
									content: "export default function Page(){return null;}",
								},
							],
							notes: [],
						},
					}),
				),
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/file-ops.js")
			>("../services/mcp-server/src/file-ops.js");
			return {
				...actual,
				applyGeneratedFiles: vi.fn(async ({ files }) => ({
					targetRoot: workspaceRoot,
					dryRun: true,
					rollbackOnError: true,
					plan: files.map((file: { path: string }) => ({
						path: file.path,
						status: "create" as const,
					})),
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return {
				...actual,
				runQualityGate: vi.fn(async ({ files }) => ({
					passed: true,
					issues: [],
					commandResults: [],
					checkedFiles: files.map((file: { path: string }) => file.path),
				})),
			};
		});
		vi.doMock("../services/mcp-server/src/workspace-profile.js", () => ({
			scanWorkspaceProfile: vi.fn(async () => ({
				version: 1,
				workspaceRoot,
				defaultTargetRoot: "apps/web",
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsDir: "components",
				componentsImportBase: "@/components",
				routingMode: "app-router" as const,
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
					tokenAuthority: "tailwind-only" as const,
				},
				evidence: ["fixture"],
				evidenceAnchors: [],
				hotspots: [],
				confidence: {
					routing: "high" as const,
					components: "medium" as const,
					styling: "medium" as const,
					patterns: "low" as const,
					overall: "medium" as const,
				},
				unknowns: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/plan-change.js", () => ({
			buildChangePlan: vi.fn(({ prompt, pagePath }) => ({
				version: 1,
				prompt,
				targetKind: "page" as const,
				targetRoot: "apps/web",
				recommendedExecutionMode: "apply_safe" as const,
				recommendedExecutionModeReason: "ready",
				items: [{ path: pagePath, status: "create" as const }],
				assumptions: [],
				riskSummary: [],
				unresolvedAssumptions: [],
				reviewFocus: [],
				hotspots: [],
			})),
		}));
		vi.doMock("../services/mcp-server/src/ship/artifacts.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/ship/artifacts.js")
			>("../services/mcp-server/src/ship/artifacts.js");
			return {
				...actual,
				writeRunArtifactJson: vi.fn(async () => undefined),
				writeRunArtifactText: vi.fn(async () => undefined),
				resolveRunArtifactDirectoryRelativePath: vi.fn(
					() => undefined as unknown as string,
				),
			};
		});
		vi.doMock("../services/mcp-server/src/review-bundle.js", async () =>
			vi.importActual<
				typeof import("../services/mcp-server/src/review-bundle.js")
			>("../services/mcp-server/src/review-bundle.js"),
		);

		const { executeShipFeatureFlow } = await import(
			"../services/mcp-server/src/ship/core.js"
		);
		const result = await executeShipFeatureFlow({
			name: "Sparse Artifact Flow",
			workspaceRoot,
			routes: [
				{
					id: "checkout",
					prompt: "Checkout page",
					pagePath: "apps/web/app/checkout/page.tsx",
				},
			],
			dryRun: true,
			runCommands: false,
		});

		expect(result.routes[0]?.artifacts?.artifactDir).toBeUndefined();
		expect(result.artifacts?.featureFlowPlan).toBeUndefined();
		expect(result.artifacts?.featureFlowQuality).toBeUndefined();
		expect(result.artifacts?.featureFlowAcceptance).toBeUndefined();
		expect(result.artifacts?.featureFlowAcceptancePack).toBeUndefined();
		expect(result.artifacts?.featureFlowAcceptanceResult).toBeUndefined();
		expect(result.artifacts?.featureFlowReviewBundle).toBeUndefined();
		expect(result.artifacts?.featureFlowReviewBundleMarkdown).toBeUndefined();
	});
});
