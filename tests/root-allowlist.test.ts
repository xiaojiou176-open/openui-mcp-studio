import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRootAllowlistCheck } from "../tooling/check-root-allowlist.mjs";

async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("root allowlist governance", () => {
	it("fails when a top-level entry is not allowlisted", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-root-allowlist-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "governance", "root-allowlist.json"),
				{
					version: 2,
					mode: "authoritative-only",
					trackedDirectories: ["contracts", "src"],
					trackedFiles: ["README.md"],
					machineManagedInstallSurface: [],
					machineManagedRuntimeSurface: [".runtime-cache"],
					localDevelopmentDirectories: [],
					localDevelopmentFiles: [],
					forbiddenPatterns: ["tmp*", "*.log"],
				},
			);
			await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
			await fs.writeFile(path.join(rootDir, "README.md"), "# ok\n", "utf8");
			await fs.mkdir(path.join(rootDir, "tmp-output"), { recursive: true });

			const result = await runRootAllowlistCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.violations).toContainEqual({
				entry: "tmp-output",
				kind: "directory",
				reason: "forbidden_pattern",
			});
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
