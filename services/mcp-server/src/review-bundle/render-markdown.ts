import type { ReviewBundle } from "./types.js";

export function buildReviewBundleMarkdown(bundle: ReviewBundle): string {
	const lines: string[] = [];
	lines.push("# OpenUI Review Bundle");
	lines.push("");
	lines.push(`- Prompt: ${bundle.prompt}`);
	lines.push(`- Target kind: ${bundle.targetKind}`);
	lines.push(`- Workspace root: ${bundle.workspaceRoot}`);
	lines.push("");
	lines.push("## Summary");
	lines.push(
		`- Changed paths: ${bundle.summary?.changedPathCount ?? bundle.changedPaths.length}`,
	);
	lines.push(`- Quality status: ${bundle.summary?.qualityStatus ?? "not_run"}`);
	lines.push(
		`- Acceptance verdict: ${bundle.summary?.acceptanceVerdict ?? "not_attached"}`,
	);
	lines.push(
		`- Manual follow-up count: ${bundle.summary?.manualFollowUpCount ?? 0}`,
	);
	lines.push(`- Unresolved count: ${bundle.summary?.unresolvedCount ?? bundle.unresolvedItems.length}`);
	if (typeof bundle.summary?.routeCount === "number") {
		lines.push(`- Route count: ${bundle.summary.routeCount}`);
	}
	if (typeof bundle.summary?.failedRouteCount === "number") {
		lines.push(`- Failed routes: ${bundle.summary.failedRouteCount}`);
	}
	lines.push("");
	if (bundle.sharedImpact?.length) {
		lines.push("## Shared Impact");
		for (const impact of bundle.sharedImpact) {
			lines.push(`- ${impact.label}: ${impact.reason} [paths: ${impact.paths.join(", ")}]`);
		}
		lines.push("");
	}
	lines.push("## Hotspots");
	if (!bundle.hotspots?.length) {
		lines.push("- none");
	} else {
		for (const hotspot of bundle.hotspots) {
			const pathSuffix =
				hotspot.paths && hotspot.paths.length > 0
					? ` [paths: ${hotspot.paths.join(", ")}]`
					: "";
			lines.push(
				`- [${hotspot.severity}] ${hotspot.label}: ${hotspot.reason}${pathSuffix}`,
			);
		}
	}
	lines.push("");
	lines.push("## Auto Checks");
	if (!bundle.autoChecks?.length) {
		lines.push("- none");
	} else {
		for (const check of bundle.autoChecks) {
			lines.push(`- ${check.label} [${check.status}] (${check.source}): ${check.details}`);
		}
	}
	lines.push("");
	lines.push("## Manual Follow-up");
	if (!bundle.manualFollowUps?.length) {
		lines.push("- none");
	} else {
		for (const item of bundle.manualFollowUps) {
			const pathSuffix =
				item.paths && item.paths.length > 0 ? ` [paths: ${item.paths.join(", ")}]` : "";
			lines.push(`- ${item.label} (${item.source}): ${item.reason}${pathSuffix}`);
		}
	}
	lines.push("");
	if (bundle.routeSummaries?.length) {
		lines.push("## Route Summaries");
		for (const route of bundle.routeSummaries) {
			lines.push(
				`- ${route.id} (${route.pagePath}): quality=${route.qualityStatus}, acceptance=${route.acceptanceVerdict ?? "not_attached"}, manualFollowUps=${route.manualFollowUpCount}, unresolved=${route.unresolvedCount}`,
			);
			if (route.artifactDir) {
				lines.push(`  artifactDir: ${route.artifactDir}`);
			}
			if (route.dominantIssueRules?.length) {
				lines.push(`  dominantIssueRules: ${route.dominantIssueRules.join(", ")}`);
			}
		}
		lines.push("");
	}
	lines.push("");
	lines.push("## Planned Paths");
	if (bundle.changePlan?.items?.length) {
		for (const status of ["create", "update", "maybe-touch", "blocked"] as const) {
			const matches = bundle.changePlan.items.filter((item) => item.status === status);
			if (!matches.length) {
				continue;
			}
			lines.push(`### ${status}`);
			for (const item of matches) {
				const extras = [
					item.source ? `source=${item.source}` : "",
					item.confidence ? `confidence=${item.confidence}` : "",
				]
					.filter(Boolean)
					.join(", ");
				lines.push(`- ${item.path}${extras ? ` (${extras})` : ""}: ${item.reason}`);
			}
			lines.push("");
		}
	} else {
		for (const changedPath of bundle.changedPaths) {
			lines.push(`- ${changedPath}`);
		}
		lines.push("");
	}
	lines.push("## Unresolved Items");
	if (bundle.unresolvedItems.length === 0) {
		lines.push("- none");
	} else {
		for (const item of bundle.unresolvedItems) {
			lines.push(`- ${item}`);
		}
	}
	return `${lines.join("\n")}\n`;
}
