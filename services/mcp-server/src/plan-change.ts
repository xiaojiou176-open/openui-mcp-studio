import type { ChangePlan } from "../../../packages/contracts/src/review-bundle.js";
import type { WorkspaceProfile } from "../../../packages/contracts/src/workspace-profile.js";
import { normalizePath } from "../../../packages/shared-runtime/src/path-utils.js";
import { DEFAULT_COMPONENTS_DIR, DEFAULT_PAGE_PATH } from "./constants.js";

type ChangePlanItemSource = NonNullable<ChangePlan["items"][number]["source"]>;

function makePlanItem(input: {
	path: string;
	status: ChangePlan["items"][number]["status"];
	reason: string;
	source: ChangePlanItemSource;
	confidence: NonNullable<ChangePlan["items"][number]["confidence"]>;
	evidence: string[];
}): ChangePlan["items"][number] {
	return {
		path: input.path,
		status: input.status,
		reason: input.reason,
		source: input.source,
		confidence: input.confidence,
		evidence: input.evidence,
	};
}

function containsPromptKeyword(prompt: string, keywords: string[]): boolean {
	const lower = prompt.toLowerCase();
	return keywords.some((keyword) => lower.includes(keyword));
}

export function buildChangePlan(input: {
	prompt: string;
	workspaceProfile: WorkspaceProfile;
	pagePath?: string;
	componentsDir?: string;
	targetKind?: "page" | "feature-flow";
}): ChangePlan {
	const pagePath = normalizePath(input.pagePath || DEFAULT_PAGE_PATH);
	const componentsDir = normalizePath(
		input.componentsDir || input.workspaceProfile.componentsDir || DEFAULT_COMPONENTS_DIR,
	);
	const riskSummary: string[] = [];
	const assumptions: string[] = [
		`Generated components should land under ${componentsDir}.`,
		`The requested change should stay rooted under ${input.workspaceProfile.defaultTargetRoot}.`,
	];
	const unresolvedAssumptions: string[] = [];
	const items: ChangePlan["items"] = [];
	const hotspots: NonNullable<ChangePlan["hotspots"]> = [];
	const reviewFocus: string[] = [];

	const pageExists = input.workspaceProfile.routeEntries.some(
		(entry) => entry.filePath === pagePath,
	);
	items.push(
		makePlanItem({
			path: pagePath,
			status: pageExists ? "update" : "create",
			reason: pageExists
				? "Target page already exists and the request most likely modifies it in place."
				: "Target page path does not exist, so this request most likely creates a new route surface.",
			source: pageExists ? "workspace" : "input",
			confidence: pageExists ? "high" : "medium",
			evidence: pageExists
				? [`workspace.routeEntries contains ${pagePath}`]
				: [`requested pagePath=${pagePath}`],
		}),
	);

	const generatedEntry = componentsDir;
	items.push(
		makePlanItem({
			path: generatedEntry,
			status: "maybe-touch",
			reason:
				"Generated components usually land under the generated/shared components subtree and may widen the review surface.",
			source: "system",
			confidence: "medium",
			evidence: [
				`componentsDir=${componentsDir}`,
				`workspace.componentsDir=${input.workspaceProfile.componentsDir}`,
			],
		}),
	);

	if (
		containsPromptKeyword(input.prompt, [
			"layout",
			"navigation",
			"sidebar",
			"header",
			"footer",
		])
	) {
		const layoutPath = pagePath.includes("/app/")
			? pagePath.replace(/\/app\/.*$/, "/app/layout.tsx")
			: "app/layout.tsx";
		items.push(
			makePlanItem({
				path: layoutPath,
				status: "maybe-touch",
				reason:
					"Prompt language suggests shell or navigation changes that may widen the change from one page into a shared layout surface.",
				source: "prompt_heuristic",
				confidence: "medium",
				evidence: ["prompt contains layout/navigation keywords"],
			}),
		);
		riskSummary.push("Prompt hints that shared layout or navigation surfaces may be affected.");
		hotspots.push({
			label: "shared-layout-or-navigation",
			reason:
				"Layout or navigation changes can spill into multiple routes and require reviewer attention beyond the target page.",
			severity: "high",
			paths: [layoutPath, pagePath],
			source: "prompt_heuristic",
		});
		reviewFocus.push("Review shared layout or navigation surfaces before treating the change as page-local.");
	}

	if (containsPromptKeyword(input.prompt, ["dashboard", "flow", "wizard", "checkout", "settings"])) {
		riskSummary.push("Prompt hints at a multi-step or multi-surface experience.");
		hotspots.push({
			label: "multi-surface-experience",
			reason:
				"Prompt language suggests a multi-step or shared-shell experience, so route-local edits may not tell the whole story.",
			severity: "medium",
			paths: [pagePath],
			source: "prompt_heuristic",
		});
		reviewFocus.push("Check whether the request should stay page-local or expand into a larger feature flow.");
	}

	if ((input.workspaceProfile.routeGroups || []).length > 0) {
		riskSummary.push("Workspace uses route groups; reviewer should confirm whether hidden shell/layout structure is affected.");
		hotspots.push({
			label: "route-groups-present",
			reason:
				"Route groups often hide shared shell or information architecture decisions behind route-local file paths.",
			severity: "medium",
			paths: input.workspaceProfile.layoutEntries?.map((entry) => entry.filePath) || [],
			source: "workspace",
		});
		reviewFocus.push("Confirm whether route-group structure changes the real blast radius of the requested edit.");
	}

	if ((input.workspaceProfile.parallelRouteKeys || []).length > 0) {
		riskSummary.push("Workspace uses parallel routes; route-local edits may not reflect the full navigation shell.");
		reviewFocus.push("Validate parallel-route behavior before assuming one-page changes are isolated.");
	}

	const workspaceHotspots = input.workspaceProfile.hotspots;
	if (workspaceHotspots && workspaceHotspots.length > 0) {
		for (const hotspot of workspaceHotspots) {
			if (!hotspot.filePath) {
				continue;
			}
			hotspots.push({
				label: hotspot.label,
				reason: hotspot.reason,
				severity: hotspot.severity,
				paths: [hotspot.filePath],
				source: "workspace",
			});
		}
	}

	if ((input.workspaceProfile.patternHints.navigationFiles || []).length > 0) {
		reviewFocus.push("Review navigation surfaces because the workspace already contains shared navigation code.");
	}
	if ((input.workspaceProfile.patternHints.tableFiles || []).length > 0) {
		reviewFocus.push("Review table-heavy surfaces for layout density and data-state implications.");
	}
	if ((input.workspaceProfile.patternHints.chartFiles || []).length > 0) {
		reviewFocus.push("Review chart surfaces for visual semantics and data assumptions.");
	}

	if (!input.workspaceProfile.componentEntries.length) {
		unresolvedAssumptions.push(
			"Workspace profile did not discover an existing component inventory; generated components may create new shared surfaces.",
		);
	}

	if (!input.workspaceProfile.tokenHints.cssVariableFiles.length) {
		unresolvedAssumptions.push(
			"Workspace profile did not discover obvious token files; design-token alignment may require manual review.",
		);
	}
	if (input.workspaceProfile.confidence?.overall === "low") {
		unresolvedAssumptions.push(
			"Workspace profile confidence is low; route/component/style conclusions may need manual confirmation before apply.",
		);
	}

	const recommendedExecutionMode =
		unresolvedAssumptions.length > 0 ? "dry_run_only" : "apply_safe";
	const recommendedExecutionModeReason =
		recommendedExecutionMode === "dry_run_only"
			? "Dry run is recommended because unresolved assumptions or low-confidence workspace signals remain."
			: "Apply-safe is recommended because the workspace profile found enough route/component/style evidence to justify a controlled write.";

	return {
		version: 1,
		prompt: input.prompt,
		targetKind: input.targetKind || "page",
		targetRoot: input.workspaceProfile.defaultTargetRoot,
		recommendedExecutionMode,
		recommendedExecutionModeReason,
		items,
		assumptions,
		riskSummary,
		unresolvedAssumptions,
		reviewFocus: Array.from(new Set(reviewFocus)),
		hotspots,
	};
}
