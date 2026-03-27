import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRuntimeGovernanceCheck } from "../tooling/check-runtime-governance.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("runtime artifacts governance", () => {
	it("fails when governed files drift away from required artifact roots", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-artifacts-"),
		);
		try {
			await writeJson(
				path.join(
					rootDir,
					"contracts",
					"runtime",
					"path-registry.json",
				),
					{
						version: 1,
						forbiddenTopLevelDirectories: [],
						forbiddenRepoRuntimeDirectories: [],
						categories: {},
						cleanPolicy: {
							resetOnClean: [],
							purgeOnClean: [],
							retentionOnly: [],
						},
						pathExpectations: [
							{
								path: "playwright.config.ts",
								mustInclude: [".runtime-cache/runs", "artifacts/playwright"],
								mustExclude: [],
							},
							{
								path: ".github/workflows/ci.yml",
								mustInclude: [".runtime-cache/runs/**/artifacts/playwright/**"],
								mustExclude: [],
							},
						],
					},
					);
				await writeFile(
					path.join(rootDir, "playwright.config.ts"),
					'export default { outputDir: ".runtime-cache/runs/demo/artifacts/other" };\n',
				);
					await writeFile(
						path.join(rootDir, ".github", "workflows", "ci.yml"),
						"path: .runtime-cache/artifacts/playwright/**\n",
					);

				const result = await runRuntimeGovernanceCheck({ rootDir });

				expect(result.ok).toBe(false);
				expect(result.errors).toEqual(
					expect.arrayContaining([
						expect.stringContaining("missing required runtime path"),
					]),
				);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
