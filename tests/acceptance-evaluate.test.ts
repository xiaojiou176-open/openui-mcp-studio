import { describe, expect, it, vi } from "vitest";
import { evaluateAcceptanceCriterion } from "../services/mcp-server/src/acceptance/assertions.js";
import { evaluateAcceptancePack } from "../services/mcp-server/src/acceptance/evaluate.js";

describe("acceptance evaluation", () => {
	it("covers automatic and manual criterion outcomes", () => {
		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "quality",
					label: "Quality",
					description: "must pass quality",
					kind: "quality_gate",
					source: "generated",
					required: true,
					evaluationMode: "automatic",
					sourceReason: "generated",
				},
				qualityPassed: false,
			}),
		).toMatchObject({
			status: "auto_failed",
			evaluationMode: "automatic",
		});

		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "smoke",
					label: "Smoke",
					description: "must pass smoke",
					kind: "smoke",
					source: "generated",
					required: true,
					evaluationMode: "automatic",
					sourceReason: "generated",
				},
				qualityPassed: true,
			}),
		).toMatchObject({
			status: "not_run",
		});

		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "review",
					label: "Review",
					description: "manual review",
					kind: "manual_review",
					source: "input",
					required: true,
					evaluationMode: "manual",
					sourceReason: "input",
				},
				qualityPassed: true,
			}),
		).toMatchObject({
			status: "manual_required",
			evaluationMode: "manual",
		});
	});

	it("covers smoke failure and manual fallback evaluation mode", () => {
		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "smoke-fail",
					label: "Smoke fail",
					description: "smoke check failed",
					kind: "smoke",
					source: "generated",
					required: true,
					evaluationMode: "automatic",
				},
				qualityPassed: true,
				smokePassed: false,
			}),
		).toMatchObject({
			status: "auto_failed",
			reason: "Smoke verification failed.",
		});

		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "manual-default",
					label: "Manual default",
					description: "manual review without explicit mode",
					kind: "manual_review",
					source: "input",
					required: true,
				},
				qualityPassed: true,
			}),
		).toMatchObject({
			status: "manual_required",
			evaluationMode: "manual",
		});
	});

	it("returns manual review required when manual and not-run checks remain", () => {
		const evaluation = evaluateAcceptancePack({
			pack: {
				version: 1,
				prompt: "Create a hero",
				criteria: [
					{
						id: "quality",
						label: "Quality",
						description: "must pass quality",
						kind: "quality_gate",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
					{
						id: "smoke",
						label: "Smoke",
						description: "must pass smoke",
						kind: "smoke",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
						sourceReason: "generated",
					},
					{
						id: "review",
						label: "Review",
						description: "manual review",
						kind: "manual_review",
						source: "generated",
						required: true,
						evaluationMode: "manual",
						sourceReason: "generated",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["quality_gate", "manual_review"],
			},
			qualityPassed: true,
		});

		expect(evaluation).toMatchObject({
			verdict: "manual_review_required",
			passed: false,
			summary: {
				autoPassed: 1,
				manualRequired: 1,
				notRun: 1,
				blocked: 0,
			},
		});
	});

	it("covers passed and failed aggregate verdicts plus smoke success", () => {
		expect(
			evaluateAcceptanceCriterion({
				criterion: {
					id: "smoke-pass",
					label: "Smoke pass",
					description: "smoke check passed",
					kind: "smoke",
					source: "generated",
					required: true,
					evaluationMode: "automatic",
				},
				qualityPassed: true,
				smokePassed: true,
			}),
		).toMatchObject({
			status: "auto_passed",
			reason: "Smoke verification passed.",
		});

		const passedEvaluation = evaluateAcceptancePack({
			pack: {
				version: 1,
				prompt: "Create a simple hero",
				criteria: [
					{
						id: "quality",
						label: "Quality",
						description: "must pass quality",
						kind: "quality_gate",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["quality_gate"],
			},
			qualityPassed: true,
		});
		expect(passedEvaluation.verdict).toBe("passed");
		expect(passedEvaluation.passed).toBe(true);

		const failedEvaluation = evaluateAcceptancePack({
			pack: {
				version: 1,
				prompt: "Create a risky hero",
				criteria: [
					{
						id: "quality",
						label: "Quality",
						description: "must pass quality",
						kind: "quality_gate",
						source: "generated",
						required: true,
						evaluationMode: "automatic",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["quality_gate"],
			},
			qualityPassed: false,
		});
		expect(failedEvaluation.verdict).toBe("failed");
		expect(failedEvaluation.summary.autoFailed).toBe(1);
	});

	it("respects blocked results when acceptance evaluation receives a blocked criterion", async () => {
		vi.resetModules();
		vi.doMock("../services/mcp-server/src/acceptance/assertions.js", () => ({
			evaluateAcceptanceCriterion: vi.fn(() => ({
				id: "manual",
				status: "blocked",
				reason: "Waiting for operator approval.",
				evaluationMode: "manual",
				source: "input",
				required: true,
			})),
		}));

		const { evaluateAcceptancePack: evaluateBlockedPack } = await import(
			"../services/mcp-server/src/acceptance/evaluate.js"
		);

		const evaluation = evaluateBlockedPack({
			pack: {
				version: 1,
				prompt: "Create a gated flow",
				criteria: [
					{
						id: "manual",
						label: "Manual approval",
						description: "requires human approval",
						kind: "manual_review",
						source: "input",
						required: true,
						evaluationMode: "manual",
					},
				],
				unresolvedAssumptions: [],
				recommendedChecks: ["manual_review"],
			},
			qualityPassed: true,
		});

		expect(evaluation.verdict).toBe("blocked");
		expect(evaluation.summary.blocked).toBe(1);
		vi.doUnmock("../services/mcp-server/src/acceptance/assertions.js");
	});
});
