import type { AcceptanceCriterion, AcceptanceCriterionResult } from "./types.js";

export function evaluateAcceptanceCriterion(input: {
	criterion: AcceptanceCriterion;
	qualityPassed: boolean;
	smokePassed?: boolean;
}): AcceptanceCriterionResult {
	const { criterion } = input;
	if (criterion.kind === "quality_gate") {
		return {
			id: criterion.id,
			status: input.qualityPassed ? "auto_passed" : "auto_failed",
			reason: input.qualityPassed
				? "Generic quality gate passed."
				: "Generic quality gate failed.",
			evaluationMode: "automatic",
			source: criterion.source,
			required: criterion.required,
			evidence: ["quality_gate"],
		};
	}

	if (criterion.kind === "smoke") {
		if (typeof input.smokePassed === "boolean") {
			return {
				id: criterion.id,
				status: input.smokePassed ? "auto_passed" : "auto_failed",
				reason: input.smokePassed
					? "Smoke verification passed."
					: "Smoke verification failed.",
				evaluationMode: "automatic",
				source: criterion.source,
				required: criterion.required,
				evidence: ["smoke"],
			};
		}
		return {
			id: criterion.id,
			status: "not_run",
			reason: "Smoke verification was not executed.",
			evaluationMode: "automatic",
			source: criterion.source,
			required: criterion.required,
			evidence: ["smoke"],
		};
	}

	return {
		id: criterion.id,
		status: "manual_required",
		reason: "This criterion still requires human review.",
		evaluationMode: criterion.evaluationMode || "manual",
		source: criterion.source,
		required: criterion.required,
	};
}
