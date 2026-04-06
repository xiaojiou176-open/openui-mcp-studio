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
					stdout: match.error.stdout,
					stderr: match.error.stderr,
				}),
			);
			return;
		}

		callback(null, match.stdout, match.stderr);
	};

	const fn = vi.fn(impl);
	Object.defineProperty(fn, promisify.custom, {
		value: (command: string, args: string[], options?: { cwd?: string }) =>
			new Promise<{ stdout?: string; stderr?: string }>((resolve, reject) => {
				impl(command, args, options ?? {}, (error, stdout, stderr) => {
					if (error) {
						reject(error);
						return;
					}
					resolve({ stdout, stderr });
				});
			}),
	});
	return fn;
}

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("repo workflow summary extra branches", () => {
	it("falls back to empty strings when execFile omits stdout/stderr payloads", async () => {
		const execFileMock = createExecFileMock({
			"git remote get-url origin": {
				error: {
					code: "EACCES",
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
		expect(summary.github.status).toBe("blocked");
		expect(summary.externalBlockers).toContain(
			"Origin remote does not resolve to a GitHub owner/repo pair.",
		);
	});

	it("surfaces non-Error JSON parse failures as GitHub blockers", async () => {
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
					stdout: "{not-json",
				},
		});

		const originalParse = JSON.parse;
		vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
			if (text === "{not-json") {
				throw "non-error-json-parse";
			}
			return originalParse(text, reviver);
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
		expect(summary.github.blockedReason).toContain("non-error-json-parse");
		expect(summary.externalBlockers).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					"GitHub view unavailable: non-error-json-parse",
				),
			]),
		);
	});
});
