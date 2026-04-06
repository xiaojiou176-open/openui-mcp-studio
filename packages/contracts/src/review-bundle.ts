import type { AcceptanceEvaluation, AcceptancePack } from "./acceptance-pack.js";
import type { WorkspaceProfile } from "./workspace-profile.js";
import type { WorkspaceSignalConfidence } from "./workspace-profile.js";

export type ChangePlanItemStatus = "create" | "update" | "maybe-touch" | "blocked";
export type ChangePlanItemSource =
	| "input"
	| "workspace"
	| "prompt_heuristic"
	| "system";

export type ChangePlanItem = {
	path: string;
	status: ChangePlanItemStatus;
	reason: string;
	source?: ChangePlanItemSource;
	confidence?: WorkspaceSignalConfidence;
	evidence?: string[];
};

export type ChangePlanHotspot = {
	label: string;
	reason: string;
	severity: "high" | "medium" | "low";
	paths: string[];
	source: ChangePlanItemSource;
};

export type ChangePlan = {
	version: 1;
	prompt: string;
	targetKind: "page" | "feature-flow";
	targetRoot: string;
	recommendedExecutionMode: "dry_run_only" | "apply_safe" | "blocked";
	recommendedExecutionModeReason?: string;
	items: ChangePlanItem[];
	assumptions?: string[];
	riskSummary: string[];
	unresolvedAssumptions: string[];
	reviewFocus?: string[];
	hotspots?: ChangePlanHotspot[];
};

export type ReviewAutoCheck = {
	label: string;
	source: "quality" | "acceptance" | "smoke";
	status: "passed" | "failed" | "not_run";
	details: string;
};

export type ReviewManualFollowUp = {
	label: string;
	reason: string;
	source: "acceptance" | "plan" | "workspace";
	paths?: string[];
};

export type ReviewBundleHotspot = {
	label: string;
	reason: string;
	severity: "high" | "medium" | "low";
	source: "plan" | "workspace" | "quality" | "acceptance";
	paths?: string[];
};

export type ReviewBundleRouteSummary = {
	id: string;
	pagePath: string;
	changedPaths: string[];
	qualityStatus: "passed" | "failed";
	acceptanceVerdict?: AcceptanceEvaluation["verdict"];
	manualFollowUpCount: number;
	unresolvedCount: number;
	artifactDir?: string;
	dominantIssueRules?: string[];
};

export type ReviewBundleSharedImpact = {
	label: string;
	reason: string;
	paths: string[];
};

export type ReviewBundleSummary = {
	changedPathCount: number;
	routeCount?: number;
	failedRouteCount?: number;
	createCount: number;
	updateCount: number;
	maybeTouchCount: number;
	blockedCount: number;
	qualityStatus: "passed" | "failed" | "not_run";
	acceptanceVerdict?: AcceptanceEvaluation["verdict"];
	manualFollowUpCount: number;
	unresolvedCount: number;
};

export type ReviewBundle = {
	version: 1;
	prompt: string;
	workspaceRoot: string;
	targetKind: "page" | "feature-flow";
	changePlan?: ChangePlan;
	workspaceProfile?: WorkspaceProfile;
	acceptancePack?: AcceptancePack;
	acceptanceEvaluation?: AcceptanceEvaluation;
	quality?: {
		passed: boolean;
		issuesCount: number;
		commandFailures: number;
	};
	smoke?: {
		passed: boolean;
		usedTargetRoot?: string;
	};
	changedPaths: string[];
	unresolvedItems: string[];
	summary?: ReviewBundleSummary;
	autoChecks?: ReviewAutoCheck[];
	manualFollowUps?: ReviewManualFollowUp[];
	hotspots?: ReviewBundleHotspot[];
	routeSummaries?: ReviewBundleRouteSummary[];
	sharedImpact?: ReviewBundleSharedImpact[];
};
