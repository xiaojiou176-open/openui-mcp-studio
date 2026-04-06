import type { AcceptanceEvaluation, AcceptancePack } from "./types.js";
import { evaluateAcceptanceCriterion } from "./assertions.js";

export function evaluateAcceptancePack(input: {
	pack: AcceptancePack;
	qualityPassed: boolean;
	smokePassed?: boolean;
}): AcceptanceEvaluation {
	const results = input.pack.criteria.map((criterion) =>
		evaluateAcceptanceCriterion({
			criterion,
			qualityPassed: input.qualityPassed,
			smokePassed: input.smokePassed,
		}),
	);

	const summary = {
		total: results.length,
		autoPassed: results.filter((item) => item.status === "auto_passed").length,
		autoFailed: results.filter((item) => item.status === "auto_failed").length,
		manualRequired: results.filter((item) => item.status === "manual_required").length,
		notRun: results.filter((item) => item.status === "not_run").length,
		blocked: results.filter((item) => item.status === "blocked").length,
	};
	const verdict =
		summary.blocked > 0
			? "blocked"
			: summary.autoFailed > 0
				? "failed"
				: summary.manualRequired > 0 || summary.notRun > 0
					? "manual_review_required"
					: "passed";

	return {
		version: 1,
		verdict,
		passed: verdict === "passed",
		results,
		summary,
	};
}
