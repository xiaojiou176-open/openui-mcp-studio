import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSpaceGovernanceCheck } from "../tooling/check-space-governance.mjs";
import { runSpaceClean } from "../tooling/space-clean.mjs";
import * as verifyModule from "../tooling/space-verify-candidates.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeContracts(
	rootDir: string,
	options: {
		verificationCandidates?: Array<{ path: string; reason: string }>;
	} = {},
) {
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
				cache: { paths: [".runtime-cache/cache"] },
				reports: { paths: [".runtime-cache/reports/space-governance"] },
			},
			cleanPolicy: {
				resetOnClean: [],
				purgeOnClean: [],
				retentionOnly: [],
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
			baselineTargets: [".runtime-cache/go-mod", "$HOME"],
			lowRiskCleanupTargets: ["apps/web/.next"],
			verificationCandidates: options.verificationCandidates ?? [
				{
					path: ".runtime-cache/go-mod",
					reason: "Go module cache",
				},
				{
					path: "$HOME",
					reason: "Unexpected repo-local HOME tree",
				},
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

describe("space verify and clean", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("falls back to cwd-relative report paths when report rootDir is missing", () => {
		const reportRoot = path.join(process.cwd(), ".runtime-cache", "reports");
		const payload = verifyModule.buildVerifyCliResultPayload({
			report: {
				summary: {
					contractCandidateCount: 0,
					maintenanceCandidateCount: 0,
					eligibleRepoLocalBytes: 0,
				},
				contractCandidates: [],
				maintenanceCandidates: [],
				reportedOnlyExternalTargets: [],
			},
			jsonPath: path.join(reportRoot, "verified-candidates.json"),
			markdownPath: path.join(reportRoot, "verified-candidates.md"),
		});

		expect(payload.reportPath).toBe(
			path.posix.join(".runtime-cache", "reports", "verified-candidates.json"),
		);
		expect(payload.markdownPath).toBe(
			path.posix.join(".runtime-cache", "reports", "verified-candidates.md"),
		);
		expect(payload.ok).toBe(true);
		expect(payload.topEligibleCandidates).toEqual([]);
	});

	it("verifies candidates and cleans verified repo-local pollution end-to-end", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-verify-clean-"),
		);
		try {
			await writeContracts(rootDir);
			await Promise.all([
				writeFile(
					path.join(rootDir, ".runtime-cache", "go-mod", "module.zip"),
					"x".repeat(4096),
				),
				writeFile(
					path.join(rootDir, "$HOME", ".cache", "pre-commit", "db.db"),
					"cache",
				),
			]);

			const before = await runSpaceGovernanceCheck({ rootDir });
			expect(before.ok).toBe(false);

			const activeRefCounter = async () => ({
				known: true,
				count: 0,
				error: null,
			});
			const candidates = await verifyModule.collectSpaceVerificationCandidates({
				rootDir,
				activeRefCounter,
			});
			expect(
				candidates
					.filter((entry) => entry.eligibleForCleanup)
					.map((entry) => entry.path),
			).toEqual([".runtime-cache/go-mod", "$HOME"]);
			expect(candidates.every((entry) => entry.activeRefsKnown === true)).toBe(
				true,
			);
			expect(
				candidates.some((entry) => entry.scope === "repo-specific-external"),
			).toBe(false);

			const verification = await verifyModule.generateSpaceVerificationReport({
				rootDir,
				activeRefCounter,
			});
			expect(verification.report.reportedOnlyExternalTargets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "tool-cache-root",
						applyMode: "managed",
						scope: "repo-specific-external",
					}),
				]),
			);
			expect(verification.report.reportedOnlyPersistentBrowserAssets).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "chrome-user-data-root",
						applyMode: "report-only",
						janitorExcluded: true,
					}),
				]),
			);
			expect(verification.report.browserLanePolicy).toMatchObject({
				effectiveProfileDirectory: "Profile 1",
				cdpPort: 9343,
				janitorExcluded: true,
			});

			const dryRun = await runSpaceClean({
				rootDir,
				activeRefCounter,
				parsedArgs: {
					targetSet: "verified",
					apply: false,
					targets: [],
				},
			});
			expect(dryRun.candidates.map((entry) => entry.path)).toEqual([
				".runtime-cache/go-mod",
				"$HOME",
			]);

			const apply = await runSpaceClean({
				rootDir,
				activeRefCounter,
				parsedArgs: {
					targetSet: "verified",
					apply: true,
					targets: [],
					label: "verified-fixture",
				},
			});
			expect(apply.removed).toEqual([".runtime-cache/go-mod", "$HOME"]);

			const after = await runSpaceGovernanceCheck({ rootDir });
			expect(after.ok).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 90000);

	it("refuses verified apply when any existing candidate is still ineligible", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-verify-ineligible-"),
		);
		try {
			await writeContracts(rootDir, {
				verificationCandidates: [
					{
						path: ".runtime-cache/cache",
						reason:
							"Canonical runtime cache must never be cleaned by verified flow",
					},
				],
			});
			await writeFile(
				path.join(rootDir, ".runtime-cache", "cache", "cache.json"),
				"{}",
			);

			await expect(
				runSpaceClean({
					rootDir,
					activeRefCounter: async () => ({
						known: true,
						count: 0,
						error: null,
					}),
					parsedArgs: {
						targetSet: "verified",
						apply: true,
						targets: [],
					},
				}),
			).rejects.toThrow(/ineligible candidates still exist/i);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 20000);

	it("marks candidates ineligible when active ref detection is unknown", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-verify-unknown-active-"),
		);
		try {
			await writeContracts(rootDir);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "go-mod", "module.zip"),
				"x".repeat(4096),
			);

			const candidates = await verifyModule.collectSpaceVerificationCandidates({
				rootDir,
				activeRefCounter: async () => ({
					known: false,
					count: 0,
					error: "lsof missing",
				}),
			});
			expect(candidates).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: ".runtime-cache/go-mod",
						activeRefsKnown: false,
						eligibleForCleanup: false,
					}),
				]),
			);

			const dryRun = await runSpaceClean({
				rootDir,
				activeRefCounter: async () => ({
					known: false,
					count: 0,
					error: "lsof missing",
				}),
				parsedArgs: {
					targetSet: "verified",
					apply: false,
					targets: [],
				},
			});

			expect(dryRun.candidates).toEqual([]);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 60000);

	it("keeps CLI stdout compact while still writing the full verification report", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-verify-cli-"),
		);
		try {
			await writeContracts(rootDir);
			await Promise.all([
				writeFile(
					path.join(rootDir, ".runtime-cache", "go-mod", "module.zip"),
					"x".repeat(4096),
				),
				writeFile(
					path.join(rootDir, "$HOME", ".cache", "pre-commit", "db.db"),
					"cache",
				),
			]);

			let stdoutText = "";
			let stderrText = "";
			const exitCode = await verifyModule.runSpaceVerifyCandidatesCli({
				rootDir,
				activeRefCounter: async () => ({
					known: true,
					count: 0,
					error: null,
				}),
				stdout: {
					write(chunk: string) {
						stdoutText += String(chunk);
						return true;
					},
				},
				stderr: {
					write(chunk: string) {
						stderrText += String(chunk);
						return true;
					},
				},
			});

			expect(exitCode).toBe(0);
			expect(stderrText).toBe("");

			const payload = JSON.parse(stdoutText);
			expect(payload.ok).toBe(true);
			expect(payload.reportPath).toMatch(
				/space-governance\/verified-candidates\.json$/,
			);
			expect(payload.markdownPath).toMatch(
				/space-governance\/verified-candidates\.md$/,
			);
			expect(payload.contractCandidateCount).toBe(2);
			expect(payload.maintenanceCandidateCount).toEqual(expect.any(Number));
			expect(payload.eligibleCount).toEqual(expect.any(Number));
			expect(payload.topEligibleCandidates).toEqual(expect.any(Array));
			expect(payload).not.toHaveProperty("candidates");
			expect(payload.topEligibleCandidates.length).toBeLessThanOrEqual(10);
			const reportPathFromCli = path.resolve(rootDir, payload.reportPath);
			await expect(fs.readFile(reportPathFromCli, "utf8")).resolves.toContain(
				'"contractCandidates"',
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 60000);

	it("rejects protected repo targets even if contract drifts", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-protected-target-"),
		);
		try {
			await writeContracts(rootDir);
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "space-governance.json"),
				{
					version: 1,
					reportRoot: ".runtime-cache/reports/space-governance",
					topN: 5,
					nonCanonicalRuntimeHeavyThresholdBytes: 1024,
					hardFailNonCanonicalPaths: [".runtime-cache/go-mod", "$HOME"],
					rootAnomalies: ["$HOME"],
					baselineTargets: [],
					lowRiskCleanupTargets: [".git"],
					verificationCandidates: [],
					deferredSharedLayers: [{ path: "~/.npm", reason: "shared" }],
				},
			);

			await expect(
				runSpaceClean({
					rootDir,
					parsedArgs: {
						targetSet: "low-risk",
						apply: false,
						targets: [".git"],
					},
				}),
			).rejects.toThrow(/protected repo target/i);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 90000);

	it("writes a post-apply snapshot even when deletion fails partway through", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-post-apply-failure-"),
		);
		try {
			await writeContracts(rootDir);
			await Promise.all([
				writeFile(path.join(rootDir, "apps", "web", ".next", "trace"), "trace"),
				writeFile(
					path.join(rootDir, ".runtime-cache", "go-cache", "cache.bin"),
					"cache",
				),
			]);
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "space-governance.json"),
				{
					version: 1,
					reportRoot: ".runtime-cache/reports/space-governance",
					topN: 5,
					nonCanonicalRuntimeHeavyThresholdBytes: 1024,
					hardFailNonCanonicalPaths: [".runtime-cache/go-mod", "$HOME"],
					rootAnomalies: ["$HOME"],
					baselineTargets: [],
					lowRiskCleanupTargets: ["apps/web/.next", ".runtime-cache/go-cache"],
					verificationCandidates: [],
					deferredSharedLayers: [{ path: "~/.npm", reason: "shared" }],
				},
			);

			const originalRm = fs.rm.bind(fs);
			const rmSpy = vi.spyOn(fs, "rm");
			let rmCount = 0;
			rmSpy.mockImplementation(async (targetPath, options) => {
				rmCount += 1;
				if (rmCount === 2) {
					throw new Error("simulated rm failure");
				}
				return originalRm(targetPath, options);
			});

			await expect(
				runSpaceClean({
					rootDir,
					parsedArgs: {
						targetSet: "low-risk",
						apply: true,
						targets: [],
						label: "failure-fixture",
					},
				}),
			).rejects.toThrow(/post-apply snapshot/i);

			await expect(
				fs.access(
					path.join(
						rootDir,
						".runtime-cache",
						"reports",
						"space-governance",
						"failure-fixture-post-apply.json",
					),
				),
			).resolves.toBeUndefined();
			rmSpy.mockRestore();
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	}, 90000);
});
