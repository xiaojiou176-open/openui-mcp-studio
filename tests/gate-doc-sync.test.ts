import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("gate docs sync", () => {
	it("keeps canonical ci:gate command focused on repo-internal gates", async () => {
		const packageJsonPath = path.join(repoRoot, "package.json");
		const packageJsonRaw = await fs.readFile(packageJsonPath, "utf8");
		const packageJson = JSON.parse(packageJsonRaw) as {
			scripts?: Record<string, string>;
		};
		const ciGateCommand = packageJson.scripts?.["ci:gate"] ?? "";
		expect(ciGateCommand).not.toContain("--enforce-external-readonly");
		expect(ciGateCommand).toContain("tooling/ci-gate.mjs");
		expect(ciGateCommand).not.toContain(".runtime-cache/ci-gate/summary.json");
	});

	it("keeps docs routing aligned with the minimal docs profile", async () => {
		const [readme, governance, testing, indexContent] = await Promise.all([
			fs.readFile(path.join(repoRoot, "README.md"), "utf8"),
			fs.readFile(path.join(repoRoot, "docs", "governance-runbook.md"), "utf8"),
			fs.readFile(path.join(repoRoot, "docs", "testing.md"), "utf8"),
			fs.readFile(path.join(repoRoot, "docs", "index.md"), "utf8"),
		]);

		expect(readme).toContain("docs/index.md");
		expect(governance).toContain("docs routing layer");
		expect(testing).not.toContain("docs/generated/");
		expect(indexContent).not.toContain("docs/generated/");
	});

	it("keeps runner routing drift markers out of manual docs", async () => {
		const [governance, readme, testing] = await Promise.all([
			fs.readFile(path.join(repoRoot, "docs", "governance-runbook.md"), "utf8"),
			fs.readFile(path.join(repoRoot, "README.md"), "utf8"),
			fs.readFile(path.join(repoRoot, "docs", "testing.md"), "utf8"),
		]);
		expect(governance).not.toContain("spot_preferred");
		expect(readme).not.toContain("spot_preferred");
		expect(testing).not.toContain("spot_preferred");
		expect(governance).not.toContain("runner_mode");
		expect(readme).not.toContain("runner_mode");
	});

	it("keeps external readonly policy aligned in docs", async () => {
		const governancePath = path.join(repoRoot, "docs", "governance-runbook.md");
		const testingPath = path.join(repoRoot, "docs", "testing.md");
		const [governance, testing] = await Promise.all([
			fs.readFile(governancePath, "utf8"),
			fs.readFile(testingPath, "utf8"),
		]);

		expect(testing).toContain("It already injects `RUN_EXTERNAL_E2E=1`");
		expect(governance).toContain("report-only");
		expect(testing).toContain("separate from the default blocking path");
	});

	it("keeps CI gate ownership wording aligned with actual workflow jobs", async () => {
		const governancePath = path.join(repoRoot, "docs", "governance-runbook.md");
		const testingPath = path.join(repoRoot, "docs", "testing.md");
		const readmePath = path.join(repoRoot, "README.md");
		const [governance, testing, readme] = await Promise.all([
			fs.readFile(governancePath, "utf8"),
			fs.readFile(testingPath, "utf8"),
			fs.readFile(readmePath, "utf8"),
		]);

		expect(governance).toContain("host orchestration");
		expect(readme).toContain("construction-only bridge");
		expect(testing).toContain("CI `secret_scan`");
	});
});
