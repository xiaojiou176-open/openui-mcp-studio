import type {
	AcceptanceEvaluation,
	AcceptanceEvaluationVerdict,
	AcceptancePack,
} from "./acceptance-pack.js";
import type { ReviewBundle } from "./review-bundle.js";

export type FeatureFlowRouteInput = {
	id: string;
	prompt: string;
	pagePath: string;
	componentsDir?: string;
};

export type FeatureFlowDefinition = {
	version: 1;
	name: string;
	description?: string;
	routes: FeatureFlowRouteInput[];
	layoutPath?: string;
	sharedComponentsDir?: string;
};

export type FeatureFlowPlanSummary = {
	version: 1;
	name: string;
	description?: string;
	routeCount: number;
	routeIds: string[];
	pagePaths: string[];
	sharedComponentsDir: string | null;
	layoutPath: string | null;
};

export type FeatureFlowRouteArtifacts = {
	artifactDir?: string;
	files?: Record<string, string>;
};

export type FeatureFlowRouteQualitySummary = {
	id: string;
	pagePath: string;
	passed: boolean;
	issuesCount: number;
	commandFailures: number;
	dominantIssueRules: string[];
	changedPaths: string[];
};

export type FeatureFlowQualityAggregate = {
	passed: boolean;
	anyFailed: boolean;
	passedRouteCount: number;
	failedRouteCount: number;
	issuesCount: number;
	commandFailures: number;
	dominantIssueRules: string[];
	hotspotPaths: string[];
	routeResults: FeatureFlowRouteQualitySummary[];
};

export type FeatureFlowRouteAcceptanceSummary = {
	id: string;
	pagePath: string;
	verdict: AcceptanceEvaluationVerdict | "not_attached";
	autoFailedCount: number;
	manualRequiredCount: number;
	notRunCount: number;
	blockedCount: number;
};

export type FeatureFlowAcceptanceAggregate = {
	pack?: AcceptancePack;
	evaluation?: AcceptanceEvaluation;
	routeResults: FeatureFlowRouteAcceptanceSummary[];
	unresolvedAssumptions: string[];
	manualFollowUps: string[];
};

export type FeatureFlowRouteExecutionResult = {
	id: string;
	pagePath: string;
	result?: unknown;
	summary?: {
		filesCount: number;
		changedPaths: string[];
		qualityGate: boolean;
		status: "success" | "quality_failed";
		idempotencyHit: boolean;
	};
	steps?: Array<{
		name: string;
		status: "ok" | "error";
		durationMs: number;
		error?: string;
	}>;
	changedPaths: string[];
	qualityStatus: "passed" | "failed";
	acceptanceVerdict?: AcceptanceEvaluationVerdict;
	manualFollowUpCount: number;
	unresolvedCount: number;
	artifactDir?: string;
	dominantIssueRules?: string[];
};

export type FeatureFlowExecutionArtifacts = {
	featureArtifactDir?: string;
	featureFlowPlan?: string;
	featureFlowQuality?: string;
	featureFlowAcceptance?: string;
	featureFlowAcceptancePack?: string;
	featureFlowAcceptanceResult?: string;
	featureFlowReviewBundle?: string;
	featureFlowReviewBundleMarkdown?: string;
	routeArtifacts?: Record<string, FeatureFlowRouteArtifacts>;
};

export type FeatureFlowExecutionSummary = {
	routeCount: number;
	passedRouteCount: number;
	failedRouteCount: number;
	manualFollowUpCount: number;
	hotspotCount: number;
	changedPaths: string[];
};

export type FeatureFlowExecutionResult = {
	version: 1;
	name: string;
	description?: string;
	plan: FeatureFlowPlanSummary;
	routes: FeatureFlowRouteExecutionResult[];
	quality: FeatureFlowQualityAggregate;
	acceptance?: FeatureFlowAcceptanceAggregate;
	reviewBundle?: ReviewBundle;
	artifacts?: FeatureFlowExecutionArtifacts;
	summary: FeatureFlowExecutionSummary;
};
