import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("manual env audit workflow", () => {
	it("keeps Gemini-backed maintenance workflows manual-only", async () => {
		const workflowPaths = [
			".github/workflows/mutation-manual.yml",
			".github/workflows/quality-trend-manual.yml",
			".github/workflows/env-audit-manual.yml",
		];

		for (const workflowPath of workflowPaths) {
			const workflow = await fs.readFile(
				path.join(repoRoot, workflowPath),
				"utf8",
			);
			expect(workflow, workflowPath).toContain("workflow_dispatch:");
			expect(workflow, workflowPath).not.toContain("schedule:");
			expect(workflow, workflowPath).not.toContain("cron:");
		}
	});

	it("includes required audit steps and artifact payload", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/env-audit-manual.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");

		expect(workflow).not.toContain("required_env_hard_gate:");
		expect(workflow).not.toContain("Validate GEMINI_API_KEY is configured");
		expect(workflow).not.toContain(
			"GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}",
		);
		expect(workflow).toContain(
			"node tooling/env-inventory.mjs > .runtime-cache/env-governance/env-inventory.json",
		);
		expect(workflow).toContain("npm run env:governance:report");
		expect(workflow).toContain("npm run env:governance:check -- --ci");
		expect(workflow).toContain("node tooling/env-keyset-drift.mjs");
		expect(workflow).toContain(".runtime-cache/env-keyset-drift/report.json");
	});
});
