import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runRunCorrelationCheck } from "../tooling/check-run-correlation.mjs";

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

describe("run correlation", () => {
	it("treats an empty run surface as clean instead of broken", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-run-correlation-empty-"),
		);
		try {
			clearRunIdEnv();
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: [
						"summary.json",
						"quality-score.json",
						"meta/run.json",
						"evidence/index.json",
					],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl",
					],
				},
			);

			const result = await runRunCorrelationCheck({ rootDir });

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
			expect(result.reason).toBe("no_authoritative_runs_present");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("treats present non-authoritative runtime runs as no authoritative runs present", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-run-correlation-non-authoritative-"),
		);
		try {
			clearRunIdEnv();
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: [
						"summary.json",
						"quality-score.json",
						"meta/run.json",
						"evidence/index.json",
					],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl",
					],
				},
			);
			await writeFile(
				path.join(
					rootDir,
					".runtime-cache",
					"runs",
					"mcp-runtime-123",
					"logs",
					"runtime.jsonl",
				),
				'{"runId":"mcp-runtime-123"}\n',
			);

			const result = await runRunCorrelationCheck({ rootDir });

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
			expect(result.reason).toBe("no_authoritative_runs_present");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("ignores authoritative manifests that do not yet have a complete run bundle", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(
				os.tmpdir(),
				"openui-run-correlation-incomplete-authoritative-",
			),
		);
		try {
			clearRunIdEnv();
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: [
						"summary.json",
						"quality-score.json",
						"meta/run.json",
						"evidence/index.json",
					],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl",
					],
				},
			);
			await writeJson(
				path.join(
					rootDir,
					".runtime-cache",
					"runs",
					"ci-gate-partial",
					"meta",
					"run.json",
				),
				{
					version: 1,
					runId: "ci-gate-partial",
					authoritative: true,
				},
			);

			const result = await runRunCorrelationCheck({ rootDir });

			expect(result.ok).toBe(true);
			expect(result.errors).toEqual([]);
			expect(result.reason).toBe("no_authoritative_runs_present");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails in strict mode when no authoritative run is present", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-run-correlation-empty-strict-"),
		);
		try {
			clearRunIdEnv();
			await writeJson(
				path.join(rootDir, "contracts", "runtime", "run-layout.json"),
				{
					version: 1,
					runtimeRoot: ".runtime-cache",
					runsRoot: ".runtime-cache/runs",
					logChannels: ["runtime", "tests", "ci", "upstream"],
					requiredRunFiles: [
						"summary.json",
						"quality-score.json",
						"meta/run.json",
						"evidence/index.json",
					],
					requiredRunDirectories: ["meta", "logs", "artifacts", "evidence"],
					requiredLogFiles: [
						"logs/runtime.jsonl",
						"logs/tests.jsonl",
						"logs/ci.jsonl",
						"logs/upstream.jsonl",
					],
				},
			);

			const result = await runRunCorrelationCheck({
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
});
