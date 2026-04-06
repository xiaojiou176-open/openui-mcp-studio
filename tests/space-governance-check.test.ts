import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSpaceGovernanceCheck } from "../tooling/check-space-governance.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeContracts(
	rootDir: string,
	override: Record<string, unknown> = {},
) {
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
			baselineTargets: [],
			lowRiskCleanupTargets: ["apps/web/.next"],
			verificationCandidates: [],
			deferredSharedLayers: [{ path: "~/.npm", reason: "shared" }],
			...override,
		},
	);
}

describe("space governance check", () => {
	it("fails when a root anomaly exists", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-check-root-anomaly-"),
		);
		try {
			await writeContracts(rootDir);
			await writeFile(path.join(rootDir, "$HOME", "note.txt"), "boom");

			const result = await runSpaceGovernanceCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining("hard-fail non-canonical path exists: $HOME"),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when a heavy unregistered runtime subtree is present", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-check-heavy-runtime-"),
		);
		try {
			await writeContracts(rootDir);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "rogue-cache", "module.zip"),
				"x".repeat(4096),
			);

			const result = await runSpaceGovernanceCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining(".runtime-cache/rogue-cache"),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails for hard-fail non-canonical paths even when they are tiny", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-check-hard-fail-"),
		);
		try {
			await writeContracts(rootDir);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "go-mod", "tiny.txt"),
				"x",
			);

			const result = await runSpaceGovernanceCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining(
						"hard-fail non-canonical path exists: .runtime-cache/go-mod",
					),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when cleanup allowlist escapes the workspace", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-check-escape-"),
		);
		try {
			await writeContracts(rootDir, {
				lowRiskCleanupTargets: ["../outside"],
			});

			await expect(runSpaceGovernanceCheck({ rootDir })).rejects.toThrow(
				/resolves outside workspace/i,
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
