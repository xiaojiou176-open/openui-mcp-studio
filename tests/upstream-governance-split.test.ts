import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCompatMatrixCheck } from "../tooling/check-compat-matrix.mjs";
import { runPatchRegistryCheck } from "../tooling/check-patch-registry.mjs";
import { runUpstreamFailureClassificationCheck } from "../tooling/check-upstream-failure-classification.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("split upstream governance gates", () => {
	it("fails compat matrix when entry references unknown upstream", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-compat-"));
		try {
			await writeJson(path.join(rootDir, "contracts", "upstream", "inventory.json"), {
				version: 2,
				upstreams: [{ id: "gemini-api", failureAttributionSignals: ["upstream"] }],
			});
			await writeJson(
				path.join(rootDir, "contracts", "upstream", "compatibility-matrix.json"),
				{
					version: 1,
					entries: [{ id: "bad", inventoryIds: ["missing-upstream"], validatedBy: ["ci:gate"] }],
				},
			);
			const result = await runCompatMatrixCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors[0]).toContain("unknown upstream");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails patch registry when patch file is not registered", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-patch-registry-"));
		try {
			await writeJson(path.join(rootDir, "contracts", "upstream", "patch-registry.json"), {
				version: 1,
				manager: "patch-package",
				requiredFields: ["file", "reason", "retirementCondition", "rollback", "upstreamIssue"],
				patches: [],
			});
			await writeFile(path.join(rootDir, "patches", "react+1.0.0.patch"), "patch\n");
			const result = await runPatchRegistryCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors[0]).toContain("missing from patch registry");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails failure-classification gate when required categories are missing", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-upstream-failure-"));
		try {
			await writeJson(path.join(rootDir, "contracts", "upstream", "inventory.json"), {
				version: 2,
				upstreams: [{ id: "gemini-api", failureAttributionSignals: ["upstream"] }],
			});
			const result = await runUpstreamFailureClassificationCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors.some((entry) => entry.includes('missing required category "repo"'))).toBe(true);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
