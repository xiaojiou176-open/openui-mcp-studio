import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

type ExecMockSpec =
	| {
			stdout?: string;
			stderr?: string;
	  }
	| {
			error: {
				message?: string;
				code?: number | string;
				stdout?: string;
				stderr?: string;
				nonObject?: boolean;
			};
	  };

function createExecFileMock(outputs: Record<string, ExecMockSpec>) {
	const impl = (
		command: string,
		args: string[],
		_options: { cwd?: string; encoding?: string; maxBuffer?: number },
		callback: (error: unknown, stdout?: string, stderr?: string) => void,
	) => {
		const key = `${command} ${args.join(" ")}`;
		const match = outputs[key];
		if (!match) {
			callback(
				Object.assign(new Error(`missing stub for ${key}`), {
					code: 1,
					stdderr: "",
					stdout: "",
				}),
			);
			return;
		}

		if ("error" in match) {
			if (match.error.nonObject) {
				callback(match.error.message ?? "boom");
				return;
			}
			callback(
				Object.assign(new Error(match.error.message ?? "failed"), {
					code: match.error.code,
					stdout: match.error.stdout ?? "",
					stderr: match.error.stderr ?? "",
				}),
			);
			return;
		}

		callback(null, match.stdout ?? "", match.stderr ?? "");
	};
	const fn = vi.fn(impl);
	Object.defineProperty(fn, promisify.custom, {
		value: (command: string, args: string[], options?: { cwd?: string }) =>
			new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
				impl(
					command,
					args,
					options ?? {},
					(error, stdout = "", stderr = "") => {
						if (error) {
							reject(error);
							return;
						}
						resolve({
							stdout,
							stderr,
						});
					},
				);
			}),
	});
	return fn;
}

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("repo workflow summary default runner", () => {
	it("normalizes missing stdout and stderr fields from successful child-process results", async () => {
		const execFileMock = vi.fn(
			(
				_command: string,
				_args: string[],
				_options: { cwd?: string; encoding?: string; maxBuffer?: number },
				callback: (error: unknown, stdout?: string, stderr?: string) => void,
			) => {
				callback(null, undefined, undefined);
			},
		);
		Object.defineProperty(execFileMock, promisify.custom, {
			value: (command: string, args: string[], options?: { cwd?: string }) =>
				new Promise<{ stdout?: string; stderr?: string }>((resolve) => {
					execFileMock(
						command,
						args,
						options ?? {},
						(_error, stdout, stderr) => {
							resolve({ stdout, stderr });
						},
					);
				}),
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.repository.originUrl).toBeNull();
		expect(summary.local.branch).toBeNull();
		expect(summary.local.changedFilesSummary).toEqual({
			modified: 0,
			added: 0,
			deleted: 0,
			renamed: 0,
			untracked: 0,
			other: 0,
		});
	});

	it("falls back to stringified error objects when execFile rejects without a message", async () => {
		const execFileMock = vi.fn(
			(
				command: string,
				args: string[],
				_options: { cwd?: string; encoding?: string; maxBuffer?: number },
				callback: (error: unknown, stdout?: string, stderr?: string) => void,
			) => {
				const key = `${command} ${args.join(" ")}`;
				if (key === "git remote get-url origin") {
					callback({ code: "EACCES" });
					return;
				}
				callback(null, "", "");
			},
		);
		Object.defineProperty(execFileMock, promisify.custom, {
			value: (command: string, args: string[], options?: { cwd?: string }) =>
				new Promise<{ stdout?: string; stderr?: string }>((resolve, reject) => {
					execFileMock(
						command,
						args,
						options ?? {},
						(error, stdout, stderr) => {
							if (error) {
								reject(error);
								return;
							}
							resolve({ stdout, stderr });
						},
					);
				}),
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.repository.originUrl).toBeNull();
		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toContain(
			"Origin remote does not resolve to a GitHub owner/repo pair.",
		);
	});

	it("uses the default execFile-backed runner for a fully connected SSH remote", async () => {
		const execFileMock = createExecFileMock({
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
						homepageUrl: "https://example.com",
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
						contexts: ["Quality (Node 22.22.0)"],
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
					stdout: JSON.stringify([]),
				},
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.github.status).toBe("connected");
		expect(summary.local.changedFilesSummary.untracked).toBe(0);
		expect(summary.github.requiredChecks).toEqual(["Quality (Node 22.22.0)"]);
		expect(summary.nextRecommendedStep).toContain(
			"Use this summary as the pre-PR checklist",
		);
	});

	it("handles numeric child-process failures through the default runner", async () => {
		const execFileMock = createExecFileMock({
			"git remote get-url origin": {
				error: {
					message: "git missing",
					code: 127,
					stderr: "git: command not found",
				},
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "main\n",
			},
			"git status --short": {
				stdout: "",
			},
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toContain(
			"Origin remote does not resolve to a GitHub owner/repo pair.",
		);
	});

	it("handles non-object child-process errors through the default runner", async () => {
		const execFileMock = createExecFileMock({
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
					error: {
						message: "boom",
						nonObject: true,
					},
				},
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain("boom");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable: boom"),
			]),
		);
	});

	it("treats non-numeric execFile error codes as blocked without leaking fake numeric exit codes", async () => {
		const execFileMock = createExecFileMock({
			"git remote get-url origin": {
				error: {
					message: "ssh transport denied",
					code: "EACCES",
					stdout: "permission denied",
					stderr: "ssh key rejected",
				},
			},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "main\n",
			},
			"git status --short": {
				stdout: "",
			},
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.repository.originUrl).toBeNull();
		expect(summary.local.branch).toBe("main");
		expect(summary.local.changedFileCount).toBe(0);
		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain(
			"Could not derive GitHub repository coordinates from origin.",
		);
		expect(summary.externalBlockers).toContain(
			"Origin remote does not resolve to a GitHub owner/repo pair.",
		);
	});

	it("normalizes successful child-process calls with missing stdout/stderr to empty strings", async () => {
		const execFileMock = createExecFileMock({
			"git remote get-url origin": {},
			"git rev-parse --abbrev-ref HEAD": {
				stdout: "main\n",
			},
			"git status --short": {},
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.repository.originUrl).toBeNull();
		expect(summary.github.status).toBe("blocked");
		expect(summary.github.blockedReason).toContain(
			"Could not derive GitHub repository coordinates from origin.",
		);
		expect(summary.local.branch).toBe("main");
		expect(summary.local.changedFileCount).toBe(0);
	});

	it("reports invalid GitHub JSON payloads as blocked remote reads", async () => {
		const execFileMock = createExecFileMock({
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
					stdout: "{",
				},
		});

		vi.doMock("node:child_process", () => ({
			execFile: execFileMock,
		}));

		const { buildRepoWorkflowSummary } = await import(
			"../services/mcp-server/src/repo-workflow-summary.js"
		);
		const summary = await buildRepoWorkflowSummary({
			workspaceRoot: "/repo",
		});

		expect(summary.github.status).toBe("blocked");
		expect(summary.github.connected).toBe(false);
		expect(summary.github.blockedReason).toMatch(/JSON/);
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining("GitHub view unavailable"),
			]),
		);
	});
});
