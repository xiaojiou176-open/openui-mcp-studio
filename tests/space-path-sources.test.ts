import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSpacePathSourcesCheck } from "../tooling/check-space-path-sources.mjs";
import { buildGateTaskEnv } from "../tooling/precommit-gate.mjs";
import { runGoToolCli } from "../tooling/run-go-tool.mjs";

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
			hardFailNonCanonicalPaths: [".runtime-cache/go-mod", "$HOME"],
			rootAnomalies: ["$HOME"],
			baselineTargets: [],
			lowRiskCleanupTargets: ["apps/web/.next"],
			verificationCandidates: [],
			deferredSharedLayers: [{ path: "~/.npm", reason: "shared" }],
		},
	);
	await writeJson(path.join(rootDir, "package.json"), {
		name: "fixture",
		private: true,
		scripts: {
			ok: "node tooling/run-go-tool.mjs gofmt -- --version",
		},
	});
}

describe("space path sources", () => {
	it("rejects workspace-inside cache roots and non-canonical runtime cache dirs", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-path-sources-"),
		);
		try {
			await writeContracts(rootDir);

			const result = await runSpacePathSourcesCheck({
				rootDir,
				env: {
					...process.env,
					PRE_COMMIT_HOME: ".runtime-cache/precommit-full-home",
					OPENUI_MCP_CACHE_DIR: ".runtime-cache/go-cache",
				},
			});

			expect(result.ok).toBe(false);
			expect(result.errors).toEqual(
				expect.arrayContaining([
					expect.stringContaining(
						"PRE_COMMIT_HOME must resolve outside workspace",
					),
					expect.stringContaining(
						"OPENUI_MCP_CACHE_DIR must resolve to a canonical runtime path",
					),
				]),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when a direct Go tool invocation is introduced", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-space-path-go-"),
		);
		try {
			await writeContracts(rootDir);
			await writeJson(path.join(rootDir, "package.json"), {
				name: "fixture",
				private: true,
				scripts: {
					bad: "gofmt ./...",
				},
			});

			const result = await runSpacePathSourcesCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.directGoViolations).toContain("package.json:scripts.bad");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("builds a safe pre-commit env and rejects ambient cache roots inside the workspace", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-precommit-env-"),
		);
		try {
			await expect(
				buildGateTaskEnv({
					rootDir,
					env: {
						...process.env,
						PRE_COMMIT_HOME: ".runtime-cache/precommit-full-home",
					},
				}),
			).rejects.toThrow(/PRE_COMMIT_HOME must resolve outside workspace/i);

			const safeEnv = await buildGateTaskEnv({ rootDir, env: process.env });
			expect(safeEnv.PRE_COMMIT_HOME).not.toContain(rootDir);
			expect(safeEnv.GOMODCACHE).not.toContain(rootDir);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("accepts tilde-based external cache roots as workspace-external paths", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-precommit-tilde-env-"),
		);
		try {
			await writeContracts(rootDir);

			const result = await runSpacePathSourcesCheck({
				rootDir,
				env: {
					...process.env,
					PRE_COMMIT_HOME: "~/.cache/pre-commit",
					GOMODCACHE: "~/go/pkg/mod",
				},
			});

			expect(result.ok).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("refuses Go wrapper runs when cache roots are pointed into the workspace", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-go-wrapper-"),
		);
		try {
			await expect(
				runGoToolCli({
					rootDir,
					env: {
						...process.env,
						GOMODCACHE: ".runtime-cache/go-mod",
					},
					parsedArgs: {
						tool: "gofmt",
						args: [],
					},
				}),
			).rejects.toThrow(/GOMODCACHE must resolve outside workspace/i);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails closed when the wrapped Go tool is unavailable", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-go-wrapper-missing-tool-"),
		);
		try {
			const exitCode = await runGoToolCli({
				rootDir,
				env: {
					...process.env,
					PATH: "",
				},
				parsedArgs: {
					tool: "gofmt",
					args: [],
				},
			});

			expect(exitCode).not.toBe(0);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
