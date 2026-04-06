import { describe, expect, it } from "vitest";
import {
	buildWorkflowReadyPayload,
	runRepoWorkflowReadyCli,
	WORKFLOW_SLICE_ID,
} from "../tooling/cli/repo-workflow-ready.mjs";

function createBufferWriter() {
	let value = "";
	return {
		stream: {
			write(chunk) {
				value += String(chunk);
				return true;
			},
		},
		read() {
			return value;
		},
	};
}

function createSummary() {
	return {
		version: 1 as const,
		generatedAt: "2026-03-31T22:10:00.000Z",
		workspaceRoot: "/repo",
		repository: {
			originUrl: "https://github.com/xiaojiou176/openui-mcp-studio.git",
			owner: "xiaojiou176",
			name: "openui-mcp-studio",
			defaultBranch: "main",
			visibility: "PUBLIC",
			homepageUrl:
				"https://github.com/xiaojiou176/openui-mcp-studio/blob/main/docs/first-minute-walkthrough.md",
		},
		local: {
			branch: "codex/prompt-5-closeout",
			dirty: true,
			changedFileCount: 3,
			changedFiles: ["README.md", ".github/workflows/ci.yml"],
		},
		github: {
			connected: true,
			blockedReason: null,
			openPullRequestCount: 1,
			openIssueCount: 0,
			openCodeScanningAlertCount: 2,
			openSecretScanningAlertCount: 0,
			openDependabotAlertCount: 0,
			requiredChecks: [
				"secret_scan",
				"Workflow Lint",
				"Quality (Node 22.22.0)",
			],
			requiredApprovingReviewCount: 1,
			requireCodeOwnerReviews: true,
			requireConversationResolution: true,
			recentFailedRuns: [
				{
					databaseId: 23780767949,
					workflowName: "CI",
					displayTitle: "CI",
					conclusion: "failure",
					event: "schedule",
					url: "https://github.com/example/actions/runs/1",
					createdAt: "2026-03-31T21:00:00.000Z",
				},
			],
		},
		externalBlockers: [
			"GitHub homepage still points to a blob URL instead of the product front door.",
		],
		nextRecommendedStep:
			"Address open code-scanning alerts first, then re-run workflow readiness before claiming closeout.",
	};
}

describe("repo workflow ready", () => {
	it("builds a non-mutating PR-ready packet from repo workflow summary state", () => {
		const payload = buildWorkflowReadyPayload({
			summary: createSummary(),
		});

		expect(payload.slice.id).toBe(WORKFLOW_SLICE_ID);
		expect(payload.repository.homepageLooksLikeBlob).toBe(true);
		expect(payload.githubConnected.requiredChecks).toEqual([
			"secret_scan",
			"Workflow Lint",
			"Quality (Node 22.22.0)",
		]);
		expect(payload.githubConnected.openCodeScanningAlertCount).toBe(2);
		expect(payload.githubConnected.latestFailingRun).toMatchObject({
			id: 23780767949,
			workflowName: "CI",
		});
		expect(payload.remoteMutation.performed).toBe(false);
		expect(payload.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					source: "github-homepage",
					reason: expect.stringContaining("blob URL"),
				}),
				expect.objectContaining({
					source: "code-scanning",
					reason: expect.stringContaining("open CodeQL alert"),
				}),
				expect.objectContaining({
					source: "github-actions",
					reason: expect.stringContaining(
						"Latest failing workflow run is still visible",
					),
				}),
			]),
		);
	});

	it("emits JSON from the CLI runner without requiring artifact writes", async () => {
		const writer = createBufferWriter();
		const exitCode = await runRepoWorkflowReadyCli({
			writeArtifacts: false,
			stdout: writer.stream,
			summaryBuilder: async () => ({
				...createSummary(),
				local: {
					branch: "main",
					dirty: false,
					changedFileCount: 0,
					changedFiles: [],
				},
				github: {
					...createSummary().github,
					openPullRequestCount: 0,
					openCodeScanningAlertCount: 0,
					recentFailedRuns: [],
				},
				externalBlockers: [],
				nextRecommendedStep:
					"Use this summary as the pre-PR checklist: verify required checks, confirm no open security alerts, and only then move into branch/PR mutation.",
			}),
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(writer.read())).toMatchObject({
			slice: {
				id: WORKFLOW_SLICE_ID,
			},
			repository: {
				defaultBranch: "main",
			},
			githubConnected: {
				openPrCount: 0,
				openCodeScanningAlertCount: 0,
			},
		});
	});

	it("keeps recommended actions honest when repo-local is clean but GitHub remains blocked", () => {
		const payload = buildWorkflowReadyPayload({
			summary: {
				...createSummary(),
				local: {
					branch: "codex/browser-cdp-lane-isolation",
					dirty: false,
					changedFileCount: 0,
					changedFiles: [],
				},
				github: {
					...createSummary().github,
					connected: false,
					blockedReason: "gh auth token missing",
				},
				externalBlockers: ["GitHub view unavailable: gh auth token missing"],
				nextRecommendedStep:
					"Resolve GitHub CLI/auth connectivity so the repo can surface PR and workflow readiness before any remote mutation.",
			},
		});

		expect(payload.recommendedNextActions).toContain(
			"Re-run this packet once GitHub connectivity is restored so live PR, checks, and alert truth can refresh.",
		);
		expect(payload.recommendedNextActions).not.toContain(
			"Re-run this packet and local gates after repo-local blockers are addressed.",
		);
	});
});
