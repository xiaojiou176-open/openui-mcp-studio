import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRepoWorkflowSummaryTool } from "../services/mcp-server/src/tools/repo-workflow-summary.js";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();

	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const text = result.content.find((item) => item.type === "text")?.text;
	if (!text) {
		throw new Error("Missing text payload");
	}
	return text;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("repo workflow summary tool", () => {
	it("returns the summary from the builder", async () => {
		const buildRepoWorkflowSummary = vi.fn(async () => ({
			version: 1,
			workspaceRoot: "/repo",
			local: {
				branch: "main",
				dirty: true,
				changedFileCount: 2,
				changedFiles: ["README.md"],
				changedFilesSummary: {
					modified: 1,
					added: 0,
					deleted: 0,
					renamed: 0,
					untracked: 1,
					other: 0,
				},
			},
			repository: {
				originUrl: "https://github.com/example/demo.git",
				owner: "example",
				name: "demo",
				defaultBranch: "main",
				visibility: "PUBLIC",
				homepageUrl: "https://example.com",
			},
			github: {
				status: "connected",
				connected: true,
				blockedReason: null,
				openPullRequestCount: 1,
				openIssueCount: 0,
				openCodeScanningAlertCount: 2,
				openSecretScanningAlertCount: 0,
				openDependabotAlertCount: 0,
				requiredChecks: ["Quality"],
				requiredApprovingReviewCount: 1,
				requireCodeOwnerReviews: true,
				requireConversationResolution: true,
				recentFailedRuns: [],
			},
			externalBlockers: [],
			nextRecommendedStep: "Open a PR after local verification.",
			generatedAt: "2026-03-31T00:00:00.000Z",
		}));
		const harness = createToolHarness();
		registerRepoWorkflowSummaryTool(harness.server, {
			buildRepoWorkflowSummary,
			getWorkspaceRoot: () => "/default-workspace",
		});

		const result = await harness.getHandler("openui_repo_workflow_summary")({
			workspaceRoot: "/repo",
			failedRunsLimit: 5,
		});

		expect(buildRepoWorkflowSummary).toHaveBeenCalledWith({
			workspaceRoot: "/repo",
			failedRunsLimit: 5,
		});
		expect(JSON.parse(readText(result))).toMatchObject({
			version: 1,
			github: {
				status: "connected",
				connected: true,
				openPullRequestCount: 1,
			},
		});
	});

	it("returns blocked JSON text when the builder reports GitHub connectivity issues", async () => {
		const buildRepoWorkflowSummary = vi.fn(async () => ({
			version: 1,
			workspaceRoot: "/repo",
			local: {
				branch: "feature/test",
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
			},
			repository: {
				originUrl: "https://github.com/example/demo.git",
				owner: "example",
				name: "demo",
				defaultBranch: null,
				visibility: null,
				homepageUrl: null,
			},
			github: {
				status: "blocked",
				connected: false,
				blockedReason: "gh auth token missing",
				openPullRequestCount: null,
				openIssueCount: null,
				openCodeScanningAlertCount: null,
				openSecretScanningAlertCount: null,
				openDependabotAlertCount: null,
				requiredChecks: [],
				requiredApprovingReviewCount: null,
				requireCodeOwnerReviews: null,
				requireConversationResolution: null,
				recentFailedRuns: [],
			},
			externalBlockers: ["GitHub view unavailable: gh auth token missing"],
			nextRecommendedStep:
				"Resolve GitHub CLI/auth connectivity so the repo can surface PR and workflow readiness before any remote mutation.",
			generatedAt: "2026-03-31T00:00:00.000Z",
		}));
		const harness = createToolHarness();
		registerRepoWorkflowSummaryTool(harness.server, {
			buildRepoWorkflowSummary,
			getWorkspaceRoot: () => "/default-workspace",
		});

		const result = await harness.getHandler("openui_repo_workflow_summary")({});

		expect(JSON.parse(readText(result))).toMatchObject({
			github: {
				status: "blocked",
				connected: false,
				blockedReason: "gh auth token missing",
			},
			externalBlockers: ["GitHub view unavailable: gh auth token missing"],
		});
	});
});
