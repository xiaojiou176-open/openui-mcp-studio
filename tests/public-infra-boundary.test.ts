import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_WORKFLOW_FILES,
	parsePublicInfraBoundaryArgs,
	runPublicInfraBoundaryCheck,
	scanContentForPublicInfraBoundaryViolations,
} from "../tooling/check-public-infra-boundary.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("public infra boundary checker", () => {
	it("defaults to the public workflow allowlist when no CLI args are provided", () => {
		expect(parsePublicInfraBoundaryArgs([])).toEqual({
			rootDir: process.cwd(),
			files: DEFAULT_WORKFLOW_FILES,
		});
	});

	it("rejects obvious internal topology markers", () => {
		const violations = scanContentForPublicInfraBoundaryViolations(
			".github/workflows/example.yml",
			[
				'runs-on: ["self-hosted", "shared-pool"]',
				"env:",
				"  GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}",
				"  ORG_RUNNER_TOKEN: ${{ secrets.ORG_RUNNER_TOKEN }}",
				"  uses: google-github-actions/auth@v1",
				'  run: gcloud compute instances describe "github-runner-core-01" --zone us-central1-a',
				'  run: curl -sSL "https://api.github.com/orgs/acme/actions/runners?per_page=100"',
				"  expected=pool-core01-01",
			].join("\n"),
		);

		expect(violations.map((entry) => entry.ruleId)).toEqual(
			expect.arrayContaining([
				"self-hosted-label",
				"shared-pool-label",
				"gcp-env",
				"org-runner-token",
				"google-actions",
				"gcloud-cli",
				"machine-name",
				"zone-detail",
				"runner-api-query",
				"runner-pool-member",
			]),
		);
	});

	it("passes for the current public workflow files", async () => {
		const result = await runPublicInfraBoundaryCheck({ rootDir: repoRoot });

		expect(result.files).toEqual(DEFAULT_WORKFLOW_FILES);
		expect(result.violations).toEqual([]);
		expect(result.ok).toBe(true);
	});

	it("keeps release-readiness on a public-safe runner contract", async () => {
		const result = await runPublicInfraBoundaryCheck({
			rootDir: repoRoot,
			files: [".github/workflows/release-readiness.yml"],
		});

		expect(result.files).toEqual([".github/workflows/release-readiness.yml"]);
		expect(result.violations).toEqual([]);
		expect(result.ok).toBe(true);
	});
});
