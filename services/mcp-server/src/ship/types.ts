import type { FunctionResponseInput } from "../providers/types.js";
import type { AcceptanceEvaluation, AcceptancePack } from "../../../../packages/contracts/src/acceptance-pack.js";
import type {
	FeatureFlowAcceptanceAggregate,
	FeatureFlowExecutionArtifacts,
	FeatureFlowExecutionSummary,
	FeatureFlowQualityAggregate,
	FeatureFlowRouteExecutionResult,
} from "../../../../packages/contracts/src/feature-flow.js";
import type { ChangePlan, ReviewBundle } from "../../../../packages/contracts/src/review-bundle.js";
import type { WorkspaceProfile } from "../../../../packages/contracts/src/workspace-profile.js";

export type TelemetryStepStatus = "ok" | "error";

export type TelemetryStep = {
	name: string;
	status: TelemetryStepStatus;
	durationMs: number;
	error?: string;
};

export type ShipSummaryStatus = "success" | "quality_failed";

export type ShipSummary = {
	filesCount: number;
	changedPaths: string[];
	qualityGate: boolean;
	status: ShipSummaryStatus;
	idempotencyHit: boolean;
};

export type ShipPayloadBase = {
	workspaceRoot: string;
	detection: unknown;
	html: string;
	files: Array<{ path: string; content: string }>;
	notes: string[] | undefined;
	apply: {
		targetRoot: string;
		dryRun: boolean;
		rollbackOnError: boolean;
		plan: Array<{ path: string; status: "create" | "update" }>;
		written?: string[];
		rolledBack?: boolean;
		rollbackDetails?: Array<{ path: string; status: string; message?: string }>;
		rollbackReason?: "quality_gate_failed";
	};
	quality: {
		passed: boolean;
		issues: Array<{ severity: string; rule: string; path: string; message: string }>;
		commandResults: Array<{
			name: string;
			command: string;
			status: string;
			exitCode: number | null;
			stdout: string;
			stderr: string;
			durationMs: number;
			reason?: string;
		}>;
		checkedFiles: string[];
	};
	workspaceProfile?: WorkspaceProfile;
	changePlan?: ChangePlan;
	acceptancePack?: AcceptancePack;
	acceptanceEvaluation?: AcceptanceEvaluation;
	reviewBundle?: ReviewBundle;
	artifacts?: Record<string, string>;
};

export type ShipExecutionInput = {
	prompt: string;
	pagePath: string;
	componentsDir: string;
	uiImportBase?: string;
	styleGuide?: string;
	model?: string;
	workspaceRoot: string;
	idempotencyKey?: string;
	thinkingLevel?: "low" | "high";
	includeThoughts?: boolean;
	responseMimeType?: string;
	responseJsonSchema?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	toolChoice?: string | Record<string, unknown>;
	functionResponses?: FunctionResponseInput[];
	cachedContent?: string;
	cacheTtlSeconds?: number;
	mediaResolution?: "low" | "medium" | "high" | "ultra_high";
	uiuxScore?: number;
	uiuxThreshold?: number;
	dryRun: boolean;
	runCommands: boolean;
	acceptanceCriteria?: string[];
	responsiveRequirements?: string[];
	a11yRequirements?: string[];
	visualRequirements?: string[];
	manualReviewItems?: string[];
	emitArtifacts?: boolean;
	emitReviewBundle?: boolean;
	artifactSubdirSegments?: string[];
};

export type FeatureFlowRouteExecution = {
	id: string;
	pagePath: string;
	result: ShipPayloadBase;
	summary: ShipSummary;
	steps: TelemetryStep[];
	artifacts?: {
		artifactDir?: string;
		files?: Record<string, string>;
	};
};

export type FeatureFlowExecutionResult = {
	version: 1;
	name: string;
	description?: string;
	plan?: import("../../../../packages/contracts/src/feature-flow.js").FeatureFlowPlanSummary;
	routes: FeatureFlowRouteExecutionResult[];
	summary: FeatureFlowExecutionSummary;
	quality?: FeatureFlowQualityAggregate;
	acceptance?: FeatureFlowAcceptanceAggregate;
	reviewBundle?: ReviewBundle;
	artifacts?: FeatureFlowExecutionArtifacts;
};

export type ShipCoreTestExports = {
	buildSummary: (
		payload: ShipPayloadBase,
		idempotencyHit: boolean,
	) => ShipSummary;
	rollbackWrittenFiles: (
		targetRoot: string,
		writtenPaths: string[],
		snapshots: Map<string, { path: string; existed: boolean; previousContent?: string }>,
		writtenContentByPath: Map<string, string>,
	) => Promise<{ rolledBack: boolean; rollbackDetails: Array<{ path: string; status: string; message?: string }> }>;
	snapshotFiles: (
		targetRoot: string,
		paths: string[],
	) => Promise<Map<string, { path: string; existed: boolean; previousContent?: string }>>;
};
