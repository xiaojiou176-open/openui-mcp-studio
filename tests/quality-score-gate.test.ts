import { describe, expect, it } from "vitest";
import {
	applyQualityScoreGateToSummary,
	isQualityScoreBypassEnabled,
	parseQualityScoreThresholdFromEnv,
	runQualityScoreGate,
} from "../tooling/ci-gate.mjs";
import {
	DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD,
	generateQualityScoreFromSummary,
} from "../tooling/quality-score.mjs";

const MINIMAL_SUMMARY = {
	ok: true,
	exitCode: 0,
	stages: [],
};

describe("quality-score gate", () => {
	it("passes when score meets default threshold", async () => {
		const result = await runQualityScoreGate({
			summary: MINIMAL_SUMMARY,
			summaryPath: ".runtime-cache/ci-gate/summary.json",
			generateReport: () => ({ overall: { score: 92 } }),
			writeReport: async () => {},
		});

		expect(result.ok).toBe(true);
		expect(result.bypassed).toBe(false);
		expect(result.reason).toBe("passed");
		expect(result.score).toBe(92);
		expect(result.threshold).toBe(DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD);
	});

	it("blocks by default when quality-score generation fails", async () => {
		const result = await runQualityScoreGate({
			summary: MINIMAL_SUMMARY,
			summaryPath: ".runtime-cache/ci-gate/summary.json",
			generateReport: () => {
				throw new Error("quality-score artifact missing");
			},
			writeReport: async () => {},
		});

		expect(result.ok).toBe(false);
		expect(result.bypassed).toBe(false);
		expect(result.reason).toBe("generation_failed");
		expect(result.detail).toContain("artifact missing");
	});

	it("blocks when score is below threshold", async () => {
		const result = await runQualityScoreGate({
			summary: MINIMAL_SUMMARY,
			summaryPath: ".runtime-cache/ci-gate/summary.json",
			generateReport: () => ({ overall: { score: 70 } }),
			writeReport: async () => {},
		});

		expect(result.ok).toBe(false);
		expect(result.bypassed).toBe(false);
		expect(result.reason).toBe("below_threshold");
		expect(result.detail).toContain("70");
	});

	it("supports explicit emergency bypass switch", async () => {
		const result = await runQualityScoreGate({
			summary: MINIMAL_SUMMARY,
			summaryPath: ".runtime-cache/ci-gate/summary.json",
			bypass: true,
			generateReport: () => ({ overall: { score: 65 } }),
			writeReport: async () => {},
		});

		expect(result.ok).toBe(true);
		expect(result.bypassed).toBe(true);
		expect(result.reason).toBe("below_threshold_bypassed");
		expect(result.score).toBe(65);
	});
});

describe("quality-score gate config", () => {
	it("parses threshold with clamp and fallback", () => {
		expect(parseQualityScoreThresholdFromEnv({})).toBe(
			DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD,
		);
		expect(
			parseQualityScoreThresholdFromEnv({ OPENUI_QUALITY_SCORE_MIN: "91" }),
		).toBe(91);
		expect(
			parseQualityScoreThresholdFromEnv({
				OPENUI_QUALITY_SCORE_MIN: "not-a-number",
			}),
		).toBe(DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD);
		expect(
			parseQualityScoreThresholdFromEnv({ OPENUI_QUALITY_SCORE_MIN: "999" }),
		).toBe(100);
		expect(
			parseQualityScoreThresholdFromEnv({ OPENUI_QUALITY_SCORE_MIN: "-5" }),
		).toBe(0);
	});

	it("parses emergency bypass switch values", () => {
		expect(isQualityScoreBypassEnabled({})).toBe(false);
		expect(
			isQualityScoreBypassEnabled({ OPENUI_ALLOW_QUALITY_SCORE_BYPASS: "1" }),
		).toBe(true);
		expect(
			isQualityScoreBypassEnabled({
				OPENUI_ALLOW_QUALITY_SCORE_BYPASS: "true",
			}),
		).toBe(true);
		expect(
			isQualityScoreBypassEnabled({ OPENUI_ALLOW_QUALITY_SCORE_BYPASS: "no" }),
		).toBe(false);
	});
});

describe("quality-score summary merge", () => {
	it("forces final summary failure when quality-score gate fails", () => {
		const summary = {
			ok: true,
			exitCode: 0,
			stages: [],
		};
		const qualityScoreGate = {
			ok: false,
			bypassed: false,
			reason: "below_threshold",
			detail: "quality score 70 < threshold 80",
			threshold: 80,
			score: 70,
		};

		const merged = applyQualityScoreGateToSummary(summary, qualityScoreGate);

		expect(merged.ok).toBe(false);
		expect(merged.exitCode).toBe(1);
		expect(merged.qualityScoreGate).toEqual(qualityScoreGate);
	});
});

describe("quality-score component presence", () => {
	const summaryMissingRequired = {
		ok: true,
		exitCode: 0,
		stages: [
			{
				id: "fast",
				tasks: [
					{ id: "lint", status: "passed", command: "npm run lint" },
					{
						id: "typecheck",
						status: "passed",
						command: "npm run typecheck",
					},
					{
						id: "coreCoverageGate",
						status: "passed",
						command: "npm run test:coverage",
					},
				],
			},
			{
				id: "e2e",
				tasks: [
					{ id: "testE2E", status: "passed", command: "npm run test:e2e" },
				],
			},
		],
	};

	const summaryMissingMutationOnly = {
		ok: true,
		exitCode: 0,
		stages: [
			{
				id: "fast",
				tasks: [
					{ id: "test", status: "passed", command: "npm run test" },
					{ id: "lint", status: "passed", command: "npm run lint" },
					{
						id: "typecheck",
						status: "passed",
						command: "npm run typecheck",
					},
					{
						id: "coreCoverageGate",
						status: "passed",
						command: "npm run test:coverage",
					},
				],
			},
			{
				id: "e2e",
				tasks: [
					{ id: "testE2E", status: "passed", command: "npm run test:e2e" },
				],
			},
		],
	};

	it("marks overall fail when a required bucket is missing", () => {
		const report = generateQualityScoreFromSummary(summaryMissingRequired, {
			summaryPath: ".runtime-cache/ci-gate/summary.json",
		});

		expect(report.components.tests.status).toBe("missing");
		expect(report.overall.requiredComponentsMissing).toContain("tests");
		expect(report.overall.score).toBe(0);
		expect(report.overall.status).toBe("fail");
	});

	it("blocks gate when required bucket is missing", async () => {
		const result = await runQualityScoreGate({
			summary: summaryMissingRequired,
			summaryPath: ".runtime-cache/ci-gate/summary.json",
			generateReport: generateQualityScoreFromSummary,
			writeReport: async () => {},
		});

		expect(result.ok).toBe(false);
		expect(result.reason).toBe("below_threshold");
		expect(result.score).toBe(0);
	});

	it("does not fail when only optional mutation bucket is missing", () => {
		const report = generateQualityScoreFromSummary(summaryMissingMutationOnly, {
			summaryPath: ".runtime-cache/ci-gate/summary.json",
		});

		expect(report.components.mutation.status).toBe("not_present");
		expect(report.overall.requiredComponentsMissing).not.toContain("mutation");
		expect(report.overall.score).toBeGreaterThanOrEqual(85);
		expect(report.overall.status).toBe("pass");
	});
});
