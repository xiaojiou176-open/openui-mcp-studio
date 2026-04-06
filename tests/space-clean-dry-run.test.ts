import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSpaceCleanDryRun } from "../tooling/space-clean-dry-run.mjs";

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
			rootAnomalies: ["$HOME"],
			baselineTargets: [],
			lowRiskCleanupTargets: [
				"apps/web/.next",
				".runtime-cache/go-cache",
				".runtime-cache/precommit-venv",
			],
			verificationCandidates: [],
			deferredSharedLayers: [{ path: "~/.npm", reason: "shared" }],
		},
	);
}

describe("space clean dry-run", () => {
	it("lists allowlisted repo-local cleanup targets only", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-dry-run-"),
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

			const result = await runSpaceCleanDryRun({ rootDir });

			expect(result.ok).toBe(true);
			expect(result.candidates.map((entry) => entry.path)).toEqual([
				"apps/web/.next",
				".runtime-cache/go-cache",
				".runtime-cache/precommit-venv",
			]);
			expect(result.deferredSharedLayers).toEqual(
				expect.arrayContaining([expect.objectContaining({ path: "~/.npm" })]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("refuses requests for the runtime surface root", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-dry-run-refuse-root-"),
		);
		try {
			await writeContracts(rootDir);

			const result = await runSpaceCleanDryRun({
				rootDir,
				targets: [".runtime-cache"],
			});

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining("runtime surface root"),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
