import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	delete process.env.OPENUI_MCP_CACHE_DIR;
	vi.resetModules();
	vi.restoreAllMocks();
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("ship delivery intelligence extra branches", () => {
	it("keeps optional artifact keys absent when writers return nothing and falls back to default feature/route slugs", async () => {
		const workspaceRoot = await mkTempDir("openui-feature-flow-extra-");
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
				writeRunArtifactJson: vi.fn(async () => undefined),
				writeRunArtifactText: vi.fn(async () => undefined),
				resolveRunArtifactDirectoryRelativePath: vi.fn(
					(subdirSegments?: string[]) =>
						`.runtime-cache/runs/run/artifacts/openui/${(subdirSegments || []).join("/")}`,
				),
			};
		});

		const { executeShipFeatureFlow } = await import(
			"../services/mcp-server/src/ship/core.js"
		);
		const result = await executeShipFeatureFlow({
			name: "!!!",
			description: "Fallback coverage",
			workspaceRoot,
			routes: [
				{
					id: "***",
					prompt: "Fallback route",
					pagePath: "apps/web/app/demo/page.tsx",
				},
			],
			dryRun: true,
			runCommands: false,
		});

		expect(result.artifacts?.featureArtifactDir).toContain(
			"feature-flow/feature",
		);
		expect(result.routes[0]?.artifacts?.artifactDir).toContain(
			"/routes/01-route-1",
		);
		expect(result.acceptance?.pack.criteria).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "cross-route-consistency-review",
				}),
				expect.objectContaining({
					id: "shared-surface-review",
				}),
			]),
		);
		expect(Object.hasOwn(result.artifacts ?? {}, "featureFlowPlan")).toBe(
			false,
		);
		expect(
			Object.hasOwn(result.artifacts ?? {}, "featureFlowReviewBundleMarkdown"),
		).toBe(false);
		expect(
			Object.hasOwn(
				result.routes[0]?.result.artifacts ?? {},
				"workspaceProfile",
			),
		).toBe(false);
		expect(
			Object.hasOwn(
				result.routes[0]?.result.artifacts ?? {},
				"reviewBundleMarkdown",
			),
		).toBe(false);
	}, 20_000);
});
