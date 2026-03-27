import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	GLOBAL_THRESHOLDS,
	KEY_MODULE_THRESHOLDS,
} from "../tooling/check-core-coverage.mjs";
import vitestConfig from "../vitest.config";

type CoverageMetric = {
	total: number;
	covered: number;
	skipped: number;
	pct: number;
};

type CoverageEntry = {
	statements: CoverageMetric;
	branches: CoverageMetric;
	functions: CoverageMetric;
	lines: CoverageMetric;
};

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = path.resolve(WORKSPACE_ROOT, "tooling/check-core-coverage.mjs");
const tempDirs: string[] = [];

function metric(pct: number, total = 100): CoverageMetric {
	const covered = Math.round((pct / 100) * total);
	return {
		total,
		covered,
		skipped: 0,
		pct,
	};
}

function entry(pct: number): CoverageEntry {
	return {
		statements: metric(pct),
		branches: metric(pct),
		functions: metric(pct),
		lines: metric(pct),
	};
}

async function writeSummaryFile(
	summary: Record<string, CoverageEntry>,
): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-coverage-gate-"));
	tempDirs.push(dir);
	const summaryPath = path.join(dir, "coverage-summary.json");
	await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
	return summaryPath;
}

function runCoverageGate(
	summaryPath: string,
	extraEnv: NodeJS.ProcessEnv = {},
	extraArgs: string[] = [],
) {
	return spawnSync(process.execPath, [SCRIPT_PATH, ...extraArgs], {
		env: {
			...process.env,
			OPENUI_COVERAGE_SUMMARY_PATH: summaryPath,
			...extraEnv,
		},
		encoding: "utf8",
	});
}

function runMutationGate(extraEnv: NodeJS.ProcessEnv = {}) {
	return spawnSync(process.execPath, [SCRIPT_PATH, "--mutation-only"], {
		env: {
			...process.env,
			CI: "",
			...extraEnv,
		},
		encoding: "utf8",
	});
}

function buildHealthyMutationSummary(overrides: Record<string, unknown> = {}) {
	return {
		mode: "full",
		mutationScore: 90,
		total: { killed: 90, total: 100 },
		moduleSampling: {
			status: "pass",
			enforcement: "blocking",
			minSamplesPerModule: 2,
			deficits: [],
		},
		operatorSampling: {
			status: "pass",
			enforcement: "blocking",
			minSamplesPerOperator: 2,
			requiredOperators: ["enum-substitution", "template-elision"],
			deficits: [],
		},
		moduleStats: {
			"packages/shared-runtime/src/child-env.ts": {
				total: 20,
				killed: 20,
				survived: 0,
				killRatio: 100,
			},
			"packages/shared-runtime/src/job-queue.ts": {
				total: 20,
				killed: 16,
				survived: 4,
				killRatio: 80,
			},
			"packages/shared-runtime/src/path-utils.ts": {
				total: 20,
				killed: 16,
				survived: 4,
				killRatio: 80,
			},
			"services/mcp-server/src/tools/generate.ts": {
				total: 20,
				killed: 18,
				survived: 2,
				killRatio: 90,
			},
			"services/mcp-server/src/tools/refine.ts": {
				total: 20,
				killed: 18,
				survived: 2,
				killRatio: 90,
			},
		},
		operatorStats: {
			"enum-substitution": {
				total: 50,
				killed: 45,
				survived: 5,
				killRatio: 90,
			},
			"template-elision": {
				total: 50,
				killed: 40,
				survived: 10,
				killRatio: 80,
			},
		},
		...overrides,
	};
}

function readVitestThresholdPolicy() {
	const rawThresholds = vitestConfig.test?.coverage?.thresholds as
		| Record<string, unknown>
		| undefined;

	expect(typeof rawThresholds).toBe("object");
	expect(rawThresholds).not.toBeNull();

	const globalThresholds = {
		statements: Number(rawThresholds?.statements),
		functions: Number(rawThresholds?.functions),
		lines: Number(rawThresholds?.lines),
		branches: Number(rawThresholds?.branches),
	};

	const keyModuleThresholds = Object.fromEntries(
		Object.entries(rawThresholds ?? {}).filter(
			([key, value]) =>
				(key.startsWith("services/mcp-server/src/") ||
					key.startsWith("packages/")) &&
				typeof value === "object" &&
				value !== null,
		),
	);

	return {
		globalThresholds,
		keyModuleThresholds,
	};
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("check-core-coverage gate", () => {
	it("keeps vitest and script coverage threshold policy in sync", () => {
		const { globalThresholds, keyModuleThresholds } =
			readVitestThresholdPolicy();

		expect(globalThresholds).toEqual(GLOBAL_THRESHOLDS);
		expect(keyModuleThresholds).toEqual(KEY_MODULE_THRESHOLDS);
	});

	it("passes when global and key-module thresholds are met", async () => {
		const summaryPath = await writeSummaryFile({
			total: {
				statements: metric(95),
				branches: metric(95),
				functions: metric(95),
				lines: metric(95),
			},
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(96),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(95),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(99),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({ mutationScore: 85 }),
				null,
				2,
			),
			"utf8",
		);

		const result = runCoverageGate(summaryPath, {
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"global statements/functions/lines/branches>=95%; key modules>=95%",
		);
	});

	it("fails when global coverage falls below 95% for statements/functions/lines", async () => {
		const summaryPath = await writeSummaryFile({
			total: {
				statements: metric(84),
				branches: metric(95),
				functions: metric(95),
				lines: metric(95),
			},
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("global statements 84.00% < 95.00%");
	});

	it("fails when global branch coverage falls below 95%", async () => {
		const summaryPath = await writeSummaryFile({
			total: {
				statements: metric(95),
				branches: metric(84),
				functions: metric(95),
				lines: metric(95),
			},
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("global branches 84.00% < 95.00%");
	});

	it("fails when a key module drops below 95%", async () => {
		const summaryPath = await writeSummaryFile({
			total: entry(96),
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(94),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"packages/shared-runtime/src/path-utils.ts branches 94.00% < 95.00%",
		);
	});

	it("fails when a required key module entry is missing", async () => {
		const summaryPath = await writeSummaryFile({
			total: entry(96),
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"services/mcp-server/src/tools/refine.ts has no coverage entry",
		);
	});

	it("fails on ambiguous key-module entries to prevent suffix hijack", async () => {
		const summaryPath = await writeSummaryFile({
			total: entry(96),
			"/fake/packages/shared-runtime/src/child-env.ts": entry(99),
			"/repo/packages/shared-runtime/src/child-env.ts": entry(60),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"packages/shared-runtime/src/child-env.ts has ambiguous coverage entries",
		);
	});

	it("fails when total coverage metric has zero total (empty-coverage bypass)", async () => {
		const summaryPath = await writeSummaryFile({
			total: {
				statements: metric(100, 0),
				branches: metric(100),
				functions: metric(100),
				lines: metric(100),
			},
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("global statements has total=0");
	});

	it("allows key-module branch metric with total=0 when covered is also 0", async () => {
		const summaryPath = await writeSummaryFile({
			total: {
				statements: metric(95),
				branches: metric(95),
				functions: metric(95),
				lines: metric(95),
			},
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": {
				statements: metric(100),
				branches: metric(100, 0),
				functions: metric(100),
				lines: metric(100),
			},
			"/repo/services/mcp-server/src/tools/refine.ts": {
				statements: metric(100),
				branches: metric(100, 0),
				functions: metric(100),
				lines: metric(100),
			},
		});

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("key modules>=95%");
	});

	it("fails when summary is stale to prevent replaying old coverage", async () => {
		const summaryPath = await writeSummaryFile({
			total: entry(96),
			"/repo/packages/shared-runtime/src/child-env.ts": entry(100),
			"/repo/packages/shared-runtime/src/job-queue.ts": entry(100),
			"/repo/packages/shared-runtime/src/path-utils.ts": entry(100),
			"/repo/services/mcp-server/src/tools/generate.ts": entry(100),
			"/repo/services/mcp-server/src/tools/refine.ts": entry(100),
		});

		const staleTimestampSeconds = (Date.now() - 16 * 60_000) / 1000;
		await fs.utimes(summaryPath, staleTimestampSeconds, staleTimestampSeconds);

		const result = runCoverageGate(summaryPath);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Coverage summary is stale");
	});

	it("fails mutation-only mode when mutation score is lower than minimum threshold", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({ mutationScore: 65 }),
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Mutation gate failed");
		expect(result.stderr).toContain("mutation score 65.00% < 80.00%");
	});

	it("passes mutation-only mode when score meets threshold", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({
					mutationScore: 82,
					total: { killed: 82, total: 100 },
				}),
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("mutation score 82.00% >= 80.00%");
	});

	it("fails mutation-only mode when module min-samples fail under default enforcement", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				{
					...buildHealthyMutationSummary(),
					moduleSampling: {
						status: "fail",
						enforcement: "report-only",
						minSamplesPerModule: 2,
						deficits: [
							{
								module: "packages/shared-runtime/src/path-utils.ts",
								actual: 1,
								required: 2,
							},
						],
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Mutation gate failed");
		expect(result.stderr).toContain("default enforcement");
		expect(result.stderr).toContain("OPENUI_MUTATION_ENFORCE_MIN_SAMPLES=0");
	});

	it("keeps mutation-only mode report-only when downgrade switch is explicitly enabled", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				{
					...buildHealthyMutationSummary(),
					moduleSampling: {
						status: "fail",
						enforcement: "blocking",
						minSamplesPerModule: 2,
						deficits: [
							{
								module: "packages/shared-runtime/src/path-utils.ts",
								actual: 1,
								required: 2,
							},
						],
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
			OPENUI_MUTATION_ENFORCE_MIN_SAMPLES: "0",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("module sampling status=fail");
		expect(result.stdout).toContain("enforcement=blocking");
	});

	it("keeps mutation-only mode blocking when enforcement switch is explicitly set to 1", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				{
					...buildHealthyMutationSummary(),
					moduleSampling: {
						status: "fail",
						enforcement: "blocking",
						minSamplesPerModule: 2,
						deficits: [
							{
								module: "packages/shared-runtime/src/path-utils.ts",
								actual: 1,
								required: 2,
							},
						],
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
			OPENUI_MUTATION_ENFORCE_MIN_SAMPLES: "1",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Mutation gate failed");
		expect(result.stderr).toContain("default enforcement");
	});

	it("fails mutation-only mode when mutation summary is missing by default", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const missingSummaryPath = path.join(mutationDir, "missing-summary.json");

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: missingSummaryPath,
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Mutation gate failed");
		expect(result.stderr).toContain("OPENUI_ALLOW_MUTATION_SKIP=1");
	});

	it("allows local mutation-only bypass when summary is missing and explicit skip switch is set", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const missingSummaryPath = path.join(mutationDir, "missing-summary.json");

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: missingSummaryPath,
			OPENUI_ALLOW_MUTATION_SKIP: "1",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"skipped locally via OPENUI_ALLOW_MUTATION_SKIP=1",
		);
	});

	it("keeps mutation summary mandatory in CI even when skip switch is set", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const missingSummaryPath = path.join(mutationDir, "missing-summary.json");

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: missingSummaryPath,
			OPENUI_ALLOW_MUTATION_SKIP: "1",
			CI: "true",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Mutation gate failed");
		expect(result.stderr).toContain("ignored in CI");
	});

	it("fails mutation-only mode when module kill ratio for key modules is below threshold", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({
					moduleStats: {
						...buildHealthyMutationSummary().moduleStats,
						"packages/shared-runtime/src/path-utils.ts": {
							total: 20,
							killed: 10,
							survived: 10,
							killRatio: 50,
						},
					},
				}),
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("module kill-ratio gate failed");
		expect(result.stderr).toContain("packages/shared-runtime/src/path-utils.ts");
	});

	it("fails mutation-only mode when operator sampling fails under default enforcement", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({
					operatorSampling: {
						status: "fail",
						enforcement: "blocking",
						minSamplesPerOperator: 2,
						requiredOperators: ["enum-substitution"],
						deficits: [
							{ operator: "enum-substitution", actual: 1, required: 2 },
						],
					},
				}),
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("operator sampling failed");
	});

	it("fails mutation-only mode when total mutation sample size is below floor", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({
					total: { total: 8, killed: 8, survived: 0 },
				}),
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("sample size 8 < 24");
	});

	it("fails mutation-only mode when quick mutation sample size is below quick floor", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({
					mode: "quick",
					total: { total: 7, killed: 7, survived: 0 },
				}),
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("sample size 7 < 8 for mode=quick");
	});

	it("passes mutation-only mode when quick mutation sample size meets quick floor", async () => {
		const mutationDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-mutation-gate-"),
		);
		tempDirs.push(mutationDir);
		const mutationSummaryPath = path.join(mutationDir, "mutation-summary.json");
		await fs.writeFile(
			mutationSummaryPath,
			JSON.stringify(
				buildHealthyMutationSummary({
					mode: "quick",
					total: { total: 8, killed: 8, survived: 0 },
					mutationScore: 100,
				}),
				null,
				2,
			),
			"utf8",
		);

		const result = runMutationGate({
			OPENUI_MUTATION_SUMMARY_PATH: mutationSummaryPath,
			OPENUI_MUTATION_MIN_SCORE: "80",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("total=8/8");
	});
});
