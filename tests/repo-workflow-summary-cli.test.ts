import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("repo workflow summary cli", () => {
	it("parses flags and writes the builder payload", async () => {
		const buildRepoWorkflowSummary = vi.fn(async () => ({
			version: 1,
			workspaceRoot: "/repo",
			generatedAt: "2026-03-31T00:00:00.000Z",
		}));

		vi.doMock("../services/mcp-server/src/repo-workflow-summary.js", () => ({
			buildRepoWorkflowSummary,
		}));

		const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

		const { parseArgs, runRepoWorkflowSummaryCli } = await import(
			"../tooling/cli/repo-workflow-summary.ts"
		);

		expect(
			parseArgs(["--workspace-root", "/repo", "--failed-runs-limit", "7"]),
		).toEqual({
			workspaceRoot: "/repo",
			failedRunsLimit: 7,
		});

		await runRepoWorkflowSummaryCli([
			"--workspace-root",
			"/repo",
			"--failed-runs-limit",
			"7",
		]);

		expect(buildRepoWorkflowSummary).toHaveBeenCalledWith({
			workspaceRoot: "/repo",
			failedRunsLimit: 7,
		});
		expect(stdoutWrite).toHaveBeenCalledWith(
			`${JSON.stringify(
				{
					version: 1,
					workspaceRoot: "/repo",
					generatedAt: "2026-03-31T00:00:00.000Z",
				},
				null,
				2,
			)}\n`,
		);
	});
});
