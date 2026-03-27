import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

function getJobSection(workflow: string, jobId: string): string {
	const jobHeader = `  ${jobId}:\n`;
	const sectionStart = workflow.indexOf(jobHeader);
	if (sectionStart === -1) {
		throw new Error(`Missing workflow job section: ${jobId}`);
	}
	const remainder = workflow.slice(sectionStart + jobHeader.length);
	const nextJobMatcher = /^\s{2}[A-Za-z0-9_-]+:\n/m;
	const nextJobMatch = nextJobMatcher.exec(remainder);
	if (!nextJobMatch || nextJobMatch.index === undefined) {
		return remainder;
	}
	return remainder.slice(0, nextJobMatch.index);
}

function getJobIfExpression(workflow: string, jobId: string): string {
	const section = getJobSection(workflow, jobId);
	const match = section.match(/^\s{4}if:\s*(.+)$/m);
	if (!match) {
		throw new Error(`Missing if expression in job: ${jobId}`);
	}
	return match[1].trim();
}

function normalizeExpression(expression: string): string {
	return expression.replace(/\s+/g, " ").trim();
}

describe("live gemini smoke gating strategy", () => {
	it("keeps explicit nightly key-check controls and hard-fail path", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const nightlySection = getJobSection(workflow, "nightly_coverage_gate");

		expect(nightlySection).toContain(
			"Validate GEMINI_API_KEY for nightly live gate",
		);
		expect(nightlySection).toContain(
			"Nightly live gate requires GEMINI_API_KEY secret.",
		);
		expect(nightlySection).toContain("Live Gemini smoke in CI container (nightly)");
		expect(nightlySection).toContain("command: npm run test:live");
	});

	it("defines a hard-gated live job for workflow_dispatch/main/release and non-fork PRs targeting those branches", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const ifExpression = getJobIfExpression(workflow, "live_gemini_hard_gate");
		const hardGateSection = getJobSection(workflow, "live_gemini_hard_gate");
		const normalizedIfExpression = normalizeExpression(ifExpression);

		expect(normalizedIfExpression).toContain(
			"github.event_name == 'workflow_dispatch'",
		);
		expect(normalizedIfExpression).toContain("github.ref == 'refs/heads/main'");
		expect(normalizedIfExpression).toContain(
			"startsWith(github.ref, 'refs/heads/release/')",
		);
		expect(normalizedIfExpression).toContain(
			"github.event_name == 'pull_request'",
		);
		expect(normalizedIfExpression).toContain(
			"!github.event.pull_request.head.repo.fork",
		);
		expect(normalizedIfExpression).toContain("github.base_ref == 'main'");
		expect(normalizedIfExpression).toContain(
			"startsWith(github.base_ref, 'release/')",
		);
		expect(normalizedIfExpression).toContain("||");
		expect(normalizedIfExpression).toContain("&&");
		expect(hardGateSection).toContain("name: Live Gemini hard gate");
		expect(hardGateSection).toContain("Validate GEMINI_API_KEY for hard gate");
		expect(hardGateSection).toContain(
			"Live Gemini hard gate requires GEMINI_API_KEY secret.",
		);
		expect(hardGateSection).toContain("Run live Gemini smoke suite in CI container");
		expect(hardGateSection).toContain("command: npm run test:live");
	});

	it("keeps hard gate failure semantics stable for missing key", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");

		const hardGateSection = getJobSection(workflow, "live_gemini_hard_gate");
		expect(typeof hardGateSection).toBe("string");
		expect(hardGateSection).toContain("::error title=Missing GEMINI_API_KEY");
		expect(hardGateSection).toContain(
			"Live Gemini hard gate requires GEMINI_API_KEY secret.",
		);
		expect(hardGateSection).toContain("exit 1");
	});

	it("keeps nightly missing-key semantics as hard fail", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");

		const nightlySection = getJobSection(workflow, "nightly_coverage_gate");
		expect(typeof nightlySection).toBe("string");
		expect(nightlySection).toContain(
			"Validate GEMINI_API_KEY for nightly live gate",
		);
		expect(nightlySection).toContain(
			"::error title=Missing GEMINI_API_KEY::Nightly live gate requires GEMINI_API_KEY secret.",
		);
		expect(nightlySection).toContain("exit 1");
		expect(nightlySection).toContain("Live Gemini smoke in CI container (nightly)");
		expect(nightlySection).not.toContain("nightly-live-gate-alert");
	});

	it("requires explicit env flag in test file to prevent accidental live calls", async () => {
		const testPath = path.join(repoRoot, "tests/live-gemini-smoke.test.ts");
		const content = await fs.readFile(testPath, "utf8");

		expect(content).toContain("OPENUI_ENABLE_LIVE_GEMINI_SMOKE");
		expect(content).toContain("const run = shouldRun ? it : it.skip");
	});
});
