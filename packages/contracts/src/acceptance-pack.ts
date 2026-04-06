export type AcceptanceCriterionKind =
	| "quality_gate"
	| "smoke"
	| "responsive"
	| "a11y"
	| "visual"
	| "manual_review";

export type AcceptanceCriterionSource = "input" | "heuristic" | "generated";
export type AcceptanceEvaluationMode = "automatic" | "manual";

export type AcceptanceCriterion = {
	id: string;
	label: string;
	description: string;
	kind: AcceptanceCriterionKind;
	source: AcceptanceCriterionSource;
	required: boolean;
	evaluationMode?: AcceptanceEvaluationMode;
	sourceReason?: string;
};

export type AcceptancePack = {
	version: 1;
	prompt: string;
	criteria: AcceptanceCriterion[];
	unresolvedAssumptions: string[];
	recommendedChecks: string[];
};

export type AcceptanceCriterionStatus =
	| "auto_passed"
	| "auto_failed"
	| "manual_required"
	| "not_run"
	| "blocked";

export type AcceptanceCriterionResult = {
	id: string;
	status: AcceptanceCriterionStatus;
	reason: string;
	evaluationMode?: AcceptanceEvaluationMode;
	source?: AcceptanceCriterionSource;
	required?: boolean;
	evidence?: string[];
};

export type AcceptanceEvaluationVerdict =
	| "passed"
	| "manual_review_required"
	| "failed"
	| "blocked";

export type AcceptanceEvaluation = {
	version: 1;
	verdict: AcceptanceEvaluationVerdict;
	passed: boolean;
	results: AcceptanceCriterionResult[];
	summary: {
		total: number;
		autoPassed: number;
		autoFailed: number;
		manualRequired: number;
		notRun: number;
		blocked: number;
	};
};
