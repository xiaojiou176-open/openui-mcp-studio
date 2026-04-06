import { describe, expect, it } from "vitest";

function createRunner(
	outputs: Record<
		string,
		{ stdout?: string; exitCode?: number; error?: string; stderr?: string }
	>,
) {
	return async (command: string, args: string[]) => {
		const key = `${command} ${args.join(" ")}`;
		const match = outputs[key];
		if (!match) {
			return {
				exitCode: 1,
				stdout: "",
				stderr: "",
				error: `missing stub for ${key}`,
			};
		}
		return {
			exitCode: match.exitCode ?? 0,
			stdout: match.stdout ?? "",
			stderr: match.stderr ?? "",
			error: match.error ?? null,
		};
	};
}

describe("repo workflow summary extra branches", () => {
	it("keeps connected summaries stable when GitHub payloads are sparse or non-array", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const changedFiles = Array.from({ length: 22 }, (_, index) => {
			if (index === 0) {
				return "?? docs/new-00.md";
			}
			if (index === 1) {
				return "A  docs/new-01.md";
			}
			if (index === 2) {
				return "D  docs/old-02.md";
			}
			if (index === 3) {
				return "R  docs/old-03.md -> docs/new-03.md";
			}
			if (index === 4) {
				return "UU conflict-04.ts";
			}
			return ` M docs/file-${String(index).padStart(2, "0")}.md`;
		}).join("\n");
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				exitCode: 1,
				error: "branch lookup failed",
			},
			"git status --short": {
				stdout: `${changedFiles}\n`,
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: " ",
						homepageUrl: " ",
						defaultBranchRef: {},
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify({ unexpected: true }),
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify({ unexpected: true }),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				stdout: JSON.stringify({ state: "open" }),
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify({ state: "open" }),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify({ state: "open" }),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({}),
			},
			"gh run list --repo example/demo --limit 5 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify({ not: "an-array" }),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			failedRunsLimit: 5,
			runner,
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBeNull();
		expect(summary.repository.homepageUrl).toBeNull();
		expect(summary.local.branch).toBeNull();
		expect(summary.local.changedFileCount).toBe(22);
		expect(summary.local.changedFiles).toHaveLength(20);
		expect(summary.local.changedFilesSummary).toEqual({
			modified: 17,
			added: 1,
			deleted: 1,
			renamed: 1,
			untracked: 1,
			other: 1,
		});
		expect(summary.github.openPullRequestCount).toBeNull();
		expect(summary.github.openIssueCount).toBeNull();
		expect(summary.github.openCodeScanningAlertCount).toBeNull();
		expect(summary.github.openSecretScanningAlertCount).toBeNull();
		expect(summary.github.openDependabotAlertCount).toBeNull();
		expect(summary.github.requiredChecks).toEqual([]);
		expect(summary.github.requiredApprovingReviewCount).toBe(0);
		expect(summary.github.requireCodeOwnerReviews).toBe(false);
		expect(summary.github.requireConversationResolution).toBe(false);
		expect(summary.github.recentFailedRuns).toEqual([]);
		expect(summary.externalBlockers).toEqual([]);
		expect(summary.nextRecommendedStep).toContain(
			"Stabilize the current worktree",
		);
	});

	it("falls back to a blocked local-only recommendation when origin lookup and git status both fail", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				exitCode: 1,
				error: "origin missing",
			},
			"git rev-parse --abbrev-ref HEAD": {
				exitCode: 1,
				error: "head missing",
			},
			"git status --short": {
				exitCode: 1,
				error: "status unavailable",
			},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.connected).toBe(false);
		expect(summary.github.blockedReason).toContain(
			"Could not derive GitHub repository coordinates from origin.",
		);
		expect(summary.local.branch).toBeNull();
		expect(summary.local.dirty).toBe(false);
		expect(summary.local.changedFileCount).toBe(0);
		expect(summary.local.changedFilesSummary).toEqual({
			modified: 0,
			added: 0,
			deleted: 0,
			renamed: 0,
			untracked: 0,
			other: 0,
		});
		expect(summary.externalBlockers).toContain(
			"Origin remote does not resolve to a GitHub owner/repo pair.",
		);
		expect(summary.nextRecommendedStep).toContain(
			"Resolve GitHub CLI/auth connectivity",
		);
	});

	it("keeps a connected summary but records homepage blob drift as an external blocker", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "main\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: "PUBLIC",
						homepageUrl:
							"https://github.com/example/demo/blob/main/docs/first-minute-walkthrough.md",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify([]),
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify([]),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({
					required_status_checks: {
						contexts: [],
					},
					required_pull_request_reviews: {
						required_approving_review_count: 0,
						require_code_owner_reviews: false,
					},
					required_conversation_resolution: {
						enabled: false,
					},
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([]),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("homepage still points at a raw blob URL"),
			]),
		);
		expect(summary.nextRecommendedStep).toContain(
			"Record the external blockers in the runbook",
		);
	});
});
