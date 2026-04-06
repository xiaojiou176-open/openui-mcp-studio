import path from "node:path";
import type { AcceptanceEvaluation, AcceptancePack } from "../../../../packages/contracts/src/acceptance-pack.js";
import type {
	FeatureFlowAcceptanceAggregate,
	FeatureFlowRouteAcceptanceSummary,
	FeatureFlowQualityAggregate,
	FeatureFlowRouteArtifacts,
	FeatureFlowRouteExecutionResult,
	FeatureFlowRouteQualitySummary,
} from "../../../../packages/contracts/src/feature-flow.js";
import type {
	ChangePlan,
	ReviewBundle,
} from "../../../../packages/contracts/src/review-bundle.js";
import { buildFeatureFlowPlan } from "./feature-flow-plan.js";
import type { WorkspaceProfile } from "../../../../packages/contracts/src/workspace-profile.js";
import { buildAcceptancePack, evaluateAcceptancePack } from "../acceptance-pack.js";
import { applyGeneratedFiles } from "../file-ops.js";
import { runQualityGate } from "../quality-gate.js";
import { shipIdempotencyStore } from "../../../../packages/shared-runtime/src/idempotency-store.js";
import { shipJobQueue } from "../../../../packages/shared-runtime/src/job-queue.js";
import { buildChangePlan } from "../plan-change.js";
import { buildReviewBundle, buildReviewBundleMarkdown } from "../review-bundle.js";
import {
	resolveRunArtifactDirectoryRelativePath,
	writeRunArtifactJson,
	writeRunArtifactText,
} from "./artifacts.js";
import type {
	FeatureFlowExecutionResult,
	FeatureFlowRouteExecution,
	ShipCoreTestExports,
	ShipExecutionInput,
	ShipPayloadBase,
	ShipSummary,
	TelemetryStep,
} from "./types.js";
import {
	PIPELINE_SAFETY_TIMEOUT_MS,
	deriveImplicitIdempotencyKey,
	isReusableCachedPayload,
	runSingleFlightByKey,
} from "./idempotency.js";
import { rollbackWrittenFiles, snapshotFiles } from "./rollback.js";
import { buildSummary } from "./summary.js";
import { runBestEffortStep, runRequiredStep } from "./telemetry.js";
import {
	convertHtmlToReactShadcn,
	requestHtmlFromPrompt,
	resolveShadcnStyleGuide,
} from "../tools/shared.js";
import { scanWorkspaceProfile } from "../workspace-profile.js";

type PipelineResult = {
	payload: ShipPayloadBase;
	idempotencyHit: boolean;
};
const IDEMPOTENCY_WAIT_TIMEOUT_MS = PIPELINE_SAFETY_TIMEOUT_MS;

async function buildShipArtifacts(input: {
	workspaceRoot: string;
	workspaceProfile?: WorkspaceProfile;
	changePlan?: ChangePlan;
	acceptancePack?: AcceptancePack;
	acceptanceEvaluation?: AcceptanceEvaluation;
	reviewBundle?: ReviewBundle;
	artifactSubdirSegments?: string[];
	includeArtifactDir?: boolean;
}): Promise<Record<string, string>> {
	const artifacts: Record<string, string> = {};
	if (input.includeArtifactDir) {
		artifacts.artifactDir = resolveRunArtifactDirectoryRelativePath(
			input.artifactSubdirSegments,
		);
	}
	if (input.workspaceProfile) {
		const artifactPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			name: "workspace-profile",
			payload: input.workspaceProfile,
			subdirSegments: input.artifactSubdirSegments,
		});
		if (artifactPath) {
			artifacts.workspaceProfile = artifactPath;
		}
	}
	if (input.changePlan) {
		const artifactPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			name: "change-plan",
			payload: input.changePlan,
			subdirSegments: input.artifactSubdirSegments,
		});
		if (artifactPath) {
			artifacts.changePlan = artifactPath;
		}
	}
	if (input.acceptancePack) {
		const artifactPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			name: "acceptance-pack",
			payload: input.acceptancePack,
			subdirSegments: input.artifactSubdirSegments,
		});
		if (artifactPath) {
			artifacts.acceptancePack = artifactPath;
		}
	}
	if (input.acceptanceEvaluation) {
		const artifactPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			name: "acceptance-result",
			payload: input.acceptanceEvaluation,
			subdirSegments: input.artifactSubdirSegments,
		});
		if (artifactPath) {
			artifacts.acceptanceResult = artifactPath;
		}
	}
	if (input.reviewBundle) {
		const jsonPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			name: "review-bundle",
			payload: input.reviewBundle,
			subdirSegments: input.artifactSubdirSegments,
		});
		const markdownPath = await writeRunArtifactText({
			workspaceRoot: input.workspaceRoot,
			name: "review-bundle",
			text: buildReviewBundleMarkdown(input.reviewBundle),
			subdirSegments: input.artifactSubdirSegments,
		});
		if (jsonPath) {
			artifacts.reviewBundle = jsonPath;
		}
		if (markdownPath) {
			artifacts.reviewBundleMarkdown = markdownPath;
		}
	}
	return artifacts;
}

function slugifyFeatureSegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32);
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function buildFeatureArtifactSubdirSegments(featureName: string): string[] {
	const featureSlug = slugifyFeatureSegment(featureName) || "feature";
	return ["feature-flow", featureSlug];
}

function buildFeatureFlowRouteSubdirSegments(
	featureArtifactSubdirSegments: string[],
	index: number,
	routeId: string,
): string[] {
	const safeId = slugifyFeatureSegment(routeId) || `route-${index + 1}`;
	return [
		...featureArtifactSubdirSegments,
		"routes",
		`${String(index + 1).padStart(2, "0")}-${safeId}`,
	];
}

function buildFeatureFlowRouteArtifacts(
	artifacts?: Record<string, string>,
): FeatureFlowRouteArtifacts | undefined {
	if (!artifacts || Object.keys(artifacts).length === 0) {
		return undefined;
	}
	return {
		artifactDir: artifacts.artifactDir,
		files: artifacts,
	};
}

function ensureFeatureFlowRouteAcceptance(input: {
	prompt: string;
	payload: ShipPayloadBase;
}): {
	pack: AcceptancePack;
	evaluation: AcceptanceEvaluation;
} {
	const pack =
		input.payload.acceptancePack ||
		buildAcceptancePack({
			prompt: input.prompt,
		});
	const evaluation =
		input.payload.acceptanceEvaluation ||
		evaluateAcceptancePack({
			pack,
			qualityPassed: input.payload.quality.passed,
		});
	return {
		pack,
		evaluation,
	};
}

function buildFeatureFlowRouteReviewBundle(input: {
	prompt: string;
	workspaceRoot: string;
	payload: ShipPayloadBase;
	summary: ShipSummary;
	acceptancePack: AcceptancePack;
	acceptanceEvaluation: AcceptanceEvaluation;
}): ReviewBundle {
	return buildReviewBundle({
		version: 1,
		prompt: input.prompt,
		workspaceRoot: path.resolve(input.workspaceRoot),
		targetKind: "page",
		changePlan: input.payload.changePlan,
		workspaceProfile: input.payload.workspaceProfile,
		acceptancePack: input.acceptancePack,
		acceptanceEvaluation: input.acceptanceEvaluation,
		quality: {
			passed: input.payload.quality.passed,
			issuesCount: input.payload.quality.issues.length,
			commandFailures: input.payload.quality.commandResults.filter(
				(item) => item.status === "failed",
			).length,
		},
		changedPaths: input.summary.changedPaths,
		unresolvedItems: uniqueStrings([
			...(input.payload.changePlan?.unresolvedAssumptions || []),
			...(input.payload.workspaceProfile?.unknowns || []),
		]),
	});
}

function buildFeatureFlowQualityAggregate(
	routes: FeatureFlowRouteExecution[],
): FeatureFlowQualityAggregate {
	const routeResults: FeatureFlowRouteQualitySummary[] = routes.map((route) => {
		const issueRules = uniqueStrings(route.result.quality.issues.map((issue) => issue.rule));
		return {
			id: route.id,
			pagePath: route.pagePath,
			passed: route.result.quality.passed,
			issuesCount: route.result.quality.issues.length,
			commandFailures: route.result.quality.commandResults.filter(
				(item) => item.status === "failed",
			).length,
			dominantIssueRules: issueRules,
			changedPaths: route.summary.changedPaths,
		};
	});
	const failedRouteCount = routeResults.filter((route) => !route.passed).length;
	const issueRules = uniqueStrings(
		routes.flatMap((route) => route.result.quality.issues.map((issue) => issue.rule)),
	);
	return {
		passed: failedRouteCount === 0,
		anyFailed: failedRouteCount > 0,
		passedRouteCount: routeResults.length - failedRouteCount,
		failedRouteCount,
		issuesCount: routes.reduce(
			(total, route) => total + route.result.quality.issues.length,
			0,
		),
		commandFailures: routes.reduce(
			(total, route) =>
				total +
				route.result.quality.commandResults.filter((item) => item.status === "failed")
					.length,
			0,
		),
		dominantIssueRules: issueRules,
		hotspotPaths: uniqueStrings(
			routeResults
				.filter((route) => !route.passed)
				.flatMap((route) => route.changedPaths),
		),
		routeResults,
	};
}

function makeAcceptanceCriterion(input: {
	id: string;
	label: string;
	description: string;
	kind: AcceptancePack["criteria"][number]["kind"];
	source: AcceptancePack["criteria"][number]["source"];
	evaluationMode: AcceptancePack["criteria"][number]["evaluationMode"];
	required?: boolean;
	sourceReason: string;
}): AcceptancePack["criteria"][number] {
	return {
		id: input.id,
		label: input.label,
		description: input.description,
		kind: input.kind,
		source: input.source,
		evaluationMode: input.evaluationMode,
		required: input.required ?? true,
		sourceReason: input.sourceReason,
	};
}

function buildFeatureFlowAcceptanceAggregate(input: {
	name: string;
	layoutPath?: string;
	sharedComponentsDir?: string;
	routes: FeatureFlowRouteExecution[];
	quality: FeatureFlowQualityAggregate;
}): FeatureFlowAcceptanceAggregate {
	const routeResults: FeatureFlowRouteAcceptanceSummary[] = input.routes.map((route) => {
		const evaluation = route.result.acceptanceEvaluation;
		return {
			id: route.id,
			pagePath: route.pagePath,
			verdict: evaluation?.verdict || "not_attached",
			autoFailedCount: evaluation?.summary.autoFailed ?? 0,
			manualRequiredCount: evaluation?.summary.manualRequired ?? 0,
			notRunCount: evaluation?.summary.notRun ?? 0,
			blockedCount: evaluation?.summary.blocked ?? 0,
		};
	});

	const unresolvedAssumptions = uniqueStrings(
		input.routes.flatMap((route) => [
			...(route.result.changePlan?.unresolvedAssumptions || []),
			...(route.result.workspaceProfile?.unknowns || []),
			...(route.result.reviewBundle?.unresolvedItems || []),
		]),
	);

	const manualFollowUps = uniqueStrings([
		...input.routes.flatMap((route) =>
			(route.result.reviewBundle?.manualFollowUps || []).map(
				(item) => `${route.id}: ${item.reason}`,
			),
		),
		...(input.layoutPath
			? [
					`Feature-level review required for shared layout impact at ${input.layoutPath}.`,
				]
			: []),
		...(input.sharedComponentsDir
			? [
					`Feature-level review required for shared components under ${input.sharedComponentsDir}.`,
				]
			: []),
	]);

	const criteria: AcceptancePack["criteria"] = [
		makeAcceptanceCriterion({
			id: "feature-quality-rollup",
			label: "Feature quality rollup",
			description: "All route-level quality gates must pass before the feature package is trusted.",
			kind: "quality_gate",
			source: "generated",
			evaluationMode: "automatic",
			sourceReason: "Derived from route-level quality results.",
		}),
	];

	if (input.routes.length > 1) {
		criteria.push(
			makeAcceptanceCriterion({
				id: "cross-route-consistency-review",
				label: "Cross-route consistency review",
				description:
					"Reviewer must confirm the feature feels coherent across the shipped route set.",
				kind: "manual_review",
				source: "generated",
				evaluationMode: "manual",
				sourceReason: "Feature-level consistency still requires human review.",
			}),
		);
	}
	if (input.layoutPath || input.sharedComponentsDir) {
		criteria.push(
			makeAcceptanceCriterion({
				id: "shared-surface-review",
				label: "Shared surface review",
				description:
					"Reviewer must confirm that shared layout/components impact is acceptable for the feature package.",
				kind: "manual_review",
				source: "generated",
				evaluationMode: "manual",
				sourceReason: "Shared layout/components widen the blast radius beyond one route.",
			}),
		);
	}

	const pack: AcceptancePack = {
		version: 1,
		prompt: input.name,
		criteria,
		unresolvedAssumptions,
		recommendedChecks: ["quality_gate", "manual_review"],
	};
	const evaluation = evaluateAcceptancePack({
		pack,
		qualityPassed: input.quality.passed,
	});

	return {
		pack,
		evaluation,
		routeResults,
		unresolvedAssumptions,
		manualFollowUps,
	};
}

function buildFeatureFlowSharedImpact(input: {
	layoutPath?: string;
	sharedComponentsDir?: string;
	routes: FeatureFlowRouteExecution[];
}): NonNullable<ReviewBundle["sharedImpact"]> {
	const sharedImpact: NonNullable<ReviewBundle["sharedImpact"]> = [];
	if (input.layoutPath) {
		sharedImpact.push({
			label: "shared-layout",
			reason: "Feature definition declares a shared layout, so reviewer attention must extend beyond route-local files.",
			paths: [input.layoutPath],
		});
	}
	if (input.sharedComponentsDir) {
		sharedImpact.push({
			label: "shared-components",
			reason:
				"Feature definition declares a shared component subtree used across routes.",
			paths: [input.sharedComponentsDir],
		});
	}
	const changedPathFrequency = new Map<string, number>();
	for (const route of input.routes) {
		for (const changedPath of route.summary.changedPaths) {
			changedPathFrequency.set(
				changedPath,
				(changedPathFrequency.get(changedPath) || 0) + 1,
			);
		}
	}
	for (const [changedPath, count] of changedPathFrequency.entries()) {
		if (count < 2) {
			continue;
		}
		sharedImpact.push({
			label: "multi-route-touchpoint",
			reason: `The same path appears in ${count} route deliveries, which suggests shared feature-level impact.`,
			paths: [changedPath],
		});
	}
	return sharedImpact;
}

function buildFeatureFlowReviewBundle(input: {
	name: string;
	workspaceRoot: string;
	layoutPath?: string;
	sharedComponentsDir?: string;
	routes: FeatureFlowRouteExecution[];
	quality: FeatureFlowQualityAggregate;
	acceptance: FeatureFlowAcceptanceAggregate;
}): ReviewBundle {
	const changedPaths = uniqueStrings(
		input.routes.flatMap((route) => route.summary.changedPaths),
	);
	const unresolvedItems = uniqueStrings([
		...input.acceptance.unresolvedAssumptions,
		...input.routes.flatMap((route) => route.result.reviewBundle?.unresolvedItems || []),
	]);
	const routeSummaries: NonNullable<ReviewBundle["routeSummaries"]> = input.routes.map(
		(route) => ({
			id: route.id,
			pagePath: route.pagePath,
			changedPaths: route.summary.changedPaths,
			qualityStatus: route.result.quality.passed ? "passed" : "failed",
			acceptanceVerdict: route.result.acceptanceEvaluation?.verdict,
			manualFollowUpCount: route.result.reviewBundle?.manualFollowUps?.length || 0,
			unresolvedCount: route.result.reviewBundle?.unresolvedItems.length || 0,
			artifactDir: route.artifacts?.artifactDir,
			dominantIssueRules: uniqueStrings(
				route.result.quality.issues.map((issue) => issue.rule),
			),
		}),
	);
	const sharedImpact = buildFeatureFlowSharedImpact({
		layoutPath: input.layoutPath,
		sharedComponentsDir: input.sharedComponentsDir,
		routes: input.routes,
	});
	const manualFollowUps = [
		...input.acceptance.manualFollowUps.map((reason) => ({
			label: "Feature-level follow-up",
			reason,
			source: "acceptance" as const,
		})),
		...routeSummaries
			.filter((route) => route.manualFollowUpCount > 0)
			.map((route) => ({
				label: `Route ${route.id}`,
				reason: `${route.manualFollowUpCount} manual follow-up item(s) remain for ${route.pagePath}.`,
				source: "acceptance" as const,
				paths: route.changedPaths,
			})),
	];
	const hotspots = [
		...sharedImpact.map((impact) => ({
			label: impact.label,
			reason: impact.reason,
			severity: "high" as const,
			source: "plan" as const,
			paths: impact.paths,
		})),
		...input.quality.routeResults
			.filter((route) => !route.passed)
			.map((route) => ({
				label: `route-${route.id}-quality`,
				reason: `Route ${route.pagePath} failed quality checks.`,
				severity: "high" as const,
				source: "quality" as const,
				paths: route.changedPaths,
			})),
	];

	return buildReviewBundle({
		version: 1,
		prompt: input.name,
		workspaceRoot: path.resolve(input.workspaceRoot),
		targetKind: "feature-flow",
		acceptancePack: input.acceptance.pack,
		acceptanceEvaluation: input.acceptance.evaluation,
		quality: {
			passed: input.quality.passed,
			issuesCount: input.quality.issuesCount,
			commandFailures: input.quality.commandFailures,
		},
		changedPaths,
		unresolvedItems,
		routeSummaries,
		sharedImpact,
		manualFollowUps,
		hotspots,
	});
}

export async function executeShipPage(input: ShipExecutionInput): Promise<{
	payload: ShipPayloadBase;
	steps: TelemetryStep[];
	summary: ShipSummary;
}> {
	const steps: TelemetryStep[] = [];
	const explicitIdempotencyKey = input.idempotencyKey?.trim() || undefined;

	if (explicitIdempotencyKey) {
		const cachedPayload = await runBestEffortStep(steps, "idempotency_lookup", () =>
			shipIdempotencyStore.get<ShipPayloadBase>(explicitIdempotencyKey),
		);
		if (isReusableCachedPayload(cachedPayload)) {
			return {
				payload: cachedPayload,
				steps,
				summary: buildSummary(cachedPayload, true),
			};
		}
	}

	const resolved = await runRequiredStep(steps, "resolve_style_guide", () =>
		resolveShadcnStyleGuide({
			workspaceRoot: input.workspaceRoot,
			uiImportBase: input.uiImportBase,
			styleGuide: input.styleGuide,
		}),
	);

	const effectiveIdempotencyKey =
		explicitIdempotencyKey ||
		deriveImplicitIdempotencyKey({
			prompt: input.prompt,
			styleGuide: resolved.styleGuide,
			requestedUiImportBase: input.uiImportBase,
			resolvedUiImportBase: resolved.uiImportBase,
			pagePath: input.pagePath,
			componentsDir: input.componentsDir,
			workspaceRoot: input.workspaceRoot,
			model: input.model,
			thinkingLevel: input.thinkingLevel,
			includeThoughts: input.includeThoughts,
			responseMimeType: input.responseMimeType,
			responseJsonSchema: input.responseJsonSchema,
			tools: input.tools,
			toolChoice: input.toolChoice,
			functionResponses: input.functionResponses,
			cachedContent: input.cachedContent,
			cacheTtlSeconds: input.cacheTtlSeconds,
			mediaResolution: input.mediaResolution,
			uiuxScore: input.uiuxScore,
			uiuxThreshold: input.uiuxThreshold,
			dryRun: input.dryRun,
			runCommands: input.runCommands,
			acceptanceCriteria: input.acceptanceCriteria,
			responsiveRequirements: input.responsiveRequirements,
			a11yRequirements: input.a11yRequirements,
			visualRequirements: input.visualRequirements,
			manualReviewItems: input.manualReviewItems,
		});

	const runPipeline = async (): Promise<PipelineResult> => {
		const execution = await runRequiredStep(steps, "idempotency_begin_execution", () =>
			shipIdempotencyStore.beginExecution<ShipPayloadBase>(effectiveIdempotencyKey),
		);

		if (execution.status === "cached" && isReusableCachedPayload(execution.value)) {
			return { payload: execution.value, idempotencyHit: true };
		}

		if (execution.status === "inflight") {
			const waitResult = await runRequiredStep(steps, "idempotency_wait", () =>
				shipIdempotencyStore.waitFor<ShipPayloadBase>(effectiveIdempotencyKey, {
					timeoutMs: IDEMPOTENCY_WAIT_TIMEOUT_MS,
				}),
			);
			if (waitResult.status === "ready" && isReusableCachedPayload(waitResult.value)) {
				return { payload: waitResult.value, idempotencyHit: true };
			}
			if (waitResult.status === "timeout_inflight") {
				throw new Error(
					`Idempotency wait timed out for key ${effectiveIdempotencyKey} (status=timeout_inflight).`,
				);
			}
			throw new Error(
				`Idempotency wait ended without cached result for key ${effectiveIdempotencyKey} (status=timeout_missing).`,
			);
		}

		if (execution.status !== "acquired") {
			throw new Error("Idempotency execution did not acquire lease.");
		}

		const stopHeartbeat = execution.lease.startHeartbeat();
		try {
			const shouldCollectDeliveryIntelligence =
				input.emitArtifacts !== false || input.emitReviewBundle !== false;

			const workspaceProfile = shouldCollectDeliveryIntelligence
				? await runBestEffortStep(steps, "scan_workspace_profile", () =>
						scanWorkspaceProfile({
							workspaceRoot: input.workspaceRoot,
						}),
					)
				: undefined;

			const changePlan =
				workspaceProfile &&
				(await runBestEffortStep(steps, "build_change_plan", async () =>
					buildChangePlan({
						prompt: input.prompt,
						workspaceProfile,
						pagePath: input.pagePath,
						componentsDir: input.componentsDir,
					}),
				));

			const html = await runRequiredStep(steps, "generate_html", () =>
				requestHtmlFromPrompt({
					prompt: input.prompt,
					styleGuide: resolved.styleGuide,
					model: input.model,
					routeKey: "strong",
					thinkingLevel: input.thinkingLevel,
					includeThoughts: input.includeThoughts,
					responseMimeType: input.responseMimeType,
					responseJsonSchema: input.responseJsonSchema,
					tools: input.tools,
					toolChoice: input.toolChoice,
					functionResponses: input.functionResponses,
					cachedContent: input.cachedContent,
					cacheTtlSeconds: input.cacheTtlSeconds,
					mediaResolution: input.mediaResolution,
					requestIdPrefix: "ship_html",
				}),
			);

			const converted = await runRequiredStep(steps, "convert_react", () =>
				convertHtmlToReactShadcn({
					html,
					pagePath: input.pagePath,
					componentsDir: input.componentsDir,
					uiImportBase: resolved.uiImportBase,
					styleGuide: resolved.styleGuide,
					model: input.model,
					workspaceRoot: input.workspaceRoot,
					detection: resolved.detection,
					thinkingLevel: input.thinkingLevel,
					includeThoughts: input.includeThoughts,
					responseMimeType: input.responseMimeType,
					responseJsonSchema: input.responseJsonSchema,
					tools: input.tools,
					toolChoice: input.toolChoice,
					functionResponses: input.functionResponses,
					cachedContent: input.cachedContent,
					cacheTtlSeconds: input.cacheTtlSeconds,
					mediaResolution: input.mediaResolution,
				}),
			);

			const snapshots = input.dryRun
				? undefined
				: await runRequiredStep(steps, "snapshot_before_apply", () =>
						snapshotFiles(
							input.workspaceRoot,
							converted.payload.files.map((file) => file.path),
						),
					);
			const writtenContentByPath = new Map(
				converted.payload.files.map((file) => [file.path, file.content]),
			);

			const applyResult = await runRequiredStep(steps, "apply_files", () =>
				applyGeneratedFiles({
					files: converted.payload.files,
					targetRoot: input.workspaceRoot,
					dryRun: input.dryRun,
					rollbackOnError: true,
				}),
			);

			const consistentApplyResult: ShipPayloadBase["apply"] = { ...applyResult };

			const quality = await runRequiredStep(steps, "quality_gate", () =>
				runQualityGate({
					files: converted.payload.files,
					targetRoot: input.workspaceRoot,
					runCommands: input.runCommands,
					uiuxScore: input.uiuxScore,
					uiuxThreshold: input.uiuxThreshold,
					acceptanceCriteria: input.acceptanceCriteria,
					responsiveRequirements: input.responsiveRequirements,
					a11yRequirements: input.a11yRequirements,
					visualRequirements: input.visualRequirements,
					manualReviewItems: input.manualReviewItems,
				}),
			);

			if (!quality.passed && !input.dryRun && applyResult.written?.length) {
				const rollback = await runRequiredStep(steps, "rollback_on_quality_fail", () =>
					rollbackWrittenFiles(
						input.workspaceRoot,
						applyResult.written || [],
						snapshots || new Map(),
						writtenContentByPath,
					),
				);
				consistentApplyResult.rolledBack = rollback.rolledBack;
				consistentApplyResult.rollbackDetails = rollback.rollbackDetails;
				consistentApplyResult.rollbackReason = "quality_gate_failed";

				if (!rollback.rolledBack) {
					throw new Error(
						"Quality gate failed and rollback did not complete successfully.",
					);
				}
			}

			const acceptancePack = quality.acceptancePack;
			const acceptanceEvaluation = quality.acceptanceEvaluation;

			const reviewBundle =
				input.emitReviewBundle !== false
					? buildReviewBundle({
							version: 1,
							prompt: input.prompt,
							workspaceRoot: path.resolve(input.workspaceRoot),
							targetKind: "page",
							changePlan: changePlan || undefined,
							workspaceProfile: workspaceProfile || undefined,
							acceptancePack: acceptancePack || undefined,
							acceptanceEvaluation: acceptanceEvaluation || undefined,
							quality: {
								passed: quality.passed,
								issuesCount: quality.issues.length,
								commandFailures: quality.commandResults.filter(
									(item) => item.status === "failed",
								).length,
							},
							changedPaths:
								consistentApplyResult.written ||
								converted.payload.files.map((file) => file.path),
							unresolvedItems: [
								...(changePlan?.unresolvedAssumptions || []),
								...(workspaceProfile?.unknowns || []),
							],
						})
					: undefined;

			const artifacts =
				input.emitArtifacts === false
					? undefined
					: await runBestEffortStep(steps, "write_run_artifacts", () =>
							buildShipArtifacts({
								workspaceRoot: input.workspaceRoot,
								workspaceProfile: workspaceProfile || undefined,
								changePlan: changePlan || undefined,
								acceptancePack: acceptancePack || undefined,
								acceptanceEvaluation: acceptanceEvaluation || undefined,
								reviewBundle,
								artifactSubdirSegments: input.artifactSubdirSegments,
								includeArtifactDir:
									Boolean(input.artifactSubdirSegments?.length),
							}),
						);

				const basePayload: ShipPayloadBase = {
				workspaceRoot: path.resolve(input.workspaceRoot),
				detection: converted.detection,
				html,
				files: converted.payload.files,
				notes: converted.payload.notes,
				apply: consistentApplyResult,
				quality,
				...(workspaceProfile ? { workspaceProfile } : {}),
				...(changePlan ? { changePlan } : {}),
				...(acceptancePack ? { acceptancePack } : {}),
				...(acceptanceEvaluation ? { acceptanceEvaluation } : {}),
				...(reviewBundle ? { reviewBundle } : {}),
				...(artifacts ? { artifacts } : {}),
				};

					if (quality.passed) {
						// Stop the background lease refresher before the terminal write path
						// reacquires the same lock, otherwise slower environments can see
						// heartbeat-vs-complete lock contention.
						await stopHeartbeat();
						await runRequiredStep(steps, "idempotency_store", () =>
							execution.lease.complete(basePayload),
						);
					} else {
						await stopHeartbeat();
						await runBestEffortStep(steps, "idempotency_lease_abandon", () =>
							execution.lease.abandon(),
						);
					}

			return { payload: basePayload, idempotencyHit: false };
			} catch (error) {
				await runBestEffortStep(steps, "idempotency_lease_abandon", () =>
					execution.lease.abandon(),
				);
				throw error;
			} finally {
				await stopHeartbeat();
			}
		};

	const singleFlight = await runRequiredStep(steps, "idempotency_singleflight", () =>
		runSingleFlightByKey(effectiveIdempotencyKey, runPipeline),
	);
	const payload = singleFlight.value.payload;
	const idempotencyHit = singleFlight.shared || singleFlight.value.idempotencyHit;
	return {
		payload,
		steps,
		summary: buildSummary(payload, Boolean(idempotencyHit)),
	};
}

export async function executeShipFeatureFlow(input: {
	name: string;
	description?: string;
	workspaceRoot: string;
	routes: Array<{
		id: string;
		prompt: string;
		pagePath: string;
		componentsDir?: string;
	}>;
	layoutPath?: string;
	sharedComponentsDir?: string;
	model?: string;
	dryRun: boolean;
	runCommands: boolean;
	thinkingLevel?: "low" | "high";
	includeThoughts?: boolean;
}): Promise<FeatureFlowExecutionResult> {
	const routes: FeatureFlowRouteExecution[] = [];
	const featureArtifactSubdirSegments = buildFeatureArtifactSubdirSegments(
		input.name,
	);
	const featurePlan = buildFeatureFlowPlan({
		version: 1,
		name: input.name,
		description: input.description,
		layoutPath: input.layoutPath,
		sharedComponentsDir: input.sharedComponentsDir,
		routes: input.routes,
	});

	for (const [index, route] of input.routes.entries()) {
		const artifactSubdirSegments = buildFeatureFlowRouteSubdirSegments(
			featureArtifactSubdirSegments,
			index,
			route.id,
		);
		const routeExecution = await shipJobQueue.enqueue(() =>
			executeShipPage({
				prompt: route.prompt,
				pagePath: route.pagePath,
				componentsDir:
					route.componentsDir ||
					input.sharedComponentsDir ||
					"apps/web/components/generated",
				model: input.model,
				workspaceRoot: input.workspaceRoot,
				dryRun: input.dryRun,
				runCommands: input.runCommands,
				thinkingLevel: input.thinkingLevel,
				includeThoughts: input.includeThoughts,
				emitArtifacts: false,
			}),
		);
		const ensuredAcceptance = ensureFeatureFlowRouteAcceptance({
			prompt: route.prompt,
			payload: routeExecution.payload,
		});
		const routeReviewBundle = buildFeatureFlowRouteReviewBundle({
			prompt: route.prompt,
			workspaceRoot: input.workspaceRoot,
			payload: routeExecution.payload,
			summary: routeExecution.summary,
			acceptancePack: ensuredAcceptance.pack,
			acceptanceEvaluation: ensuredAcceptance.evaluation,
		});
		const routePayload: ShipPayloadBase = {
			...routeExecution.payload,
			acceptancePack: ensuredAcceptance.pack,
			acceptanceEvaluation: ensuredAcceptance.evaluation,
			reviewBundle: routeReviewBundle,
		};
		const routeArtifactMap = await buildShipArtifacts({
			workspaceRoot: input.workspaceRoot,
			artifactSubdirSegments,
			includeArtifactDir: true,
			workspaceProfile: routePayload.workspaceProfile,
			changePlan: routePayload.changePlan,
			acceptancePack: routePayload.acceptancePack,
			acceptanceEvaluation: routePayload.acceptanceEvaluation,
			reviewBundle: routePayload.reviewBundle,
		});
		routes.push({
			id: route.id,
			pagePath: route.pagePath,
			result: {
				...routePayload,
				artifacts: routeArtifactMap,
			},
			summary: routeExecution.summary,
			steps: routeExecution.steps,
			artifacts: buildFeatureFlowRouteArtifacts(routeArtifactMap),
		});
	}

	const quality = buildFeatureFlowQualityAggregate(routes);
	const acceptance = buildFeatureFlowAcceptanceAggregate({
		name: input.name,
		layoutPath: input.layoutPath,
		sharedComponentsDir: input.sharedComponentsDir,
		routes,
		quality,
	});
	const reviewBundle = buildFeatureFlowReviewBundle({
		name: input.name,
		workspaceRoot: input.workspaceRoot,
		layoutPath: input.layoutPath,
		sharedComponentsDir: input.sharedComponentsDir,
		routes,
		quality,
		acceptance,
	});
	const featureArtifacts: NonNullable<FeatureFlowExecutionResult["artifacts"]> = {
		featureArtifactDir: resolveRunArtifactDirectoryRelativePath(
			featureArtifactSubdirSegments,
		),
		routeArtifacts: routes.reduce<Record<string, FeatureFlowRouteArtifacts>>(
			(result, route) => {
				if (route.artifacts) {
					result[route.id] = route.artifacts;
				}
				return result;
			},
			{},
		),
	};
	const featureFlowPlanPath = await writeRunArtifactJson({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-plan",
		payload: featurePlan,
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowPlanPath) {
		featureArtifacts.featureFlowPlan = featureFlowPlanPath;
	}
	const featureFlowQualityPath = await writeRunArtifactJson({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-quality",
		payload: quality,
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowQualityPath) {
		featureArtifacts.featureFlowQuality = featureFlowQualityPath;
	}
	const featureFlowAcceptancePath = await writeRunArtifactJson({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-acceptance",
		payload: acceptance,
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowAcceptancePath) {
		featureArtifacts.featureFlowAcceptance = featureFlowAcceptancePath;
	}
	const featureFlowAcceptancePackPath = await writeRunArtifactJson({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-acceptance-pack",
		payload: acceptance.pack,
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowAcceptancePackPath) {
		featureArtifacts.featureFlowAcceptancePack = featureFlowAcceptancePackPath;
	}
	const featureFlowAcceptanceResultPath = await writeRunArtifactJson({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-acceptance-result",
		payload: acceptance.evaluation,
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowAcceptanceResultPath) {
		featureArtifacts.featureFlowAcceptanceResult =
			featureFlowAcceptanceResultPath;
	}
	const featureFlowReviewBundlePath = await writeRunArtifactJson({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-review-bundle",
		payload: reviewBundle,
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowReviewBundlePath) {
		featureArtifacts.featureFlowReviewBundle = featureFlowReviewBundlePath;
	}
	const featureFlowReviewBundleMarkdownPath = await writeRunArtifactText({
		workspaceRoot: input.workspaceRoot,
		name: "feature-flow-review-bundle",
		text: buildReviewBundleMarkdown(reviewBundle),
		subdirSegments: featureArtifactSubdirSegments,
	});
	if (featureFlowReviewBundleMarkdownPath) {
		featureArtifacts.featureFlowReviewBundleMarkdown =
			featureFlowReviewBundleMarkdownPath;
	}

	const changedPaths = uniqueStrings(
		routes.flatMap((route) => route.summary.changedPaths),
	);
	const summary = {
		routeCount: routes.length,
		passedRouteCount: quality.passedRouteCount,
		failedRouteCount: quality.failedRouteCount,
		manualFollowUpCount: reviewBundle.manualFollowUps?.length || 0,
		hotspotCount: reviewBundle.hotspots?.length || 0,
		changedPaths,
	};

	const routeOutputs: FeatureFlowRouteExecutionResult[] = routes.map((route) => ({
		id: route.id,
		pagePath: route.pagePath,
		result: route.result,
		summary: route.summary,
		steps: route.steps,
		artifacts: route.artifacts,
		changedPaths: route.summary.changedPaths,
		qualityStatus: route.result.quality.passed ? "passed" : "failed",
		acceptanceVerdict: route.result.acceptanceEvaluation?.verdict,
		manualFollowUpCount: route.result.reviewBundle?.manualFollowUps?.length || 0,
		unresolvedCount: route.result.reviewBundle?.unresolvedItems.length || 0,
		artifactDir: route.artifacts?.artifactDir,
		dominantIssueRules: uniqueStrings(
			route.result.quality.issues.map((issue) => issue.rule),
		),
	}));

	return {
		version: 1,
		name: input.name,
		...(input.description ? { description: input.description } : {}),
		plan: featurePlan,
		routes: routeOutputs,
		summary,
		quality,
		acceptance,
		reviewBundle,
		artifacts: featureArtifacts,
	};
}

export const __test__: ShipCoreTestExports = {
	buildSummary,
	rollbackWrittenFiles,
	snapshotFiles,
};
