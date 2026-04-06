import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSpaceGovernanceReport } from "../tooling/space-governance-report.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeContracts(rootDir: string) {
	const browserRoot = path.join(
		path.dirname(rootDir),
		`${path.basename(rootDir)}-browser`,
	);
	await writeJson(
		path.join(rootDir, "contracts", "runtime", "path-registry.json"),
		{
			version: 2,
			runtimeSurface: ".runtime-cache",
			forbiddenTopLevelDirectories: [],
			forbiddenRepoRuntimeDirectories: [],
			categories: {
				build: { paths: [".runtime-cache/build"] },
				runLogs: { paths: [".runtime-cache/runs"] },
				cache: { paths: [".runtime-cache/cache"] },
				reports: { paths: [".runtime-cache/reports/space-governance"] },
				tmp: { paths: [".runtime-cache/tmp"] },
				toolMeta: { paths: [".runtime-cache/ci-image"] },
				mutation: { paths: [".runtime-cache/mutation"] },
				coverage: { paths: [".runtime-cache/coverage"] },
			},
			cleanPolicy: {
				resetOnClean: [".runtime-cache/build", ".runtime-cache/cache"],
				purgeOnClean: [
					".runtime-cache/runs",
					".runtime-cache/reports/space-governance",
				],
				retentionOnly: [".runtime-cache/cache", ".runtime-cache/runs"],
			},
			pathExpectations: [],
		},
	);
	await writeJson(
		path.join(rootDir, "contracts", "runtime", "space-governance.json"),
		{
			version: 1,
			reportRoot: ".runtime-cache/reports/space-governance",
			topN: 5,
			nonCanonicalRuntimeHeavyThresholdBytes: 1024,
			hardFailNonCanonicalPaths: [
				".runtime-cache/go-mod",
				".runtime-cache/go-cache",
				".runtime-cache/precommit-full-home",
				".runtime-cache/precommit-venv",
				".runtime-cache/precommit-full-venv",
				"$HOME",
				"$HOME/.cache/pre-commit",
			],
			rootAnomalies: ["$HOME"],
			baselineTargets: [
				".runtime-cache",
				".runtime-cache/go-mod",
				"$HOME",
				"apps/web/.next",
				"node_modules",
				".git",
			],
			lowRiskCleanupTargets: ["apps/web/.next"],
			verificationCandidates: [
				{ path: ".runtime-cache/go-mod", reason: "test" },
			],
			deferredSharedLayers: [{ path: "~/.npm", reason: "shared" }],
			repoSpecificExternalPolicy: {
				scope: "repo-specific-external",
				applyMode: "managed",
				reason: "test policy",
			},
			browserLanePolicy: {
				defaultUserDataDir: browserRoot,
				defaultProfileDirectory: "Profile 1",
				defaultCdpPort: 9343,
				janitorExcluded: true,
			},
			repoSpecificExternalTargets: [
				{ id: "tool-cache-root", kind: "tool-cache-root", reason: "root" },
				{ id: "playwright", kind: "tool-cache-path", reason: "playwright" },
				{ id: "home", kind: "tool-cache-path", reason: "home" },
			],
			repoSpecificPersistentAssets: [
				{
					id: "chrome-user-data-root",
					kind: "persistent-browser-root",
					path: browserRoot,
					scope: "repo-specific-persistent-browser-asset",
					applyMode: "report-only",
					janitorExcluded: true,
					reason: "browser root",
				},
			],
		},
	);
}

describe("space governance report", () => {
	it("captures runtime canonical split, anomalies, and baseline targets", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-governance-report-"),
		);
		const toolCacheRootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-governance-external-"),
		);
		const toolCacheBaseRoot = path.join(toolCacheRootDir, "tooling");
		try {
			await writeContracts(rootDir);
			await Promise.all([
				writeFile(
					path.join(rootDir, ".runtime-cache", "cache", "cache.json"),
					"ok",
				),
				writeFile(
					path.join(
						rootDir,
						".runtime-cache",
						"tmp",
						"repo-verify-final",
						"trace.txt",
					),
					"x".repeat(2048),
				),
				writeFile(
					path.join(rootDir, ".runtime-cache", "go-mod", "module.zip"),
					"x".repeat(32768),
				),
				writeFile(
					path.join(rootDir, "$HOME", ".cache", "pre-commit", "db.db"),
					"cache",
				),
				writeFile(path.join(rootDir, "apps", "web", ".next", "trace"), "trace"),
				writeFile(
					path.join(rootDir, "node_modules", "pkg", "index.js"),
					"module",
				),
				writeFile(
					path.join(rootDir, ".git", "objects", "pack", "pack.test"),
					"pack",
				),
			]);

			const { report, jsonPath, markdownPath } =
				await generateSpaceGovernanceReport({
					rootDir,
					env: {
						...process.env,
						OPENUI_TOOL_CACHE_ROOT: toolCacheBaseRoot,
						OPENUI_CHROME_USER_DATA_DIR: "",
						OPENUI_CHROME_PROFILE_DIRECTORY: "",
						OPENUI_CHROME_CHANNEL: "chrome",
						OPENUI_CHROME_EXECUTABLE_PATH: "",
					},
				});

			expect(report.summary.repoInternalBytes).toBeGreaterThan(0);
			expect(report.summary.sharedLayerRelatedBytes).toBeGreaterThanOrEqual(0);
			expect(report.summary).toHaveProperty("repoSpecificExternalBytes");
			expect(report.summary).toHaveProperty(
				"repoSpecificPersistentBrowserBytes",
			);
			expect(report.summary).toHaveProperty("reclaimableBytesByClass");
			expect(report.repoSpecificExternalContext).toMatchObject({
				scope: "repo-specific-external",
				applyMode: "managed",
			});
			expect(report.repoSpecificExternalContext.toolCacheBaseRoot).toBe(
				toolCacheBaseRoot.replaceAll("\\", "/"),
			);
			expect(report.repoSpecificExternalContext.workspaceToken).toMatch(
				/^[0-9a-f]{12}$/,
			);
			expect(report.repoSpecificExternalTargets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "tool-cache-root",
						applyMode: "managed",
						scope: "repo-specific-external",
						path: expect.stringContaining(
							toolCacheBaseRoot.replaceAll("\\", "/"),
						),
					}),
					expect.objectContaining({
						id: "home",
						applyMode: "managed",
					}),
				]),
			);
			expect(report.browserLanePolicy).toMatchObject({
				effectiveProfileDirectory: "Profile 1",
				cdpPort: 9343,
				janitorExcluded: true,
			});
			expect(report.repoSpecificPersistentAssets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "chrome-user-data-root",
						applyMode: "report-only",
						janitorExcluded: true,
					}),
				]),
			);
			expect(report.browserLanePolicy.currentInstanceState).toMatch(
				/stopped|running-same-root|port-collision|root-mismatch/,
			);
			expect(report.repoOwnedDockerResidue).toMatchObject({
				builderCount: 0,
			});
			expect(report.summary.nonCanonicalRuntimeBytes).toBeGreaterThan(
				report.summary.canonicalRuntimeBytes,
			);
			expect(report.runtimeSubtrees).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						relativePath: ".runtime-cache/go-mod",
						canonical: false,
					}),
				]),
			);
			expect(report.rootAnomalies).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						relativePath: "$HOME",
						exists: true,
					}),
				]),
			);
			expect(report.baselineTargets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						relativePath: ".runtime-cache/go-mod",
						classification: "hard-fail-non-canonical-path",
					}),
					expect.objectContaining({
						relativePath: "apps/web/.next",
						classification: "low-risk-cleanup-target",
					}),
				]),
			);
			expect(report.topTmpSubtrees).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						relativePath: ".runtime-cache/tmp/repo-verify-final",
					}),
				]),
			);
			await expect(fs.readFile(jsonPath, "utf8")).resolves.toContain(
				'"nonCanonicalRuntimeBytes"',
			);
			await expect(fs.readFile(markdownPath, "utf8")).resolves.toContain(
				"# Space Governance Report",
			);
			await expect(fs.readFile(markdownPath, "utf8")).resolves.toContain(
				"Repo-Specific External Cache",
			);
			await expect(fs.readFile(markdownPath, "utf8")).resolves.toContain(
				"Base root",
			);
			await expect(fs.readFile(markdownPath, "utf8")).resolves.toContain(
				"Repo Browser Lane",
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
			await fs.rm(toolCacheRootDir, { recursive: true, force: true });
		}
	}, 90000);

	it("ignores an empty legacy .runtime-cache/temp directory when collecting drift", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-governance-empty-temp-"),
		);
		const toolCacheRootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-governance-empty-temp-external-"),
		);
		const toolCacheBaseRoot = path.join(toolCacheRootDir, "tooling");
		try {
			await writeContracts(rootDir);
			await fs.mkdir(path.join(rootDir, ".runtime-cache", "temp"), {
				recursive: true,
			});

			const { report } = await generateSpaceGovernanceReport({
				rootDir,
				env: {
					...process.env,
					OPENUI_TOOL_CACHE_ROOT: toolCacheBaseRoot,
					OPENUI_CHROME_USER_DATA_DIR: "",
					OPENUI_CHROME_PROFILE_DIRECTORY: "",
					OPENUI_CHROME_CHANNEL: "chrome",
					OPENUI_CHROME_EXECUTABLE_PATH: "",
				},
			});

			expect(
				report.driftCandidates.some(
					(entry) => entry.path === ".runtime-cache/temp",
				),
			).toBe(false);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
			await fs.rm(toolCacheRootDir, { recursive: true, force: true });
		}
	});
});
