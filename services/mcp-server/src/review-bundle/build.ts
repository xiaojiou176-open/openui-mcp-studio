import type { AcceptanceCriterion } from "../acceptance/types.js";
import type {
	ReviewAutoCheck,
	ReviewBundle,
	ReviewBundleHotspot,
	ReviewBundleSummary,
	ReviewManualFollowUp,
} from "./types.js";

function dedupeReviewItems<T>(
	items: T[],
	keyBuilder: (item: T) => string,
): T[] {
	const seen = new Set<string>();
	const deduped: T[] = [];
	for (const item of items) {
		const key = keyBuilder(item);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(item);
	}
	return deduped;
}

function buildSummary(bundle: ReviewBundle): ReviewBundleSummary {
	const planItems = bundle.changePlan?.items || [];
	const createCount = planItems.filter((item) => item.status === "create").length;
	const updateCount = planItems.filter((item) => item.status === "update").length;
	const maybeTouchCount = planItems.filter(
		(item) => item.status === "maybe-touch",
	).length;
	const blockedCount = planItems.filter((item) => item.status === "blocked").length;
	return {
		changedPathCount: bundle.changedPaths.length,
		routeCount: bundle.routeSummaries?.length,
		failedRouteCount: bundle.routeSummaries?.filter(
			(route) => route.qualityStatus === "failed",
		).length,
		createCount,
		updateCount,
		maybeTouchCount,
		blockedCount,
		qualityStatus: bundle.quality
			? bundle.quality.passed
				? "passed"
				: "failed"
			: "not_run",
		acceptanceVerdict: bundle.acceptanceEvaluation?.verdict,
		manualFollowUpCount: 0,
		unresolvedCount: bundle.unresolvedItems.length,
	};
}

function buildAutoChecks(bundle: ReviewBundle): ReviewAutoCheck[] {
	const checks: ReviewAutoCheck[] = [];
	checks.push({
		label: "Quality gate",
		source: "quality",
		status: bundle.quality
			? bundle.quality.passed
				? "passed"
				: "failed"
			: "not_run",
		details: bundle.quality
			? `issues=${bundle.quality.issuesCount}, commandFailures=${bundle.quality.commandFailures}`
			: "Quality gate did not run in this bundle.",
	});
	if (bundle.smoke) {
		checks.push({
			label: "Smoke",
			source: "smoke",
			status: bundle.smoke.passed ? "passed" : "failed",
			details: bundle.smoke.usedTargetRoot
				? `usedTargetRoot=${bundle.smoke.usedTargetRoot}`
				: "Smoke result was attached without an explicit target root.",
		});
	}
	const criteriaById = new Map<string, AcceptanceCriterion>(
		(bundle.acceptancePack?.criteria || []).map((criterion) => [criterion.id, criterion]),
	);
	for (const result of bundle.acceptanceEvaluation?.results || []) {
		const criterion = criteriaById.get(result.id);
		if ((result.evaluationMode || criterion?.evaluationMode) !== "automatic") {
			continue;
		}
		if (criterion?.kind === "quality_gate" || criterion?.kind === "smoke") {
			continue;
		}
		checks.push({
			label: criterion?.label || result.id,
			source: "acceptance",
			status:
				result.status === "auto_failed"
					? "failed"
					: result.status === "auto_passed"
						? "passed"
						: "not_run",
			details: result.reason,
		});
	}
	return checks;
}

function buildManualFollowUps(bundle: ReviewBundle): ReviewManualFollowUp[] {
	const followUps: ReviewManualFollowUp[] = [];
	const criteriaById = new Map<string, AcceptanceCriterion>(
		(bundle.acceptancePack?.criteria || []).map((criterion) => [criterion.id, criterion]),
	);
	for (const result of bundle.acceptanceEvaluation?.results || []) {
		if (result.status !== "manual_required" && result.status !== "not_run") {
			continue;
		}
		const criterion = criteriaById.get(result.id);
		followUps.push({
			label: criterion?.label || result.id,
			reason: result.reason,
			source: "acceptance",
		});
	}
	for (const focus of bundle.changePlan?.reviewFocus || []) {
		followUps.push({
			label: "Review focus",
			reason: focus,
			source: "plan",
		});
	}
	for (const unknown of bundle.workspaceProfile?.unknowns || []) {
		followUps.push({
			label: "Workspace unknown",
			reason: unknown,
			source: "workspace",
		});
	}
	return followUps;
}

function buildHotspots(bundle: ReviewBundle): ReviewBundleHotspot[] {
	const hotspots: ReviewBundleHotspot[] = [];
	for (const hotspot of bundle.changePlan?.hotspots || []) {
		hotspots.push({
			label: hotspot.label,
			reason: hotspot.reason,
			severity: hotspot.severity,
			source: "plan",
			paths: hotspot.paths,
		});
	}
	for (const hotspot of bundle.workspaceProfile?.hotspots || []) {
		hotspots.push({
			label: hotspot.label,
			reason: hotspot.reason,
			severity: hotspot.severity,
			source: "workspace",
			paths: hotspot.filePath ? [hotspot.filePath] : undefined,
		});
	}
	if (bundle.quality && !bundle.quality.passed) {
		hotspots.push({
			label: "quality-gate-failed",
			reason:
				"At least one quality gate failed, so the generated change needs focused reviewer attention before it can be trusted.",
			severity: "high",
			source: "quality",
			paths: bundle.changedPaths,
		});
	}
	if (
		bundle.acceptanceEvaluation &&
		(bundle.acceptanceEvaluation.verdict === "failed" ||
			bundle.acceptanceEvaluation.verdict === "blocked")
	) {
		hotspots.push({
			label: "acceptance-verdict",
			reason: `Acceptance verdict is ${bundle.acceptanceEvaluation.verdict}.`,
			severity: bundle.acceptanceEvaluation.verdict === "blocked" ? "high" : "medium",
			source: "acceptance",
			paths: bundle.changedPaths,
		});
	}
	return hotspots;
}

export function buildReviewBundle(input: ReviewBundle): ReviewBundle {
	const autoChecks = dedupeReviewItems(
		[...(input.autoChecks || []), ...buildAutoChecks(input)],
		(item) => `${item.label}|${item.source}|${item.status}|${item.details}`,
	);
	const manualFollowUps = dedupeReviewItems(
		[...(input.manualFollowUps || []), ...buildManualFollowUps(input)],
		(item) => `${item.label}|${item.source}|${item.reason}|${(item.paths || []).join(",")}`,
	);
	const summary = buildSummary(input);
	const hotspots = dedupeReviewItems(
		[...(input.hotspots || []), ...buildHotspots(input)],
		(item) => `${item.label}|${item.source}|${item.severity}|${item.reason}|${(item.paths || []).join(",")}`,
	);
	return {
		...input,
		summary: {
			...summary,
			manualFollowUpCount: manualFollowUps.length,
		},
		autoChecks,
		manualFollowUps,
		hotspots,
	};
}
