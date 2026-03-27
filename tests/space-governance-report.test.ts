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
		},
	);
}

describe("space governance report", () => {
	it("captures runtime canonical split, anomalies, and baseline targets", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-governance-report-"),
		);
		try {
			await writeContracts(rootDir);
			await Promise.all([
				writeFile(
					path.join(rootDir, ".runtime-cache", "cache", "cache.json"),
					"ok",
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
				});

			expect(report.summary.repoInternalBytes).toBeGreaterThan(0);
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
			await expect(fs.readFile(jsonPath, "utf8")).resolves.toContain(
				'"nonCanonicalRuntimeBytes"',
			);
			await expect(fs.readFile(markdownPath, "utf8")).resolves.toContain(
				"# Space Governance Report",
			);
			await expect(fs.readFile(markdownPath, "utf8")).resolves.toContain(
				"OK semantics",
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 90000);
});
