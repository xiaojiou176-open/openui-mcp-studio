import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildDefaultStages,
	createDefaultRunner,
	DEFAULT_STAGES,
	ensureRunManifest,
	runCiGate,
	writeSummaryFile,
} from "../tooling/ci-gate.mjs";
import { runLiveGeminiSmoke } from "../tooling/run-live-tests.mjs";
import { buildRunLayout } from "../tooling/shared/run-layout.mjs";

type RunnerTask = {
	id: string;
};

type RunnerResult = {
	exitCode: number;
	stdout?: string;
	stderr?: string;
};

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};
const ORIGINAL_CHILD_ENV_ALLOWLIST = process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
const ORIGINAL_TEST_ONLY_UNRELATED_SECRET =
	process.env.TEST_ONLY_UNRELATED_SECRET;
const ORIGINAL_TEST_ONLY_VALUE = process.env.TEST_ONLY_VALUE;
const ORIGINAL_PATH = process.env.PATH;

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolver) => {
		resolve = resolver;
	});
	return { promise, resolve };
}

async function waitFor(predicate: () => boolean, maxTurns = 20): Promise<void> {
	const timeoutMs = maxTurns * 100;
	const pollIntervalMs = 10;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() <= deadline) {
		if (predicate()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
	throw new Error(`Condition not met within ${timeoutMs}ms`);
}

async function withTempWorkspace(
	run: (workspaceRoot: string) => Promise<void>,
): Promise<void> {
	const previousCwd = process.cwd();
	const workspaceRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "ci-gate-workspace-"),
	);
	try {
		process.chdir(workspaceRoot);
		await run(workspaceRoot);
	} finally {
		process.chdir(previousCwd);
		await fs.rm(workspaceRoot, { recursive: true, force: true });
	}
}

describe("ci gate orchestration", () => {
	afterEach(() => {
		if (ORIGINAL_CHILD_ENV_ALLOWLIST === undefined) {
			delete process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
		} else {
			process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = ORIGINAL_CHILD_ENV_ALLOWLIST;
		}
		if (ORIGINAL_TEST_ONLY_UNRELATED_SECRET === undefined) {
			delete process.env.TEST_ONLY_UNRELATED_SECRET;
		} else {
			process.env.TEST_ONLY_UNRELATED_SECRET =
				ORIGINAL_TEST_ONLY_UNRELATED_SECRET;
		}
		if (ORIGINAL_TEST_ONLY_VALUE === undefined) {
			delete process.env.TEST_ONLY_VALUE;
		} else {
			process.env.TEST_ONLY_VALUE = ORIGINAL_TEST_ONLY_VALUE;
		}
		if (ORIGINAL_PATH === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = ORIGINAL_PATH;
		}
		vi.restoreAllMocks();
	});

	it("passes allowlisted child env instead of full host env", async () => {
		const originalAllowlist = process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
		const originalSecret = process.env.TEST_ONLY_UNRELATED_SECRET;
		const originalOpenui = process.env.TEST_ONLY_VALUE;
		const originalPath = process.env.PATH;

		process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = "TEST_ONLY_VALUE";
		process.env.TEST_ONLY_UNRELATED_SECRET = "should-not-pass";
		process.env.TEST_ONLY_VALUE = "allowed";
		process.env.PATH = "/usr/bin";

		let capturedEnv: NodeJS.ProcessEnv | undefined;
		let capturedCommand: string | undefined;
		let capturedArgs: string[] | undefined;
		let capturedShell: unknown;
		const runTask = createDefaultRunner(((_command, args, options) => {
			capturedCommand = _command;
			capturedArgs = args;
			capturedEnv = options.env;
			capturedShell = (options as { shell?: unknown }).shell;
			const child = new EventEmitter() as EventEmitter & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			child.stdout = new EventEmitter();
			child.stderr = new EventEmitter();
			queueMicrotask(() => {
				child.emit("close", 0, null);
			});
			return child as never;
		}) as never);

		try {
			const result = await runTask(
				{ id: "lint", command: "npm run lint", hint: "" },
				{ cwd: process.cwd() },
			);
			expect(result.exitCode).toBe(0);
			expect(capturedEnv?.PATH).toBe("/usr/bin");
			expect(capturedEnv?.TEST_ONLY_VALUE).toBe("allowed");
			expect(capturedEnv?.TEST_ONLY_UNRELATED_SECRET).toBeUndefined();
			expect(capturedCommand).toBe("npm");
			expect(capturedArgs).toEqual(["run", "lint"]);
			expect(capturedShell).toBeUndefined();
		} finally {
			if (originalAllowlist === undefined) {
				delete process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST;
			} else {
				process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = originalAllowlist;
			}
			if (originalSecret === undefined) {
				delete process.env.TEST_ONLY_UNRELATED_SECRET;
			} else {
				process.env.TEST_ONLY_UNRELATED_SECRET = originalSecret;
			}
			if (originalOpenui === undefined) {
				delete process.env.TEST_ONLY_VALUE;
			} else {
				process.env.TEST_ONLY_VALUE = originalOpenui;
			}
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
	});

	it("preserves GEMINI_API_KEY for ci-gate child commands that require live model access", async () => {
		const geminiEnvKey = ["GEMINI", "API", "KEY"].join("_");
		const originalGeminiApiKey = process.env[geminiEnvKey];
		process.env[geminiEnvKey] = "gemini-test-key";

		let capturedEnv: NodeJS.ProcessEnv | undefined;
		const runTask = createDefaultRunner(((_command, _args, options) => {
			capturedEnv = options.env;
			const child = new EventEmitter() as EventEmitter & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			child.stdout = new EventEmitter();
			child.stderr = new EventEmitter();
			queueMicrotask(() => {
				child.emit("close", 0, null);
			});
			return child as never;
		}) as never);

		try {
			const result = await runTask(
				{
					id: "uiuxReviewContract",
					command: "npm run -s uiux:audit:strict:gate",
					hint: "",
				},
				{ cwd: process.cwd() },
			);
			expect(result.exitCode).toBe(0);
			expect(capturedEnv?.[geminiEnvKey]).toBe("gemini-test-key");
		} finally {
			if (originalGeminiApiKey === undefined) {
				delete process.env[geminiEnvKey];
			} else {
				process.env[geminiEnvKey] = originalGeminiApiKey;
			}
		}
	});

	it("enforces fast-gates before deep-gates and keeps browser matrix parallel", () => {
		const repoGovernanceStage = DEFAULT_STAGES.find(
			(stage) => stage.id === "repoGovernanceHardGate",
		);
		const stage1 = DEFAULT_STAGES.find((stage) => stage.id === "stage1");
		const stage1b = DEFAULT_STAGES.find((stage) => stage.id === "stage1b");
		const stage2 = DEFAULT_STAGES.find((stage) => stage.id === "stage2");
		const stage3 = DEFAULT_STAGES.find((stage) => stage.id === "stage3");
		const stage4 = DEFAULT_STAGES.find((stage) => stage.id === "stage4");
		expect(repoGovernanceStage?.mode).toBe("parallel");
		expect(repoGovernanceStage?.tasks.map((task) => task.id)).toEqual([
			"governanceRoot",
			"governanceDeps",
			"governanceRuntime",
			"governanceLogSchema",
			"governanceNoWildLog",
			"governanceUpstream",
			"iacConsistency",
		]);
		expect(stage1?.mode).toBe("parallel");
		expect(stage1?.tasks.some((task) => task.id === "iacConsistency")).toBe(
			false,
		);
		expect(stage1?.tasks.some((task) => task.id === "resourceLeakAudit")).toBe(
			true,
		);
		expect(stage1?.tasks.some((task) => task.id === "testFastGate")).toBe(true);
		expect(stage1?.tasks.some((task) => task.id === "uiuxReviewContract")).toBe(
			true,
		);
		expect(
			stage1?.tasks.find((task) => task.id === "uiuxReviewContract")?.command,
		).toContain("uiux:audit:strict:gate");
		expect(
			stage1?.tasks.find((task) => task.id === "uiuxReviewContract")?.advisory,
		).toBe(true);
		expect(stage1b?.mode).toBe("sequential");
		expect(stage1b?.tasks.some((task) => task.id === "test")).toBe(true);
		expect(stage1b?.tasks.some((task) => task.id === "build")).toBe(true);
		expect(stage1b?.tasks.some((task) => task.id === "coreCoverageGate")).toBe(
			true,
		);
		expect(stage1b?.tasks.some((task) => task.id === "mutationFullGate")).toBe(
			false,
		);
		expect(stage2?.mode).toBe("sequential");
		expect(stage2?.tasks.map((task) => task.id)).toEqual([
			"appPrepare",
			"smokeE2E",
			"testE2EResilience",
			"testE2E",
		]);
		expect(stage2?.tasks[0]?.command).toContain("prepare:next-app");
		expect(stage2?.tasks[3]?.command).toContain("playwright test");
		expect(stage2?.tasks[3]?.command).toContain("--project=chromium");
		expect(stage2?.tasks[3]?.command).toContain("--retries=2");
		expect(stage2?.tasks[3]?.command).toContain("--fail-on-flaky-tests");
		expect(stage2?.tasks[1]?.command).toContain("smoke:e2e");
		expect(stage2?.tasks[2]?.command).toContain("test:e2e:resilience");
		expect(stage3?.mode).toBe("parallel");
		expect(stage3?.tasks.map((task) => task.id)).toEqual([
			"testE2EFirefox",
			"testE2EWebkit",
		]);
		expect(stage3?.tasks[0]?.command).toContain("--project=firefox");
		expect(stage3?.tasks[0]?.command).toContain("--fail-on-flaky-tests");
		expect(stage3?.tasks[0]?.command).toMatch(
			/--output=\.runtime-cache\/runs\/ci-gate-[^/]+\/artifacts\/playwright-firefox/,
		);
		expect(stage3?.tasks[1]?.command).toContain("--project=webkit");
		expect(stage3?.tasks[1]?.command).toContain("--fail-on-flaky-tests");
		expect(stage3?.tasks[1]?.command).toMatch(
			/--output=\.runtime-cache\/runs\/ci-gate-[^/]+\/artifacts\/playwright-webkit/,
		);
		expect(stage4?.mode).toBe("sequential");
		expect(stage4?.tasks.map((task) => task.id)).toEqual(["visualQa"]);
		expect(stage4?.tasks[0]?.advisory).toBe(true);
	});

	it("adds external readonly gate only when explicitly requested", () => {
		const explicitStages = buildDefaultStages({
			enforceExternalReadonly: true,
		});
		const defaultStage3 = DEFAULT_STAGES.find((stage) => stage.id === "stage3");
		const explicitStage3 = explicitStages.find(
			(stage) => stage.id === "stage3",
		);
		expect(
			defaultStage3?.tasks.some((task) => task.id === "externalReadonlyE2E"),
		).toBe(false);
		expect(
			explicitStage3?.tasks.some((task) => task.id === "externalReadonlyE2E"),
		).toBe(true);
	});

	it("runs stage0 first, stage1 in parallel, and stage2 as serial close-out", async () => {
		const launched: string[] = [];
		const deferred = new Map<string, Deferred<RunnerResult>>(
			["audit", "lint", "typecheck", "smokeA", "smokeB"].map((id) => [
				id,
				createDeferred<RunnerResult>(),
			]),
		);

		const stages = [
			{
				id: "stage0",
				name: "Security Audit",
				mode: "sequential",
				tasks: [{ id: "audit", command: "audit", hint: "audit hint" }],
			},
			{
				id: "stage1",
				name: "Quality Gates",
				mode: "parallel",
				tasks: [
					{ id: "lint", command: "lint", hint: "lint hint" },
					{ id: "typecheck", command: "typecheck", hint: "type hint" },
				],
			},
			{
				id: "stage2",
				name: "Smoke E2E",
				mode: "sequential",
				tasks: [
					{ id: "smokeA", command: "smokeA", hint: "smokeA hint" },
					{ id: "smokeB", command: "smokeB", hint: "smokeB hint" },
				],
			},
		] as const;

		const gatePromise = runCiGate({
			stages: stages as unknown as typeof DEFAULT_STAGES,
			runTask: (task: RunnerTask) => {
				launched.push(task.id);
				const taskDeferred = deferred.get(task.id);
				if (!taskDeferred) {
					throw new Error(`Unexpected task execution: ${task.id}`);
				}
				return taskDeferred.promise;
			},
		});

		await waitFor(() => launched.length === 1);
		expect(launched).toEqual(["audit"]);

		deferred.get("audit")!.resolve({ exitCode: 0, stdout: "audit ok" });
		await waitFor(
			() => launched.includes("lint") && launched.includes("typecheck"),
		);
		expect(launched).toHaveLength(3);
		expect(launched).not.toContain("smokeA");

		deferred.get("lint")!.resolve({ exitCode: 0, stdout: "lint ok" });
		await Promise.resolve();
		expect(launched).toHaveLength(3);

		deferred.get("typecheck")!.resolve({ exitCode: 0, stdout: "types ok" });
		await waitFor(() => launched.includes("smokeA"));
		expect(launched).toEqual(["audit", "lint", "typecheck", "smokeA"]);
		expect(launched).not.toContain("smokeB");

		deferred.get("smokeA")!.resolve({ exitCode: 0, stdout: "smokeA ok" });
		await waitFor(() => launched.includes("smokeB"));
		expect(launched).toEqual([
			"audit",
			"lint",
			"typecheck",
			"smokeA",
			"smokeB",
		]);

		deferred.get("smokeB")!.resolve({ exitCode: 0, stdout: "smokeB ok" });
		const summary = await gatePromise;

		expect(summary.ok).toBe(true);
		expect(summary.exitCode).toBe(0);
		expect(summary.stages.map((stage) => stage.status)).toEqual([
			"passed",
			"passed",
			"passed",
		]);
	});

	it("does not short-circuit at first stage1 failure and aggregates all failures", async () => {
		const launched: string[] = [];
		const stage0TaskIds = ["audit"];
		const stage1TaskIds = ["lint", "typecheck"];
		const stage0Deferred = new Map<string, Deferred<RunnerResult>>(
			stage0TaskIds.map((taskId) => [taskId, createDeferred<RunnerResult>()]),
		);
		const stage1Deferred = new Map<string, Deferred<RunnerResult>>(
			stage1TaskIds.map((taskId) => [taskId, createDeferred<RunnerResult>()]),
		);
		let settled = false;
		const stages = [
			{
				id: "stage0",
				name: "Security Audit",
				mode: "sequential" as const,
				tasks: stage0TaskIds.map((taskId) => ({
					id: taskId,
					command: taskId,
					hint: `${taskId} hint`,
				})),
			},
			{
				id: "stage1",
				name: "Fast Quality Gates",
				mode: "parallel" as const,
				tasks: stage1TaskIds.map((taskId) => ({
					id: taskId,
					command: taskId,
					hint: `${taskId} hint`,
				})),
			},
			{
				id: "stage1b",
				name: "Deep Quality Gates",
				mode: "sequential" as const,
				tasks: [
					{ id: "deepGate", command: "deepGate", hint: "deep gate hint" },
				],
			},
			{
				id: "stage2",
				name: "Runtime Gates",
				mode: "sequential" as const,
				tasks: [{ id: "smokeE2E", command: "smokeE2E", hint: "smoke hint" }],
			},
			{
				id: "stage3",
				name: "Browser Matrix",
				mode: "parallel" as const,
				tasks: [
					{
						id: "browserMatrix",
						command: "browserMatrix",
						hint: "browser hint",
					},
				],
			},
			{
				id: "stage4",
				name: "Visual QA",
				mode: "sequential" as const,
				tasks: [{ id: "visualQa", command: "visualQa", hint: "visual hint" }],
			},
		];

		const gatePromise = runCiGate({
			stages,
			runTask: (task: RunnerTask) => {
				launched.push(task.id);

				if (stage0Deferred.has(task.id)) {
					return stage0Deferred.get(task.id)!.promise;
				}

				if (stage1Deferred.has(task.id)) {
					return stage1Deferred.get(task.id)!.promise;
				}

				throw new Error(`Unexpected task execution: ${task.id}`);
			},
		}).then((summary) => {
			settled = true;
			return summary;
		});

		await waitFor(() => launched.length === 1);
		expect(launched).toEqual([stage0TaskIds[0]]);

		for (let index = 0; index < stage0TaskIds.length; index += 1) {
			const taskId = stage0TaskIds[index];
			stage0Deferred.get(taskId)!.resolve({
				exitCode: 0,
				stdout: `${taskId} ok`,
			});

			const nextTaskId = stage0TaskIds[index + 1];
			if (nextTaskId) {
				await waitFor(() => launched.includes(nextTaskId));
			}
		}

		await waitFor(
			() =>
				stage1TaskIds.every((taskId) => launched.includes(taskId)) &&
				launched.length === stage0TaskIds.length + stage1TaskIds.length,
		);
		expect(launched).toEqual([...stage0TaskIds, ...stage1TaskIds]);

		stage1Deferred.get("lint")!.resolve({ exitCode: 2, stderr: "lint failed" });
		await Promise.resolve();
		expect(settled).toBe(false);

		for (const taskId of stage1TaskIds) {
			if (taskId === "lint") {
				continue;
			}
			stage1Deferred
				.get(taskId)
				?.resolve({ exitCode: 0, stdout: `${taskId} ok` });
		}

		const summary = await gatePromise;
		expect(summary.ok).toBe(false);
		expect(summary.exitCode).toBe(1);

		const stage1 = summary.stages.find((stage) => stage.id === "stage1");
		expect(stage1?.status).toBe("failed");
		expect(stage1?.tasks.map((task) => task.id)).toEqual(stage1TaskIds);
		expect(stage1?.tasks.find((task) => task.id === "lint")?.exitCode).toBe(2);
		const succeededTaskIds = stage1TaskIds.filter(
			(taskId) => taskId !== "lint",
		);
		for (const taskId of succeededTaskIds) {
			expect(stage1?.tasks.find((task) => task.id === taskId)?.exitCode).toBe(
				0,
			);
		}
		expect(
			stage1?.tasks
				.filter((task) => task.status === "failed")
				.map((task) => task.id),
		).toEqual(["lint"]);
		expect(stage1?.tasks.find((task) => task.id === "lint")?.hint).toContain(
			"lint",
		);
		expect(summary.warningCount).toBe(0);
		expect(summary.warnings).toEqual([]);

		const stage1b = summary.stages.find((stage) => stage.id === "stage1b");
		const stage2 = summary.stages.find((stage) => stage.id === "stage2");
		const stage3 = summary.stages.find((stage) => stage.id === "stage3");
		const stage4 = summary.stages.find((stage) => stage.id === "stage4");
		expect(stage1b?.status).toBe("skipped");
		expect(stage2?.status).toBe("skipped");
		expect(stage3?.status).toBe("skipped");
		expect(stage4?.status).toBe("skipped");
		expect(launched).not.toContain("smokeE2E");
	});

	it("returns non-zero and preserves completed stage results when stage0 fails", async () => {
		const launched: string[] = [];
		const firstStage0TaskId = DEFAULT_STAGES[0].tasks[0]?.id;
		if (!firstStage0TaskId) {
			throw new Error("Expected stage0 to include at least one task.");
		}

		const summary = await runCiGate({
			runTask: async (task: RunnerTask): Promise<RunnerResult> => {
				launched.push(task.id);
				if (task.id === firstStage0TaskId) {
					return { exitCode: 9, stderr: "high vulnerability found" };
				}
				throw new Error(
					`Task should not execute after stage0 failure: ${task.id}`,
				);
			},
		});

		expect(launched).toEqual([firstStage0TaskId]);
		expect(summary.ok).toBe(false);
		expect(summary.exitCode).toBe(1);
		expect(summary.stages.map((stage) => stage.status)).toEqual([
			"failed",
			...Array.from({ length: summary.stages.length - 1 }, () => "skipped"),
		]);

		const stage0Task = summary.stages[0]?.tasks[0];
		expect(stage0Task?.id).toBe(firstStage0TaskId);
		expect(stage0Task?.exitCode).toBe(9);
		expect(typeof stage0Task?.hint).toBe("string");
		expect((stage0Task?.hint ?? "").length).toBeGreaterThan(0);
	});

	it("keeps ci gate green when advisory coverage check fails", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "sequential",
				tasks: [{ id: "audit", command: "audit", hint: "audit hint" }],
			},
			{
				id: "stage1",
				name: "Stage 1",
				mode: "parallel",
				tasks: [
					{ id: "test", command: "npm run test", hint: "test hint" },
					{
						id: "testCoverageAdvisory",
						command: "npm run test:coverage",
						advisory: true,
						hint: "coverage advisory hint",
					},
				],
			},
		] as const;

		const summary = await runCiGate({
			stages: stages as unknown as typeof DEFAULT_STAGES,
			runTask: async (task: RunnerTask): Promise<RunnerResult> => {
				if (task.id === "audit" || task.id === "test") {
					return { exitCode: 0, stdout: `${task.id} ok` };
				}
				if (task.id === "testCoverageAdvisory") {
					return { exitCode: 7, stderr: "coverage threshold not met" };
				}
				throw new Error(`Unexpected task: ${task.id}`);
			},
		});

		expect(summary.ok).toBe(true);
		expect(summary.exitCode).toBe(0);
		expect(summary.warningCount).toBe(1);
		expect(summary.warnings[0]?.taskId).toBe("testCoverageAdvisory");
		expect(summary.warnings[0]?.hint).toContain("coverage advisory hint");
		expect(summary.stages.map((stage) => stage.status)).toEqual([
			"passed",
			"passed_with_warnings",
		]);
	});

	it("fails ci gate when core coverage gate fails", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "sequential",
				tasks: [{ id: "audit", command: "audit", hint: "audit hint" }],
			},
			{
				id: "stage1",
				name: "Stage 1",
				mode: "parallel",
				tasks: [
					{ id: "test", command: "npm run test", hint: "test hint" },
					{
						id: "testCoverageAdvisory",
						command: "npm run test:coverage",
						advisory: true,
						hint: "coverage advisory hint",
					},
					{
						id: "coreCoverageGate",
						command: "node tooling/check-core-coverage.mjs",
						hint: "core coverage gate hint",
					},
				],
			},
		] as const;

		const summary = await runCiGate({
			stages: stages as unknown as typeof DEFAULT_STAGES,
			runTask: async (task: RunnerTask): Promise<RunnerResult> => {
				if (task.id === "audit" || task.id === "test") {
					return { exitCode: 0, stdout: `${task.id} ok` };
				}
				if (task.id === "testCoverageAdvisory") {
					return { exitCode: 7, stderr: "global coverage threshold not met" };
				}
				if (task.id === "coreCoverageGate") {
					return {
						exitCode: 1,
						stderr: "packages/shared-runtime/src/branches 84.10% < 85.00%",
					};
				}
				throw new Error(`Unexpected task: ${task.id}`);
			},
		});

		expect(summary.ok).toBe(false);
		expect(summary.exitCode).toBe(1);
		expect(summary.warningCount).toBe(1);
		expect(summary.warnings[0]?.taskId).toBe("testCoverageAdvisory");

		const stage1 = summary.stages.find((stage) => stage.id === "stage1");
		expect(stage1?.status).toBe("failed");
		expect(
			stage1?.tasks.find((task) => task.id === "coreCoverageGate")?.status,
		).toBe("failed");
		expect(
			stage1?.tasks.find((task) => task.id === "coreCoverageGate")?.stderr,
		).toContain("packages/shared-runtime");
	});

	it("fails ci gate when mutation coverage gate fails", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "sequential",
				tasks: [{ id: "audit", command: "audit", hint: "audit hint" }],
			},
			{
				id: "stage1",
				name: "Stage 1",
				mode: "parallel",
				tasks: [
					{ id: "test", command: "npm run test", hint: "test hint" },
					{
						id: "mutationFullGate",
						command: "node tooling/check-core-coverage.mjs --mutation-only",
						hint: "mutation gate hint",
					},
				],
			},
		] as const;

		const summary = await runCiGate({
			stages: stages as unknown as typeof DEFAULT_STAGES,
			runTask: async (task: RunnerTask): Promise<RunnerResult> => {
				if (task.id === "audit" || task.id === "test") {
					return { exitCode: 0, stdout: `${task.id} ok` };
				}
				if (task.id === "mutationFullGate") {
					return {
						exitCode: 1,
						stderr: "mutation score 70.00% < 80.00%",
					};
				}
				throw new Error(`Unexpected task: ${task.id}`);
			},
		});

		expect(summary.ok).toBe(false);
		expect(summary.exitCode).toBe(1);
		expect(summary.warningCount).toBe(0);

		const stage1 = summary.stages.find((stage) => stage.id === "stage1");
		expect(stage1?.status).toBe("failed");
		expect(
			stage1?.tasks.find((task) => task.id === "mutationFullGate")?.status,
		).toBe("failed");
		expect(
			stage1?.tasks.find((task) => task.id === "mutationFullGate")?.stderr,
		).toContain("mutation score");
	});

	it("rejects parallel stages that declare conflicting resource locks", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "parallel",
				tasks: [
					{
						id: "taskA",
						command: "echo A",
						hint: "taskA",
						resourceLocks: ["shared-next-build"],
					},
					{
						id: "taskB",
						command: "echo B",
						hint: "taskB",
						resourceLocks: ["shared-next-build"],
					},
				],
			},
		] as const;

		await expect(
			runCiGate({
				stages: stages as unknown as typeof DEFAULT_STAGES,
			}),
		).rejects.toThrow(/resource lock conflict/i);
	});

	it("fails fast when stage mode is misconfigured", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "paralell",
				tasks: [{ id: "taskA", command: "echo ok", hint: "fix mode" }],
			},
		] as const;

		await expect(
			runCiGate({
				stages: stages as unknown as typeof DEFAULT_STAGES,
			}),
		).rejects.toThrow(/invalid mode/i);
	});

	it("fails fast when a task declares duplicate resource locks", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "parallel",
				tasks: [
					{
						id: "taskA",
						command: "echo A",
						hint: "taskA",
						resourceLocks: ["shared-next-build", "shared-next-build"],
					},
				],
			},
		] as const;

		await expect(
			runCiGate({
				stages: stages as unknown as typeof DEFAULT_STAGES,
			}),
		).rejects.toThrow(/duplicate resource locks/i);
	});

	it("enforces global timeout and marks remaining stages as skipped", async () => {
		const stages = [
			{
				id: "stage0",
				name: "Stage 0",
				mode: "sequential",
				tasks: [{ id: "hang", command: "hang", hint: "fix hang" }],
			},
			{
				id: "stage1",
				name: "Stage 1",
				mode: "sequential",
				tasks: [{ id: "never", command: "never", hint: "never" }],
			},
		] as const;

		const summary = await runCiGate({
			stages: stages as unknown as typeof DEFAULT_STAGES,
			timeoutMs: 30,
			taskTimeoutMs: 500,
			runTask: async () =>
				await new Promise<RunnerResult>(() => {
					// intentionally unresolved to trigger global timeout
				}),
		});

		expect(summary.ok).toBe(false);
		expect(summary.exitCode).toBe(1);
		expect(summary.stages.map((stage) => stage.status)).toEqual([
			"failed",
			"skipped",
		]);
		expect(summary.stages[0]?.tasks[0]?.exitCode).toBe(124);
		expect(summary.stages[0]?.tasks[0]?.stderr).toContain("global timeout");
	});

	it("caps runner stdout/stderr to avoid unbounded memory growth", async () => {
		const runTask = createDefaultRunner(((command, args, options) => {
			void command;
			void args;
			void options;
			const child = new EventEmitter() as EventEmitter & {
				stdout: EventEmitter;
				stderr: EventEmitter;
			};
			child.stdout = new EventEmitter();
			child.stderr = new EventEmitter();
			queueMicrotask(() => {
				child.stdout.emit("data", "x".repeat(512));
				child.stderr.emit("data", "y".repeat(512));
				child.emit("close", 0, null);
			});
			return child as never;
		}) as never);

		const result = await runTask(
			{ id: "spam", command: "spam", hint: "" },
			{
				cwd: process.cwd(),
				maxStdoutBytes: 64,
				maxStderrBytes: 64,
				taskTimeoutMs: 1_000,
			},
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.startsWith("x".repeat(64))).toBe(true);
		expect(result.stderr.startsWith("y".repeat(64))).toBe(true);
		expect(result.stdout).toContain("[truncated]");
		expect(result.stderr).toContain("[truncated]");
	});

	it("rejects summary-file directory symlink that escapes ci-gate runtime directory", async () => {
		await withTempWorkspace(async (workspaceRoot) => {
			const outsideDir = await fs.mkdtemp(
				path.join(os.tmpdir(), "ci-gate-outside-"),
			);
			try {
				await fs.mkdir(path.join(workspaceRoot, ".runtime-cache"), {
					recursive: true,
				});
				await fs.mkdir(path.join(workspaceRoot, ".runtime-cache", "runs"), {
					recursive: true,
				});
				await fs.symlink(
					outsideDir,
					path.join(workspaceRoot, ".runtime-cache", "runs", "test-run"),
				);

				await expect(
					writeSummaryFile(".runtime-cache/runs/test-run/summary.json", {
						ok: true,
					}),
				).rejects.toThrow(/resolves outside .* via symlink/i);
			} finally {
				await fs.rm(outsideDir, { recursive: true, force: true });
			}
		});
	});

	it("rejects summary-file target symlink that points outside ci-gate runtime directory", async () => {
		await withTempWorkspace(async (workspaceRoot) => {
			const outsideDir = await fs.mkdtemp(
				path.join(os.tmpdir(), "ci-gate-outside-"),
			);
			try {
				const summaryDir = path.join(
					workspaceRoot,
					".runtime-cache",
					"runs",
					"test-run",
				);
				await fs.mkdir(summaryDir, { recursive: true });

				const outsideFile = path.join(outsideDir, "outside.json");
				await fs.writeFile(outsideFile, "{}", "utf8");
				await fs.symlink(outsideFile, path.join(summaryDir, "summary.json"));

				await expect(
					writeSummaryFile(".runtime-cache/runs/test-run/summary.json", {
						ok: true,
					}),
				).rejects.toThrow(/must not be a symlink/i);
			} finally {
				await fs.rm(outsideDir, { recursive: true, force: true });
			}
		});
	});

	it("recreates the authoritative run manifest after meta drift", async () => {
		await withTempWorkspace(async (workspaceRoot) => {
			const runId = "ci-gate-manifest-recovery";
			const layout = buildRunLayout(workspaceRoot, runId, {
				runsRoot: ".runtime-cache/runs",
				logChannels: ["runtime", "ci", "tests", "upstream"],
			});
			const metaDir = path.join(workspaceRoot, layout.metaRootRelative);
			const runManifestPath = path.join(
				workspaceRoot,
				layout.runManifestPathRelative,
			);

			await fs.mkdir(metaDir, { recursive: true });
			await ensureRunManifest(layout, ["--enforce-external-readonly"]);
			await fs.rm(runManifestPath, { force: true });
			await fs.writeFile(
				path.join(metaDir, `test-coverage-${runId}.json`),
				JSON.stringify({ ok: true }, null, 2),
				"utf8",
			);

			await ensureRunManifest(layout, ["--enforce-external-readonly"]);

			const manifest = JSON.parse(await fs.readFile(runManifestPath, "utf8"));
			expect(manifest).toMatchObject({
				version: 1,
				runId,
				authoritative: true,
				mode: "ci-gate",
			});
			expect(await fs.realpath(manifest.workspaceRoot)).toBe(
				await fs.realpath(workspaceRoot),
			);
			expect(manifest.command).toBe(
				"node tooling/ci-gate.mjs --enforce-external-readonly",
			);
		});
	});
});

describe("live test retry policy", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("emits structured live-test logs with traceId/stage/errorType", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-structured-123456",
			LIVE_TEST_MAX_RETRIES: "0",
			OPENUI_LIVE_TEST_RUN_ID: "trace-live-test-001",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr: "timeout 503 service unavailable",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
		expect(exitCode).toBe(1);

		const lines = stderrSpy.mock.calls
			.map(([chunk]) => String(chunk))
			.flatMap((chunk) => chunk.split("\n"))
			.map((line) => line.trim())
			.filter(Boolean);
		const structuredLogs = lines
			.map((line) => {
				try {
					return JSON.parse(line) as Record<string, unknown>;
				} catch {
					return null;
				}
			})
			.filter((entry): entry is Record<string, unknown> => {
				return Boolean(
					entry &&
						typeof entry.event === "string" &&
						String(entry.event).startsWith("live_test_"),
				);
			});

		expect(structuredLogs.length).toBeGreaterThanOrEqual(2);
		expect(structuredLogs).toContainEqual(
			expect.objectContaining({
				event: "live_test_attempt_started",
				traceId: "trace-live-test-001",
				stage: "attempt_start",
			}),
		);
		expect(structuredLogs).toContainEqual(
			expect.objectContaining({
				event: "live_test_attempt_failed",
				traceId: "trace-live-test-001",
				stage: "attempt_complete",
				errorType: "network",
				errorCode: "LIVE_NETWORK_TRANSIENT",
				recommendedAction: expect.stringContaining("Retry later"),
			}),
		);
	});

	it("returns timeout semantic without hanging when vitest subprocess exceeds per-attempt limit", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-timeout-limit-123456",
			LIVE_TEST_MAX_RETRIES: "0",
			LIVE_TEST_ATTEMPT_TIMEOUT_MS: "25",
		} as NodeJS.ProcessEnv;
		const timeoutError = Object.assign(new Error("spawnSync node ETIMEDOUT"), {
			code: "ETIMEDOUT",
		});
		const run = vi.fn().mockReturnValue({
			status: null,
			stdout: "",
			stderr: "",
			error: timeoutError,
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
		expect(exitCode).toBe(124);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith(
			process.execPath,
			[
				"./node_modules/vitest/vitest.mjs",
				"run",
				"tests/live-gemini-smoke.test.ts",
			],
			expect.objectContaining({
				timeout: 25,
			}),
		);
		const combinedLogs = errorSpy.mock.calls
			.map((entry) => entry.join(" "))
			.join("\n");
		expect(combinedLogs).toContain("LIVE_SUBPROCESS_TIMEOUT");
		expect(combinedLogs).toContain("vitest subprocess timed out");
	});

	it("treats network ETIMEDOUT signatures as retryable transient failures", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-network-etimedout-123456",
			LIVE_TEST_MAX_RETRIES: "1",
			LIVE_TEST_RETRY_BASE_DELAY_MS: "0",
		} as NodeJS.ProcessEnv;
		const run = vi
			.fn()
			.mockReturnValueOnce({
				status: 1,
				stdout: "",
				stderr: "connect ETIMEDOUT api.example.com:443",
			})
			.mockReturnValueOnce({
				status: 0,
				stdout: "ok",
				stderr: "",
			});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(0);
			expect(run).toHaveBeenCalledTimes(2);
			expect(spawnProcess).toHaveBeenCalledTimes(2);
			const combinedLogs = errorSpy.mock.calls
				.map((entry) => entry.join(" "))
				.join("\n");
			expect(combinedLogs).toContain('"errorCode":"LIVE_NETWORK_TRANSIENT"');
			expect(combinedLogs).not.toContain(
				'"errorCode":"LIVE_SUBPROCESS_TIMEOUT"',
			);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("redacts sensitive subprocess stdout/stderr before writing logs", () => {
		const leakedGeminiKey = "GEMINI_API_KEY=super-secret-live-key";
		const leakedBearerToken = "Authorization: Bearer bearer-token-123";
		const leakedAIzaToken = `AIza${"A".repeat(35)}`;
		const env = {
			GEMINI_API_KEY: "real-looking-key-redact-123456",
			LIVE_TEST_MAX_RETRIES: "0",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: `${leakedGeminiKey}\n${leakedAIzaToken}`,
			stderr: leakedBearerToken,
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const stdoutSpy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(1);
			const combinedOutput = [
				...stdoutSpy.mock.calls.map(([chunk]) => String(chunk)),
				...stderrSpy.mock.calls.map(([chunk]) => String(chunk)),
			].join("\n");

			expect(combinedOutput).toContain("GEMINI_API_KEY=<redacted>");
			expect(combinedOutput).toContain("Authorization: Bearer <redacted>");
			expect(combinedOutput).toContain("<redacted_ai_key>");
			expect(combinedOutput).not.toContain(leakedGeminiKey);
			expect(combinedOutput).not.toContain(leakedBearerToken);
			expect(combinedOutput).not.toContain(leakedAIzaToken);
		} finally {
			stdoutSpy.mockRestore();
			stderrSpy.mockRestore();
		}
	});

	it("rejects placeholder GEMINI_API_KEY before running vitest", () => {
		const env = {
			GEMINI_API_KEY: "placeholder-token",
		} as NodeJS.ProcessEnv;
		const run = vi.fn();

		let capturedError: unknown;
		try {
			runLiveGeminiSmoke({ env, run });
		} catch (error) {
			capturedError = error;
		}
		expect(capturedError).toBeInstanceOf(Error);
		expect((capturedError as Error).message).toMatch(
			/placeholder or test token/i,
		);
		expect((capturedError as Error & { errorCode?: string }).errorCode).toBe(
			"LIVE_KEY_PLACEHOLDER",
		);
		expect(run).not.toHaveBeenCalled();
	});

	it("retries once on transient failure signature and then succeeds", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-1234567890",
			LIVE_TEST_MAX_RETRIES: "1",
			LIVE_TEST_RETRY_BASE_DELAY_MS: "0",
		} as NodeJS.ProcessEnv;
		const run = vi
			.fn()
			.mockReturnValueOnce({
				status: 1,
				stdout: "",
				stderr: "upstream timeout 503 service unavailable",
			})
			.mockReturnValueOnce({
				status: 0,
				stdout: "ok",
				stderr: "",
			});
		const kill = vi.fn();
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill,
			unref: vi.fn(),
		});

		const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
		expect(exitCode).toBe(0);
		expect(run).toHaveBeenCalledTimes(2);
		expect(spawnProcess).toHaveBeenCalledTimes(2);
	});

	it("emits retry-backoff heartbeat events during transient retry delay", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-heartbeat-123456", // pragma: allowlist secret
			LIVE_TEST_MAX_RETRIES: "1",
			LIVE_TEST_RETRY_BASE_DELAY_MS: "6000",
			OPENUI_LIVE_TEST_RUN_ID: "trace-live-test-heartbeat-001",
		} as NodeJS.ProcessEnv;
		const run = vi
			.fn()
			.mockReturnValueOnce({
				status: 1,
				stdout: "",
				stderr: "temporary network timeout 503",
			})
			.mockReturnValueOnce({
				status: 0,
				stdout: "ok",
				stderr: "",
			});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const sleepWithHeartbeat = vi
			.fn()
			.mockImplementation((delayMs, options) => {
				options?.onTick?.({
					totalMs: delayMs,
					elapsedMs: 1_000,
					remainingMs: Math.max(0, delayMs - 1_000),
				});
			});
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		const exitCode = runLiveGeminiSmoke({
			env,
			run,
			spawnProcess,
			sleepWithHeartbeat,
		});
		expect(exitCode).toBe(0);
		expect(run).toHaveBeenCalledTimes(2);
		expect(sleepWithHeartbeat).toHaveBeenCalledTimes(1);

		const lines = stderrSpy.mock.calls
			.map(([chunk]) => String(chunk))
			.flatMap((chunk) => chunk.split("\n"))
			.map((line) => line.trim())
			.filter(Boolean);
		const structuredLogs = lines
			.map((line) => {
				try {
					return JSON.parse(line) as Record<string, unknown>;
				} catch {
					return null;
				}
			})
			.filter((entry): entry is Record<string, unknown> => {
				return Boolean(entry && typeof entry.event === "string");
			});

		expect(structuredLogs).toContainEqual(
			expect.objectContaining({
				event: "live_test_retry_backoff_heartbeat",
				traceId: "trace-live-test-heartbeat-001",
				stage: "retry_backoff",
			}),
		);
	});

	it("does not retry on non-transient assertion/runtime failure signature", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-0987654321",
			LIVE_TEST_MAX_RETRIES: "2",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr: "AssertionError: expected 200 to equal 500",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});

		const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
		expect(exitCode).toBe(1);
		expect(run).toHaveBeenCalledTimes(1);
		expect(spawnProcess).toHaveBeenCalledTimes(1);
	});

	it("prefers auth classification when failure text includes 401/403", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-assert-401-403-12345",
			LIVE_TEST_MAX_RETRIES: "2",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr:
				"AssertionError: expected status 401 to equal 403 during runtime assertion",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(1);
			expect(run).toHaveBeenCalledTimes(1);
			expect(spawnProcess).toHaveBeenCalledTimes(1);
			const combinedLogs = errorSpy.mock.calls
				.map((entry) => entry.join(" "))
				.join("\n");
			expect(combinedLogs).toContain('"type":"auth"');
			expect(combinedLogs).toContain('"errorCode":"LIVE_AUTH_PERMISSION"');
			expect(combinedLogs).toContain(
				'"recommendedAction":"Verify GEMINI_API_KEY validity, permissions, and project scope; rotate key if needed."',
			);
			expect(combinedLogs).not.toContain(
				'"errorCode":"LIVE_ASSERTION_RUNTIME"',
			);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("stops heartbeat process and prevents orphan process leaks", async () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-heartbeat-stop-123456",
			LIVE_TEST_MAX_RETRIES: "0",
			OPENUI_LIVE_TEST_RUN_ID: "trace-live-test-heartbeat-stop-001",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 0,
			stdout: "ok",
			stderr: "",
		});
		let heartbeatPid: number | undefined;
		let heartbeatProcess: ReturnType<typeof spawn> | undefined;

		const isProcessAlive = (pid: number): boolean => {
			try {
				process.kill(pid, 0);
				return true;
			} catch (error) {
				if (
					error &&
					typeof error === "object" &&
					"code" in error &&
					error.code === "ESRCH"
				) {
					return false;
				}
				throw error;
			}
		};

		try {
			const exitCode = runLiveGeminiSmoke({
				env,
				run,
				spawnProcess: () => {
					const child = spawn(
						process.execPath,
						["-e", "setInterval(() => {}, 1000)"],
						{
							stdio: ["ignore", "ignore", "ignore"],
						},
					);
					heartbeatProcess = child;
					heartbeatPid = child.pid;
					return child;
				},
			});

			expect(exitCode).toBe(0);
			expect(run).toHaveBeenCalledTimes(1);
			expect(heartbeatPid).toBeTypeOf("number");

			for (let attempt = 0; attempt < 20; attempt += 1) {
				if (!isProcessAlive(heartbeatPid as number)) {
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			expect(isProcessAlive(heartbeatPid as number)).toBe(false);
		} finally {
			const pid = heartbeatProcess?.pid;
			if (typeof pid === "number" && isProcessAlive(pid)) {
				try {
					heartbeatProcess?.kill("SIGTERM");
				} catch {
					// Process may have exited between checks.
				}
				for (let attempt = 0; attempt < 10; attempt += 1) {
					if (!isProcessAlive(pid)) {
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
				if (isProcessAlive(pid)) {
					try {
						process.kill(pid, "SIGKILL");
					} catch {
						// Process may already be gone.
					}
				}
			}
		}
	});

	it("re-checks heartbeat liveness after SIGKILL before reporting still_alive", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-heartbeat-confirm-123456",
			LIVE_TEST_MAX_RETRIES: "0",
			OPENUI_LIVE_TEST_RUN_ID: "trace-live-test-heartbeat-confirm-001",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 0,
			stdout: "ok",
			stderr: "",
		});
		const heartbeatPid = 424242;
		let sigkillSent = false;
		let postSigkillAliveChecks = 0;
		const heartbeatProcess = {
			pid: heartbeatPid,
			exitCode: null,
			signalCode: null,
			kill: vi.fn((signal: NodeJS.Signals) => {
				if (signal === "SIGKILL") {
					sigkillSent = true;
				}
			}),
			unref: vi.fn(),
		};
		const spawnProcess = vi.fn().mockReturnValue(heartbeatProcess);
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const realProcessKill = process.kill.bind(process);
		const processKillSpy = vi.spyOn(process, "kill").mockImplementation(((
			pid: number,
			signal?: NodeJS.Signals | number,
		) => {
			if (pid !== heartbeatPid) {
				return realProcessKill(pid, signal as NodeJS.Signals);
			}
			if (signal === 0) {
				if (!sigkillSent) {
					return true;
				}
				postSigkillAliveChecks += 1;
				if (postSigkillAliveChecks >= 2) {
					const err = Object.assign(new Error("no such process"), {
						code: "ESRCH",
					});
					throw err;
				}
				return true;
			}
			return true;
		}) as typeof process.kill);
		let now = 0;
		const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
			now += 200;
			return now;
		});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(0);
			expect(processKillSpy).toHaveBeenCalled();
			expect(heartbeatProcess.kill).toHaveBeenCalledWith("SIGTERM");
			expect(heartbeatProcess.kill).toHaveBeenCalledWith("SIGKILL");

			const combinedLogs = stderrSpy.mock.calls
				.map(([chunk]) => String(chunk))
				.join("\n");
			expect(combinedLogs).toContain(
				'"event":"live_test_heartbeat_termination_escalated"',
			);
			expect(combinedLogs).toContain('"result":"terminated"');
			expect(combinedLogs).not.toContain('"result":"still_alive"');
		} finally {
			nowSpy.mockRestore();
			processKillSpy.mockRestore();
			stderrSpy.mockRestore();
		}
	});

	it("caps live retries at policy maximum (2 retries => 3 total attempts)", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-cap-12345",
			LIVE_TEST_MAX_RETRIES: "9",
			LIVE_TEST_RETRY_BASE_DELAY_MS: "0",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr: "upstream timeout 503 service unavailable",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(1);
			expect(run).toHaveBeenCalledTimes(3);
			expect(spawnProcess).toHaveBeenCalledTimes(3);
			const combinedLogs = errorSpy.mock.calls
				.map((entry) => entry.join(" "))
				.join("\n");
			expect(combinedLogs).toContain("LIVE_TEST_MAX_RETRIES clamped");
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("classifies auth errors as non-retryable and emits failure evidence", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-auth-12345",
			LIVE_TEST_MAX_RETRIES: "2",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr: "401 Unauthorized: invalid API key",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(1);
			expect(run).toHaveBeenCalledTimes(1);
			expect(spawnProcess).toHaveBeenCalledTimes(1);
			const combinedLogs = errorSpy.mock.calls
				.map((entry) => entry.join(" "))
				.join("\n");
			expect(combinedLogs).toContain("[live-test][failure-evidence]");
			expect(combinedLogs).toContain('"type":"auth"');
			expect(combinedLogs).toContain('"errorCode":"LIVE_AUTH_PERMISSION"');
			expect(combinedLogs).toContain('"recommendedAction":"');
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("does not misclassify timeout stack traces with line numbers as auth failures", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-timeout-stack-12345", // pragma: allowlist secret
			LIVE_TEST_MAX_RETRIES: "1",
			LIVE_TEST_RETRY_BASE_DELAY_MS: "0",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr:
				"Error: Gemini sidecar request timed out. at tests/live-gemini-smoke.test.ts:403:9",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(1);
			expect(run).toHaveBeenCalledTimes(2);
			const combinedLogs = errorSpy.mock.calls
				.map((entry) => entry.join(" "))
				.join("\n");
			expect(combinedLogs).toContain('"type":"network"');
			expect(combinedLogs).toContain('"errorCode":"LIVE_NETWORK_TRANSIENT"');
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("emits max-attempts error code when transient failures exhaust retries", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-max-attempts-12345", // pragma: allowlist secret
			LIVE_TEST_MAX_RETRIES: "2",
			LIVE_TEST_RETRY_BASE_DELAY_MS: "0",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 1,
			stdout: "",
			stderr: "timeout 503 service unavailable",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		try {
			const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
			expect(exitCode).toBe(1);
			const combinedLogs = errorSpy.mock.calls
				.map((entry) => entry.join(" "))
				.join("\n");
			expect(combinedLogs).toContain('"errorCode":"LIVE_MAX_ATTEMPTS_REACHED"');
			expect(combinedLogs).toContain('"type":"max_attempts_reached"');
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("uses LIVE_TEST_MAX_RETRIES and executes live test command", () => {
		const env = {
			GEMINI_API_KEY: "real-looking-key-deprecated-12345",
			LIVE_TEST_MAX_RETRIES: "0",
		} as NodeJS.ProcessEnv;
		const run = vi.fn().mockReturnValue({
			status: 0,
			stdout: "",
			stderr: "",
		});
		const spawnProcess = vi.fn().mockReturnValue({
			exitCode: null,
			signalCode: null,
			kill: vi.fn(),
			unref: vi.fn(),
		});

		const exitCode = runLiveGeminiSmoke({ env, run, spawnProcess });
		expect(exitCode).toBe(0);
		expect(run).toHaveBeenCalledTimes(1);
		expect(spawnProcess).toHaveBeenCalledTimes(1);
	});
});
