import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	readRunArtifactText,
	resolveRunArtifactDirectoryRelativePath,
	resolveRunArtifactRelativePath,
	writeDeliveryArtifacts,
	writeRunArtifactJson,
	writeRunArtifactText,
} from "../services/mcp-server/src/ship/artifacts.js";

const ORIGINAL_RUN_ID = process.env.OPENUI_RUNTIME_RUN_ID;
const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	vi.resetModules();
	vi.restoreAllMocks();
	if (ORIGINAL_RUN_ID === undefined) {
		delete process.env.OPENUI_RUNTIME_RUN_ID;
	} else {
		process.env.OPENUI_RUNTIME_RUN_ID = ORIGINAL_RUN_ID;
	}
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("ship artifact writer", () => {
	it("writes run-scoped JSON and markdown artifacts under the governed artifact root", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-");
		process.env.OPENUI_RUNTIME_RUN_ID = "test-run-artifacts";

		const jsonPath = await writeRunArtifactJson({
			workspaceRoot,
			name: "change-plan",
			payload: { ok: true },
		});
		const markdownPath = await writeRunArtifactText({
			workspaceRoot,
			name: "review-bundle",
			text: "# Review\n",
		});

		expect(jsonPath).toBe(resolveRunArtifactRelativePath("change-plan.json"));
		expect(markdownPath).toBe(
			resolveRunArtifactRelativePath("review-bundle.md"),
		);
		await expect(
			fs.readFile(path.join(workspaceRoot, jsonPath || ""), "utf8"),
		).resolves.toContain('"ok": true');
		await expect(
			readRunArtifactText({
				workspaceRoot,
				name: "review-bundle",
			}),
		).resolves.toBe("# Review\n");
	});

	it("rejects unsafe artifact names before writing governed paths", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-invalid-");
		process.env.OPENUI_RUNTIME_RUN_ID = "test-run-artifacts";

		await expect(
			writeRunArtifactJson({
				workspaceRoot,
				name: "..",
				payload: { blocked: true },
			}),
		).rejects.toThrow(/Invalid artifact name/);

		await expect(
			writeRunArtifactText({
				workspaceRoot,
				name: "bad/name",
				text: "oops",
			}),
		).rejects.toThrow(/Invalid artifact name/);

		expect(() =>
			resolveRunArtifactRelativePath("review-bundle.md", [
				"feature-flow",
				"bad/segment",
			]),
		).toThrow(/Invalid artifact segment/);
		expect(() =>
			resolveRunArtifactRelativePath("review-bundle.md", [".."]),
		).toThrow(/Invalid artifact segment/);
	});

	it("writes artifacts under scoped subdirectories when requested", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-scoped-");
		process.env.OPENUI_RUNTIME_RUN_ID = "test-run-artifacts";

		const jsonPath = await writeRunArtifactJson({
			workspaceRoot,
			name: "route-summary",
			subdirSegments: ["feature-flow", "checkout-flow", "routes", "01-cart"],
			payload: { ok: true },
		});

		expect(jsonPath).toBe(
			resolveRunArtifactRelativePath("route-summary.json", [
				"feature-flow",
				"checkout-flow",
				"routes",
				"01-cart",
			]),
		);
		expect(
			resolveRunArtifactDirectoryRelativePath([
				"feature-flow",
				"checkout-flow",
				"routes",
				"01-cart",
			]),
		).toContain("feature-flow/checkout-flow/routes/01-cart");
		await expect(
			fs.readFile(path.join(workspaceRoot, jsonPath || ""), "utf8"),
		).resolves.toContain('"ok": true');
	});

	it("writes the full delivery artifact set including extras and markdown bundle", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-delivery-");
		process.env.OPENUI_RUNTIME_RUN_ID = "test-run-artifacts";

		const artifacts = await writeDeliveryArtifacts({
			workspaceRoot,
			subdirSegments: ["feature-flow", "checkout-flow"],
			workspaceProfile: {
				version: 1,
				workspaceRoot,
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
			changePlan: {
				version: 1,
				prompt: "Create checkout flow",
				targetKind: "feature-flow",
				targetRoot: "apps/web",
				recommendedExecutionMode: "apply_safe",
				recommendedExecutionModeReason: "ready",
				items: [],
				assumptions: [],
				riskSummary: [],
				unresolvedAssumptions: [],
				reviewFocus: [],
				hotspots: [],
			},
			acceptancePack: {
				version: 1,
				prompt: "Create checkout flow",
				criteria: [],
				unresolvedAssumptions: [],
				recommendedChecks: ["quality_gate"],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "passed",
				passed: true,
				results: [],
				summary: {
					total: 0,
					autoPassed: 0,
					autoFailed: 0,
					manualRequired: 0,
					notRun: 0,
					blocked: 0,
				},
			},
			reviewBundle: {
				version: 1,
				prompt: "Create checkout flow",
				workspaceRoot,
				targetKind: "feature-flow",
				changedPaths: ["apps/web/app/checkout/page.tsx"],
				unresolvedItems: [],
			},
			extraJsonArtifacts: {
				"feature-flow-quality": {
					passed: true,
				},
			},
		});

		expect(artifacts).toMatchObject({
			workspaceProfile: expect.stringContaining(
				"feature-flow/checkout-flow/workspace-profile.json",
			),
			changePlan: expect.stringContaining(
				"feature-flow/checkout-flow/change-plan.json",
			),
			acceptancePack: expect.stringContaining(
				"feature-flow/checkout-flow/acceptance-pack.json",
			),
			acceptanceResult: expect.stringContaining(
				"feature-flow/checkout-flow/acceptance-result.json",
			),
			reviewBundle: expect.stringContaining(
				"feature-flow/checkout-flow/review-bundle.json",
			),
			reviewBundleMarkdown: expect.stringContaining(
				"feature-flow/checkout-flow/review-bundle.md",
			),
			"feature-flow-quality": expect.stringContaining(
				"feature-flow/checkout-flow/feature-flow-quality.json",
			),
		});

		await expect(
			fs.readFile(
				path.join(workspaceRoot, artifacts.reviewBundleMarkdown),
				"utf8",
			),
		).resolves.toContain("# OpenUI Review Bundle");
	});

	it("returns null for missing markdown artifacts and only writes explicit extras when optional payloads are absent", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-minimal-");
		process.env.OPENUI_RUNTIME_RUN_ID = "test-run-artifacts";

		await expect(
			readRunArtifactText({
				workspaceRoot,
				name: "missing-review-bundle",
			}),
		).resolves.toBeNull();

		const artifacts = await writeDeliveryArtifacts({
			workspaceRoot,
			extraJsonArtifacts: {
				"feature-flow-quality": {
					passed: false,
					reason: "manual review required",
				},
			},
		});

		expect(artifacts).toEqual({
			"feature-flow-quality": expect.stringContaining(
				"feature-flow-quality.json",
			),
		});
		await expect(
			fs.readFile(
				path.join(workspaceRoot, artifacts["feature-flow-quality"]),
				"utf8",
			),
		).resolves.toContain('"manual review required"');
	});

	it("returns no artifact paths when the governed run root falls outside the workspace", async () => {
		vi.doMock("../packages/shared-runtime/src/path-utils.js", async () => {
			const actual = await vi.importActual<
				typeof import("../packages/shared-runtime/src/path-utils.js")
			>("../packages/shared-runtime/src/path-utils.js");
			return {
				...actual,
				isPathInsideRootWithRealpath: () => false,
			};
		});

		const artifactsModule = await import(
			"../services/mcp-server/src/ship/artifacts.js"
		);
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-outside-");
		process.env.OPENUI_RUNTIME_RUN_ID = "test-run-artifacts";

		await expect(
			artifactsModule.writeRunArtifactJson({
				workspaceRoot,
				name: "change-plan",
				payload: { ok: true },
			}),
		).resolves.toBeUndefined();

		await expect(
			artifactsModule.writeRunArtifactText({
				workspaceRoot,
				name: "review-bundle",
				text: "# Review\n",
			}),
		).resolves.toBeUndefined();

		await expect(
			artifactsModule.writeDeliveryArtifacts({
				workspaceRoot,
				reviewBundle: {
					version: 1,
					prompt: "Create checkout flow",
					workspaceRoot,
					targetKind: "feature-flow",
					changedPaths: ["apps/web/app/checkout/page.tsx"],
					unresolvedItems: [],
				},
				extraJsonArtifacts: {
					extra: { ok: true },
				},
			}),
		).resolves.toEqual({});
	});
});
