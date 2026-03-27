import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("weekly env audit workflow", () => {
	it("runs on Monday UTC schedule and supports manual dispatch", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/weekly-env-audit.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");

		expect(workflow).toContain('cron: "0 5 * * 1"');
		expect(workflow).toContain("workflow_dispatch:");
	});

	it("includes required audit steps and artifact payload", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/weekly-env-audit.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");

		expect(workflow).toContain("required_env_hard_gate:");
		expect(workflow).toContain("Validate GEMINI_API_KEY is configured");
		expect(workflow).toContain(
			"node tooling/env-inventory.mjs > .runtime-cache/env-inventory/weekly-env-inventory.json",
		);
		expect(workflow).toContain("npm run env:governance:report");
		expect(workflow).toContain("npm run env:governance:check -- --ci");
		expect(workflow).toContain("node tooling/env-keyset-drift.mjs");
		expect(workflow).toContain(".runtime-cache/env-keyset-drift/report.json");
	});
});
