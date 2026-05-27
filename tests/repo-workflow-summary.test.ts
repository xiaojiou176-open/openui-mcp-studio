import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

function createRunner(
	outputs: Record<
		string,
		{ stdout?: string; stderr?: string; exitCode?: number; error?: string }
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

describe("repo workflow summary", () => {
	it("builds a connected summary when git and gh are available", async () => {
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
				stdout: " M README.md\n?? docs/new.md\n",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: "PUBLIC",
						homepageUrl: "https://example.com",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify([{ number: 1 }]),
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify([]),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				stdout: JSON.stringify([{ state: "open" }, { state: "closed" }]),
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify([{ state: "fixed" }, { state: "open" }]),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({
					required_status_checks: {
						contexts: ["Workflow Lint", "Quality (Node 22.22.0)"],
					},
					required_pull_request_reviews: {
						required_approving_review_count: 1,
						require_code_owner_reviews: true,
					},
					required_conversation_resolution: {
						enabled: true,
					},
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([
						{
							databaseId: 1,
							workflowName: "CI",
							displayTitle: "CI",
							conclusion: "failure",
							event: "schedule",
							url: "https://github.com/example/demo/actions/runs/1",
							createdAt: "2026-03-31T00:00:00.000Z",
						},
					]),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.local.branch).toBe("main");
		expect(summary.local.changedFileCount).toBe(2);
		expect(summary.local.changedFilesSummary).toEqual({
			modified: 1,
			added: 0,
			deleted: 0,
			renamed: 0,
			untracked: 1,
			other: 0,
		});
		expect(summary.github.connected).toBe(true);
		expect(summary.github.openPullRequestCount).toBe(1);
		expect(summary.github.openIssueCount).toBe(0);
		expect(summary.github.openCodeScanningAlertCount).toBe(1);
		expect(summary.github.openDependabotAlertCount).toBe(1);
		expect(summary.github.requiredChecks).toEqual([
			"Workflow Lint",
			"Quality (Node 22.22.0)",
		]);
		expect(summary.github.recentFailedRuns).toHaveLength(1);
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("code-scanning alert"),
				expect.stringContaining("recent failing GitHub workflow"),
			]),
		);
	});

	it("prefers the branch-specific remediation step when code-scanning alerts exist on a feature branch", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "feature/browser-lane\n",
			},
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: "PUBLIC",
						homepageUrl: "https://example.com",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify([{ number: 44 }]),
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify([]),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				stdout: JSON.stringify([{ state: "open" }]),
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({
					required_status_checks: { contexts: ["Workflow Lint"] },
					required_pull_request_reviews: {
						required_approving_review_count: 1,
						require_code_owner_reviews: true,
					},
					required_conversation_resolution: { enabled: true },
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([]),
				},
			"gh run list --repo example/demo --branch feature/browser-lane --limit 10 --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status":
				{
					stdout: JSON.stringify([]),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.nextRecommendedStep).toContain(
			"merge or separately remediate the remaining default-branch code-scanning alerts",
		);
	});

	it("reports an external blocker when GitHub connectivity is unavailable", async () => {
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
					exitCode: 1,
					error: "gh auth token missing",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.connected).toBe(false);
		expect(summary.github.blockedReason).toContain("gh auth token missing");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable"),
			]),
		);
		expect(summary.nextRecommendedStep).toContain("GitHub CLI/auth");
	});

	it("uses local contract fallbacks for branch, visibility, and homepage when GitHub view is unavailable", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-summary-"),
		);
		await fs.mkdir(path.join(rootDir, "tooling", "contracts"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			JSON.stringify({
				version: 1,
				repository: {
					owner: "example",
					name: "demo",
					visibility: "public",
				},
			}),
		);
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"public-surface.contract.json",
			),
			JSON.stringify({
				version: 1,
				about: {
					homepageUrl: "",
				},
			}),
		);
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: rootDir,
			runner,
		});

		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBe("public");
		expect(summary.repository.homepageUrl).toBeNull();
		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable"),
			]),
		);
	});

	it("ignores malformed fallback visibility contracts when GitHub view is unavailable", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-summary-bad-visibility-"),
		);
		await fs.mkdir(path.join(rootDir, "tooling", "contracts"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			"{not-json",
		);
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"public-surface.contract.json",
			),
			JSON.stringify({
				version: 1,
				about: {
					homepageUrl: "https://example.com/product",
				},
			}),
		);
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: rootDir,
			runner,
		});

		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBeNull();
		expect(summary.repository.homepageUrl).toBe("https://example.com/product");
	});

	it("drops blank fallback visibility strings when GitHub view is unavailable", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-summary-blank-visibility-"),
		);
		await fs.mkdir(path.join(rootDir, "tooling", "contracts"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			JSON.stringify({
				version: 1,
				repository: {
					owner: "example",
					name: "demo",
					visibility: "   ",
				},
			}),
		);
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"public-surface.contract.json",
			),
			JSON.stringify({
				version: 1,
				about: {
					homepageUrl: "https://example.com/product",
				},
			}),
		);
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: rootDir,
			runner,
		});

		expect(summary.repository.visibility).toBeNull();
		expect(summary.repository.homepageUrl).toBe("https://example.com/product");
	});

	it("ignores malformed fallback homepage contracts when GitHub view is unavailable", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-summary-bad-homepage-"),
		);
		await fs.mkdir(path.join(rootDir, "tooling", "contracts"), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"remote-governance-evidence.contract.json",
			),
			JSON.stringify({
				version: 1,
				repository: {
					owner: "example",
					name: "demo",
					visibility: "public",
				},
			}),
		);
		await fs.writeFile(
			path.join(
				rootDir,
				"tooling",
				"contracts",
				"public-surface.contract.json",
			),
			"{not-json",
		);
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: rootDir,
			runner,
		});

		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBe("public");
		expect(summary.repository.homepageUrl).toBeNull();
	});

	it("keeps public GitHub metadata readable when gh repo view fails but public REST fallback succeeds", async () => {
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				exitCode: 1,
				error: "pr list unavailable",
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					exitCode: 1,
					error: "issue list unavailable",
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				exitCode: 1,
				error: "code alerts unavailable",
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				exitCode: 1,
				error: "secret alerts unavailable",
			},
			"gh api repos/example/demo/dependabot/alerts": {
				exitCode: 1,
				error: "dependabot alerts unavailable",
			},
			"gh api repos/example/demo/branches/main/protection": {
				exitCode: 1,
				error: "protection unavailable",
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					exitCode: 1,
					error: "failed runs unavailable",
				},
			"gh run list --repo example/demo --branch main --limit 10 --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status":
				{
					exitCode: 1,
					error: "branch runs unavailable",
				},
		});
		const httpFetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/repos/example/demo")) {
				return new Response(
					JSON.stringify({
						private: false,
						homepage: "https://example.com",
						default_branch: "main",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.includes("/repos/example/demo/pulls?")) {
				return new Response(JSON.stringify([{ number: 7 }]), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			if (url.includes("/repos/example/demo/issues?")) {
				return new Response(
					JSON.stringify([{ number: 9 }, { number: 10, pull_request: {} }]),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}
			if (url.includes("/actions/runs?status=failure")) {
				return new Response(
					JSON.stringify({
						workflow_runs: [
							{
								id: 41,
								name: "CI",
								display_title: "CI failed",
								conclusion: "failure",
								event: "push",
								html_url: "https://github.com/example/demo/actions/runs/41",
								created_at: "2026-04-05T10:00:00Z",
								head_sha: "abc123",
								status: "completed",
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.includes("/actions/runs?branch=main")) {
				return new Response(
					JSON.stringify({
						workflow_runs: [
							{
								id: 42,
								name: "CI",
								display_title: "CI success",
								conclusion: "success",
								event: "push",
								html_url: "https://github.com/example/demo/actions/runs/42",
								created_at: "2026-04-05T11:00:00Z",
								head_sha: "abc123",
								status: "completed",
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("not found", { status: 404 });
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
			httpFetcher,
		});

		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBe("PUBLIC");
		expect(summary.repository.homepageUrl).toBe("https://example.com");
		expect(summary.github.openPullRequestCount).toBe(1);
		expect(summary.github.openIssueCount).toBe(1);
		expect(summary.github.recentFailedRuns).toHaveLength(1);
		expect(summary.github.recentFailedRuns[0]?.databaseId).toBe(41);
		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain("protection unavailable");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub read failed: protection unavailable"),
				expect.stringContaining("GitHub read failed: code alerts unavailable"),
			]),
		);
	});

	it("maps private repo metadata from the public REST fallback when gh repo view fails", async () => {
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
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
					required_status_checks: { contexts: [] },
					required_pull_request_reviews: {
						required_approving_review_count: 0,
						require_code_owner_reviews: false,
					},
					required_conversation_resolution: { enabled: false },
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([]),
				},
			"gh run list --repo example/demo --branch main --limit 10 --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status":
				{
					stdout: JSON.stringify([]),
				},
		});
		const httpFetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/repos/example/demo")) {
				return new Response(
					JSON.stringify({
						private: true,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return new Response("not found", { status: 404 });
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
			httpFetcher,
		});

		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBe("PRIVATE");
		expect(summary.repository.homepageUrl).toBeNull();
	});

	it("surfaces non-Error REST fallback failures honestly when GitHub view lookup throws", async () => {
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
		});
		const httpFetcher = vi.fn(async () => {
			throw "rest-unavailable";
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
			httpFetcher,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable"),
			]),
		);
		expect(summary.github.blockedReason).toContain("gh auth token missing");
	});

	it("surfaces Error-based REST fallback failures honestly when GitHub view lookup throws", async () => {
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
			"git rev-parse HEAD": {
				stdout: "abc123\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					error: "gh auth token missing",
				},
		});
		const httpFetcher = vi.fn(async () => {
			throw new Error("rest-error-object");
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
			httpFetcher,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable"),
			]),
		);
		expect(summary.github.blockedReason).toContain("gh auth token missing");
	});

	it("reports an origin blocker when the remote is not a GitHub repository and classifies local status codes", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "git@example.com:internal/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "feature/local-only\n",
			},
			"git status --short": {
				stdout:
					" M README.md\nA  docs/new.md\nD  docs/old.md\nR  old.ts -> new.ts\nUU conflict.ts\n",
			},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain(
			"Could not derive GitHub repository coordinates from origin.",
		);
		expect(summary.local.changedFilesSummary).toEqual({
			modified: 1,
			added: 1,
			deleted: 1,
			renamed: 1,
			untracked: 0,
			other: 1,
		});
		expect(summary.externalBlockers).toContain(
			"Origin remote does not resolve to a GitHub owner/repo pair.",
		);
		expect(summary.nextRecommendedStep).toContain(
			"Stabilize the current worktree",
		);
	});

	it("reports remote read failures when repo view succeeds but downstream GitHub reads fail", async () => {
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
						homepageUrl: "https://example.com",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				exitCode: 1,
				error: "pr list unavailable",
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify([]),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				exitCode: 1,
				error: "code alerts unavailable",
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({}),
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

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain("pr list unavailable");
		expect(summary.github.blockedReason).toContain("code alerts unavailable");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub read failed: pr list unavailable"),
				expect.stringContaining("GitHub read failed: code alerts unavailable"),
			]),
		);
	});

	it("collects homepage, secret scanning, and failed-run lookup warnings without blocking connectivity", async () => {
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
							"https://github.com/example/demo/blob/main/docs/start.md",
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
				stdout: JSON.stringify([{ state: "open" }]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({
					required_status_checks: {},
					required_pull_request_reviews: {},
					required_conversation_resolution: {},
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					exitCode: 1,
					error: "failed run lookup unavailable",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.github.requiredChecks).toEqual([]);
		expect(summary.github.requiredApprovingReviewCount).toBe(0);
		expect(summary.github.requireCodeOwnerReviews).toBe(false);
		expect(summary.github.requireConversationResolution).toBe(false);
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("homepage still points at a raw blob URL"),
				expect.stringContaining(
					"open secret-scanning alert(s) still require maintainer action",
				),
				expect.stringContaining(
					"Recent failed workflow run lookup was unavailable",
				),
			]),
		);
		expect(summary.nextRecommendedStep).toContain(
			"Record the external blockers in the runbook",
		);
	});

	it("only flags homepage blob blockers for real github.com hosts", async () => {
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
							"https://evil.example/github.com/example/demo/blob/main/docs/start.md",
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
					required_status_checks: {},
					required_pull_request_reviews: {},
					required_conversation_resolution: {},
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

		expect(summary.externalBlockers).not.toEqual(
			expect.arrayContaining([
				expect.stringContaining("homepage still points at a raw blob URL"),
			]),
		);
	});

	it("does not treat malformed homepage URLs as GitHub blob blockers", async () => {
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
						homepageUrl: "notaurl",
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
				stdout: JSON.stringify({}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([]),
				},
			"gh run list --repo example/demo --branch main --limit 10 --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status":
				{
					stdout: JSON.stringify([]),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.repository.homepageUrl).toBe("notaurl");
		expect(summary.externalBlockers).not.toEqual(
			expect.arrayContaining([
				expect.stringContaining("homepage still points at a raw blob URL"),
			]),
		);
	});

	it("normalizes empty repo metadata and non-array GitHub payloads without inventing blockers", async () => {
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
						visibility: "",
						homepageUrl: "",
						defaultBranchRef: {},
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify({ total: 1 }),
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify({ total: 0 }),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				stdout: JSON.stringify({ total: 0 }),
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify({ total: 0 }),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify({ total: 0 }),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({
					required_status_checks: {},
					required_pull_request_reviews: {},
					required_conversation_resolution: {},
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify({ total: 0 }),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBeNull();
		expect(summary.repository.homepageUrl).toBeNull();
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
			"Use this summary as the pre-PR checklist",
		);
	});

	it("uses stderr, stdout, and generic fallbacks when GitHub reads fail without explicit error messages", async () => {
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
						homepageUrl: "https://example.com/product",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				exitCode: 1,
				stderr: "pr stderr fallback",
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify([]),
				},
			"gh api repos/example/demo/code-scanning/alerts": {
				exitCode: 1,
				stdout: "code alerts stdout fallback",
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				exitCode: 1,
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({}),
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

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain("pr stderr fallback");
		expect(summary.github.blockedReason).toContain(
			"code alerts stdout fallback",
		);
		expect(summary.github.blockedReason).toContain("gh failed");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub read failed: pr stderr fallback"),
				expect.stringContaining(
					"GitHub read failed: code alerts stdout fallback",
				),
				expect.stringContaining("GitHub read failed: gh failed"),
			]),
		);
	});

	it("uses the clean pre-pr recommendation when local and GitHub state are clear", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "git@github.com:example/demo.git\n",
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
						homepageUrl: "https://example.com/product",
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
				stdout: JSON.stringify([{ state: "closed" }]),
			},
			"gh api repos/example/demo/secret-scanning/alerts": {
				stdout: JSON.stringify([]),
			},
			"gh api repos/example/demo/dependabot/alerts": {
				stdout: JSON.stringify([{ state: "dismissed" }]),
			},
			"gh api repos/example/demo/branches/main/protection": {
				stdout: JSON.stringify({
					required_status_checks: {
						contexts: ["Quality (Node 22.22.0)"],
					},
					required_pull_request_reviews: {
						required_approving_review_count: 2,
						require_code_owner_reviews: true,
					},
					required_conversation_resolution: {
						enabled: true,
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
		expect(summary.repository.owner).toBe("example");
		expect(summary.github.openCodeScanningAlertCount).toBe(0);
		expect(summary.github.openDependabotAlertCount).toBe(0);
		expect(summary.externalBlockers).toEqual([]);
		expect(summary.nextRecommendedStep).toContain(
			"Use this summary as the pre-PR checklist",
		);
	});

	it("surfaces malformed GitHub repo view payloads as blockers", async () => {
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
					stdout: "{not-json",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable"),
			]),
		);
	});

	it("prioritizes open code scanning alerts over generic external blocker guidance on a clean worktree", async () => {
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
						homepageUrl: "https://example.com/product",
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
				stdout: JSON.stringify([{ state: "open" }, { state: "open" }]),
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
						contexts: ["Quality (Node 22.22.0)"],
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

		expect(summary.github.openCodeScanningAlertCount).toBe(2);
		expect(summary.nextRecommendedStep).toContain(
			"Address open code-scanning alerts first",
		);
	});

	it("drops historical failed runs after the current branch head already has a successful remote run", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "feature/ready\n",
			},
			"git rev-parse HEAD": {
				stdout: "newsha\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: "PUBLIC",
						homepageUrl: "https://example.com/product",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify([{ number: 42 }]),
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
						contexts: ["Quality (Node 22.22.0)"],
					},
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([
						{
							databaseId: 7,
							workflowName: "CI",
							displayTitle: "CI",
							conclusion: "failure",
							event: "pull_request",
							url: "https://github.com/example/demo/actions/runs/7",
							createdAt: "2026-03-31T10:00:00.000Z",
							headSha: "oldsha",
						},
					]),
				},
			"gh run list --repo example/demo --branch feature/ready --limit 10 --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status":
				{
					stdout: JSON.stringify([
						{
							databaseId: 8,
							workflowName: "CI",
							displayTitle: "CI",
							conclusion: "success",
							event: "pull_request",
							url: "https://github.com/example/demo/actions/runs/8",
							createdAt: "2026-03-31T11:00:00.000Z",
							headSha: "newsha",
							status: "completed",
						},
					]),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.recentFailedRuns).toEqual([]);
		expect(summary.externalBlockers).not.toEqual(
			expect.arrayContaining([
				expect.stringContaining("recent failing GitHub workflow"),
			]),
		);
	});

	it("drops historical failed runs while the current branch head is still actively running remotely", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "feature/ready\n",
			},
			"git rev-parse HEAD": {
				stdout: "newsha\n",
			},
			"git status --short": {
				stdout: "",
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: "PUBLIC",
						homepageUrl: "https://example.com/product",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify([{ number: 42 }]),
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
						contexts: ["Quality (Node 22.22.0)"],
					},
				}),
			},
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify([
						{
							databaseId: 7,
							workflowName: "CI",
							displayTitle: "CI",
							conclusion: "failure",
							event: "pull_request",
							url: "https://github.com/example/demo/actions/runs/7",
							createdAt: "2026-03-31T10:00:00.000Z",
							headSha: "oldsha",
						},
					]),
				},
			"gh run list --repo example/demo --branch feature/ready --limit 10 --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId,headSha,status":
				{
					stdout: JSON.stringify([
						{
							databaseId: 9,
							workflowName: "CI",
							displayTitle: "CI",
							conclusion: "",
							event: "pull_request",
							url: "https://github.com/example/demo/actions/runs/9",
							createdAt: "2026-03-31T11:00:00.000Z",
							headSha: "newsha",
							status: "in_progress",
						},
					]),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.recentFailedRuns).toEqual([]);
		expect(summary.externalBlockers).not.toEqual(
			expect.arrayContaining([
				expect.stringContaining("recent failing GitHub workflow"),
			]),
		);
	});

	it("stays locally readable when git origin, branch, and status commands are unavailable", async () => {
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
				error: "branch unavailable",
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

		expect(summary.repository.originUrl).toBeNull();
		expect(summary.local).toEqual({
			branch: null,
			dirty: false,
			changedFileCount: 0,
			changedFiles: [],
			changedFilesSummary: {
				modified: 0,
				added: 0,
				deleted: 0,
				renamed: 0,
				untracked: 0,
				other: 0,
			},
		});
		expect(summary.github.status).toBe("blocked");
		expect(summary.nextRecommendedStep).toContain("GitHub CLI/auth");
	});

	it("falls back to main/null counters when remote JSON payloads are readable but malformed", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const changedStatusLines = Array.from(
			{ length: 21 },
			(_, index) => `?? generated/file-${index}.tsx`,
		).join("\n");
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "\n",
			},
			"git status --short": {
				stdout: `${changedStatusLines}\n`,
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					stdout: JSON.stringify({
						visibility: "",
						homepageUrl: "",
						defaultBranchRef: { name: "" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				stdout: JSON.stringify({ total: 2 }),
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					stdout: JSON.stringify({ total: 0 }),
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
			"gh run list --repo example/demo --limit 10 --status failure --json workflowName,displayTitle,conclusion,event,url,createdAt,databaseId":
				{
					stdout: JSON.stringify({ latest: "none" }),
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.repository.defaultBranch).toBe("main");
		expect(summary.repository.visibility).toBeNull();
		expect(summary.repository.homepageUrl).toBeNull();
		expect(summary.local.branch).toBeNull();
		expect(summary.local.changedFileCount).toBe(21);
		expect(summary.local.changedFiles).toHaveLength(20);
		expect(summary.local.changedFilesSummary.untracked).toBe(21);
		expect(summary.github.openPullRequestCount).toBeNull();
		expect(summary.github.openIssueCount).toBeNull();
		expect(summary.github.openCodeScanningAlertCount).toBeNull();
		expect(summary.github.openSecretScanningAlertCount).toBeNull();
		expect(summary.github.openDependabotAlertCount).toBeNull();
		expect(summary.github.recentFailedRuns).toEqual([]);
		expect(summary.externalBlockers).toEqual([]);
		expect(summary.nextRecommendedStep).toContain(
			"Stabilize the current worktree",
		);
	});

	it("uses stdout and command fallback strings when GitHub reads fail without structured error fields", async () => {
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
						homepageUrl: "https://example.com/product",
						defaultBranchRef: { name: "main" },
					}),
				},
			"gh pr list --repo example/demo --state open --limit 20 --json number": {
				exitCode: 1,
				stdout: "permission denied",
			},
			"gh issue list --repo example/demo --state open --limit 20 --json number":
				{
					exitCode: 1,
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
				stdout: JSON.stringify({}),
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

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain("permission denied");
		expect(summary.github.blockedReason).toContain("gh failed");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub read failed: permission denied"),
				expect.stringContaining("GitHub read failed: gh failed"),
			]),
		);
	});

	it("uses stderr fallback strings when repo view fails without an explicit error field", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const runner = createRunner({
			"git remote get-url origin": {
				stdout: "https://github.com/example/demo.git\n",
			},
			"git rev-parse --abbrev-ref HEAD": {
				exitCode: 1,
			},
			"git status --short": {
				exitCode: 1,
			},
			"gh repo view example/demo --json name,owner,visibility,homepageUrl,defaultBranchRef":
				{
					exitCode: 1,
					stderr: "repo view stderr",
				},
		});

		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner,
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.local.branch).toBeNull();
		expect(summary.local.changedFiles).toEqual([]);
		expect(summary.github.blockedReason).toContain("repo view stderr");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable: repo view stderr"),
			]),
		);
	});

	it("treats blank origin URLs as missing GitHub coordinates", async () => {
		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
			runner: createRunner({
				"git remote get-url origin": {
					stdout: "\n",
				},
				"git rev-parse --abbrev-ref HEAD": {
					exitCode: 1,
				},
				"git status --short": {
					exitCode: 1,
				},
			}),
		});

		expect(summary.repository.originUrl).toBeNull();
		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain(
			"Could not derive GitHub repository coordinates from origin.",
		);
		expect(summary.nextRecommendedStep).toContain(
			"Resolve GitHub CLI/auth connectivity",
		);
	});
});

afterEach(() => {
	vi.resetModules();
});
