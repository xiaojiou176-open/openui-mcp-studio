import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSpaceMaintain } from "../tooling/space-maintain.mjs";

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
			forbiddenRepoRuntimeDirectories: [".runtime-cache/quality-trend"],
			categories: {
				build: {
					owner: "tooling-root",
					schema: "build-artifacts",
					ttlDays: 14,
					cleanMode: "reset",
					rebuildStrategy: "recompile",
					cleanupClass: "skip-maintenance",
					maintenanceMinAgeHours: 0,
					retainLatestCount: 0,
					paths: [".runtime-cache/build"],
				},
				runLogs: {
					owner: "packages-runtime-observability",
					schema: "per-run-log-layout",
					ttlDays: 7,
					cleanMode: "purge",
					rebuildStrategy: "new-run-only",
					cleanupClass: "verify-first-maintain",
					maintenanceMinAgeHours: 72,
					retainLatestCount: 2,
					paths: [".runtime-cache/runs"],
				},
				cache: {
					owner: "packages-shared-runtime",
					schema: "cache-entries",
					ttlDays: 7,
					cleanMode: "retention",
					rebuildStrategy: "lazy-rebuild",
					cleanupClass: "skip-maintenance",
					maintenanceMinAgeHours: 0,
					retainLatestCount: 0,
					paths: [".runtime-cache/cache"],
				},
				reports: {
					owner: "tooling-root",
					schema: "cross-run-reports",
					ttlDays: 30,
					cleanMode: "purge",
					rebuildStrategy: "rerun-report-jobs",
					cleanupClass: "verify-first-maintain",
					maintenanceMinAgeHours: 336,
					retainLatestCount: 1,
					paths: [".runtime-cache/reports/space-governance"],
				},
				tmp: {
					owner: "tooling-root",
					schema: "temporary-run-state",
					ttlDays: 1,
					cleanMode: "purge",
					rebuildStrategy: "ephemeral-only",
					cleanupClass: "verify-first-maintain",
					maintenanceMinAgeHours: 24,
					retainLatestCount: 0,
					paths: [".runtime-cache/tmp"],
				},
				toolMeta: {
					owner: "tooling-root",
					schema: "tool-reports-and-metadata",
					ttlDays: 30,
					cleanMode: "purge",
					rebuildStrategy: "rerun-tooling",
					cleanupClass: "verify-first-maintain",
					maintenanceMinAgeHours: 168,
					retainLatestCount: 0,
					paths: [".runtime-cache/env-governance"],
				},
				mutation: {
					owner: "tooling-root",
					schema: "mutation-artifacts",
					ttlDays: 14,
					cleanMode: "purge",
					rebuildStrategy: "rerun-mutation",
					cleanupClass: "verify-first-maintain",
					maintenanceMinAgeHours: 168,
					retainLatestCount: 0,
					paths: [".runtime-cache/mutation"],
				},
				coverage: {
					owner: "tooling-root",
					schema: "coverage-reports",
					ttlDays: 14,
					cleanMode: "purge",
					rebuildStrategy: "rerun-coverage",
					cleanupClass: "verify-first-maintain",
					maintenanceMinAgeHours: 168,
					retainLatestCount: 0,
					paths: [".runtime-cache/coverage"],
				},
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
			topN: 10,
			nonCanonicalRuntimeHeavyThresholdBytes: 1024,
			hardFailNonCanonicalPaths: [],
			rootAnomalies: [],
			baselineTargets: [
				".runtime-cache",
				"apps/web/.next",
				"node_modules",
				".git",
			],
			lowRiskCleanupTargets: [
				"apps/web/.next",
				".runtime-cache/tmp/public-assets",
			],
			maintenancePolicy: {
				safeAutoMaintainTargets: [
					"apps/web/.next",
					".runtime-cache/tmp/public-assets",
				],
				manualOptInTargets: ["node_modules"],
				neverRepoLocalTargets: [".git", ".runtime-cache"],
				latestManifestRoot: ".runtime-cache/reports/space-governance",
				latestManifestBaseName: "maintenance-latest",
			},
			verificationCandidates: [],
			deferredSharedLayers: [],
			repoSpecificExternalTargets: [],
		},
	);
}

describe("space maintain", () => {
	it("plans and applies repo-local maintenance without touching manual opt-in install surfaces", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-maintain-"),
		);
		const oldTimestamp = (Date.now() - 5 * 24 * 60 * 60 * 1000) / 1000;
		try {
			await writeContracts(rootDir);
			await Promise.all([
				writeFile(path.join(rootDir, "apps", "web", ".next", "trace"), "trace"),
				writeFile(
					path.join(rootDir, ".runtime-cache", "tmp", "repo-verify-final", "cache.bin"),
					"x".repeat(4096),
				),
				writeFile(
					path.join(rootDir, ".runtime-cache", "tmp", "ci-runtime-smoke", "cache.bin"),
					"x".repeat(4096),
				),
				writeFile(
					path.join(rootDir, ".runtime-cache", "runs", "run-old", "logs", "runtime.jsonl"),
					"old",
				),
				writeFile(
					path.join(rootDir, ".runtime-cache", "runs", "run-new-1", "logs", "runtime.jsonl"),
					"new-1",
				),
				writeFile(
					path.join(rootDir, ".runtime-cache", "runs", "run-new-2", "logs", "runtime.jsonl"),
					"new-2",
				),
				writeFile(
					path.join(rootDir, "node_modules", "pkg", "index.js"),
					"module.exports = true;\n",
				),
			]);
			await Promise.all([
				fs.utimes(
					path.join(rootDir, ".runtime-cache", "tmp", "repo-verify-final"),
					oldTimestamp,
					oldTimestamp,
				),
				fs.utimes(
					path.join(rootDir, ".runtime-cache", "tmp", "ci-runtime-smoke"),
					oldTimestamp,
					oldTimestamp,
				),
				fs.utimes(
					path.join(rootDir, ".runtime-cache", "runs", "run-old"),
					oldTimestamp,
					oldTimestamp,
				),
			]);

			const dryRun = await runSpaceMaintain({
				rootDir,
				activeRefCounter: async () => ({
					status: "no",
					count: 0,
					error: null,
				}),
				parsedArgs: {
					apply: false,
					includeInstallSurface: false,
					label: "fixture-maintenance",
				},
			});

			expect(dryRun.ok).toBe(true);
			expect(dryRun.projectedReclaimableBytes).toBeGreaterThan(0);
			expect(
				dryRun.candidates.some(
					(entry) =>
						entry.path === ".runtime-cache/tmp/repo-verify-final" &&
						entry.eligibleForCleanup === true,
				),
			).toBe(true);
			expect(
				dryRun.skipped.some(
					(entry) =>
						entry.path === "node_modules" && entry.reason === "manual-opt-in",
				),
			).toBe(true);

			const apply = await runSpaceMaintain({
				rootDir,
				activeRefCounter: async () => ({
					status: "no",
					count: 0,
					error: null,
				}),
				parsedArgs: {
					apply: true,
					includeInstallSurface: false,
					label: "fixture-maintenance",
				},
			});

			expect(apply.ok).toBe(true);
			await expect(
				fs.stat(path.join(rootDir, ".runtime-cache", "tmp", "repo-verify-final")),
			).rejects.toMatchObject({ code: "ENOENT" });
			await expect(
				fs.stat(path.join(rootDir, ".runtime-cache", "tmp", "ci-runtime-smoke")),
			).rejects.toMatchObject({ code: "ENOENT" });
			await expect(
				fs.stat(path.join(rootDir, "apps", "web", ".next")),
			).rejects.toMatchObject({ code: "ENOENT" });
			await expect(
				fs.stat(path.join(rootDir, "node_modules")),
			).resolves.toBeDefined();
			await expect(
				fs.access(
					path.join(
						rootDir,
						".runtime-cache",
						"reports",
						"space-governance",
						"maintenance-latest.json",
					),
				),
			).resolves.toBeUndefined();
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 120000);
});
