import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateEnvGovernanceReport } from "../tooling/env-governance-report.mjs";

describe("env governance report", () => {
	it("generates JSON and Markdown report from inventory + deprecation registry", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-env-governance-report-"),
		);

		try {
			const inventoryScriptPath = path.join(
				tempRoot,
				"scripts",
				"mock-env-inventory.mjs",
			);
			const registryPath = path.join(
				tempRoot,
				"scripts",
				"env-contract",
				"deprecation-registry.json",
			);

			await fs.mkdir(path.dirname(inventoryScriptPath), { recursive: true });
			await fs.mkdir(path.dirname(registryPath), { recursive: true });

			await fs.writeFile(
				inventoryScriptPath,
				`#!/usr/bin/env node
console.log(JSON.stringify({
  generatedAt: "2026-02-25T00:00:00.000Z",
  contractVars: ["GEMINI_API_KEY", "OPENUI_MODEL_ROUTING"],
  runtimeVars: ["GEMINI_API_KEY", "OPENUI_QUEUE_MAX_PENDING"],
  nonContractVars: ["OPENUI_QUEUE_MAX_PENDING"]
}));
`,
				"utf8",
			);

			await fs.writeFile(
				registryPath,
				JSON.stringify(
					{
						version: 1,
						nonContractKeys: [
							{
								key: "OPENUI_QUEUE_MAX_PENDING",
								reason: "Queue setting",
							},
						],
						deprecatedKeys: [],
					},
					null,
					2,
				),
				"utf8",
			);

			const output = await generateEnvGovernanceReport({
				rootDir: tempRoot,
				inventoryScript: path.join("scripts", "mock-env-inventory.mjs"),
				registryPath: path.join(
					"scripts",
					"env-contract",
					"deprecation-registry.json",
				),
				now: new Date("2026-02-26T00:00:00.000Z"),
			});

			const jsonReportRaw = await fs.readFile(output.jsonPath, "utf8");
			const markdownReportRaw = await fs.readFile(output.markdownPath, "utf8");
			const jsonReport = JSON.parse(jsonReportRaw) as {
				counts: {
					unregisteredNonContractRuntime: number;
				};
				sections: {
					unregisteredNonContractRuntime: string[];
				};
			};

			expect(jsonReport.counts.unregisteredNonContractRuntime).toBe(0);
			expect(jsonReport.sections.unregisteredNonContractRuntime).toEqual([]);
			expect(markdownReportRaw).toContain("# Env Governance Report");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
