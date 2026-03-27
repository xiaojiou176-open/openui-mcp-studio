import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runEvidenceGovernanceCheck } from "../tooling/check-evidence-governance.mjs";
import { writeEvidenceIndex } from "../tooling/evidence-index.mjs";

const ORIGINAL_RUNTIME_RUN_ID = process.env.OPENUI_RUNTIME_RUN_ID;
const ORIGINAL_CI_GATE_RUN_KEY = process.env.OPENUI_CI_GATE_RUN_KEY;

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function clearRunIdEnv() {
	delete process.env.OPENUI_RUNTIME_RUN_ID;
	delete process.env.OPENUI_CI_GATE_RUN_KEY;
}

afterEach(() => {
	if (ORIGINAL_RUNTIME_RUN_ID === undefined) {
		delete process.env.OPENUI_RUNTIME_RUN_ID;
	} else {
		process.env.OPENUI_RUNTIME_RUN_ID = ORIGINAL_RUNTIME_RUN_ID;
	}
	if (ORIGINAL_CI_GATE_RUN_KEY === undefined) {
		delete process.env.OPENUI_CI_GATE_RUN_KEY;
	} else {
		process.env.OPENUI_CI_GATE_RUN_KEY = ORIGINAL_CI_GATE_RUN_KEY;
	}
});

describe("evidence governance", () => {
	it("treats an empty run surface as clean instead of broken", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-evidence-empty-"),
		);
		try {
			clearRunIdEnv();
			await writeJson(
				path.join(rootDir, "contracts", "governance", "evidence-schema.json"),
				{
					version: 1,
					requiredSummaryFields: ["runId"],
					requiredEvidenceIndexFields: ["runId"],
					requiredStageResultFields: ["stageId"],
					requiredClassificationFields: ["businessFailureCount"],
				},
			);
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: ["summary.json", "quality-score.json", "meta/run.json", "evidence/index.json"],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl"
					]
				},
			);

			const result = await runEvidenceGovernanceCheck({ rootDir });

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
			expect(result.reason).toBe("no_authoritative_runs_present");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails in strict mode when no authoritative run is present", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-evidence-empty-strict-"),
		);
		try {
			clearRunIdEnv();
			await writeJson(
				path.join(rootDir, "contracts", "governance", "evidence-schema.json"),
				{
					version: 1,
					requiredSummaryFields: ["runId"],
					requiredEvidenceIndexFields: ["runId"],
					requiredStageResultFields: ["stageId"],
					requiredClassificationFields: ["businessFailureCount"],
				},
			);
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: ["summary.json", "quality-score.json", "meta/run.json", "evidence/index.json"],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl"
					]
				},
			);

			const result = await runEvidenceGovernanceCheck({
				rootDir,
				allowNoAuthoritativeRuns: false,
			});

			expect(result.ok).toBe(false);
			expect(result.reason).toBe("no_authoritative_runs_present");
			expect(result.errors[0]).toContain("No authoritative runs are present");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("validates ci summary plus generated evidence index", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-evidence-"),
		);
		try {
			await writeJson(
				path.join(rootDir, "contracts", "governance", "evidence-schema.json"),
				{
					version: 1,
					requiredSummaryFields: [
						"runId",
						"startedAt",
						"finishedAt",
						"durationMs",
						"ok",
						"exitCode",
						"stages",
					],
					requiredEvidenceIndexFields: [
						"runId",
						"runManifestPath",
						"generatedAt",
						"summaryPath",
						"qualityScorePath",
						"logPaths",
						"artifactDirectories",
						"classification",
						"stageResults",
					],
					requiredStageResultFields: ["stageId", "status", "taskCount"],
					requiredClassificationFields: [
						"businessFailureCount",
						"testFailureCount",
						"infraFailureCount",
						"upstreamFailureCount",
					],
				},
			);
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: ["summary.json", "quality-score.json", "meta/run.json", "evidence/index.json"],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl"
					]
				},
			);
			const summary = {
				runId: "run-123",
				startedAt: "2026-03-14T00:00:00.000Z",
				finishedAt: "2026-03-14T00:01:00.000Z",
				durationMs: 60_000,
				ok: true,
				exitCode: 0,
				stages: [
					{
						id: "stage1",
						tasks: [{ id: "lint", command: "npm run lint", status: "passed" }],
					},
				],
			};
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "summary.json"),
				summary,
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "quality-score.json"),
				{ overall: { score: 100 } },
			);
			await writeJson(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "meta", "run.json"),
				{
					version: 1,
					runId: "run-123",
					authoritative: true,
					mode: "test",
				},
			);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "logs", "runtime.jsonl"),
				'{"ts":"1","level":"info","event":"ok","runId":"run-123","traceId":"t","requestId":"r","service":"svc","component":"cmp","stage":"runtime","context":{}}\n',
			);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "logs", "tests.jsonl"),
				"",
			);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "logs", "ci.jsonl"),
				"",
			);
			await writeFile(
				path.join(rootDir, ".runtime-cache", "runs", "run-123", "logs", "upstream.jsonl"),
				"",
			);

			await writeEvidenceIndex({
				rootDir,
				summary,
				summaryPath: ".runtime-cache/runs/run-123/summary.json",
				qualityScorePath: ".runtime-cache/runs/run-123/quality-score.json",
				runId: summary.runId,
			});

			const result = await runEvidenceGovernanceCheck({
				rootDir,
				runId: summary.runId,
			});

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
