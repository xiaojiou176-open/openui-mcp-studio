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

describe("cache tier governance", () => {
	it("fails when legacy artifact roots still exist", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-cache-tier-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "path-registry.json"),
				{
					version: 1,
					forbiddenTopLevelDirectories: ["logs", "cache"],
					forbiddenRepoRuntimeDirectories: [],
					pathExpectations: [
						{
							path: "ops/ci-container/run-in-container.sh",
							mustInclude: ["RUNNER_TEMP"],
							mustExclude: [".runtime-cache/ms-playwright"],
						},
					],
					categories: {},
					cleanPolicy: {
						resetOnClean: [],
						purgeOnClean: [],
						retentionOnly: [],
					},
				},
			);
			await fs.mkdir(path.join(rootDir, "logs"), { recursive: true });
			await writeFile(path.join(rootDir, "logs", "legacy.log"), "artifact\n");
			await writeFile(
				path.join(rootDir, "ops", "ci-container", "run-in-container.sh"),
				"echo ok\n",
			);

			const result = await runRuntimeGovernanceCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors[0]).toContain(
				"forbidden top-level runtime directory still contains files",
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
