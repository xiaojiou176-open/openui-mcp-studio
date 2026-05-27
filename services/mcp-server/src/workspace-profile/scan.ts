import fs from "node:fs/promises";
import path from "node:path";
import { routePathFromAppFile } from "../../../../packages/shared-runtime/src/workspace-profile.js";
import { normalizePath } from "../../../../packages/shared-runtime/src/path-utils.js";
import { DEFAULT_APP_WEB_ROOT, getWorkspaceRoot } from "../constants.js";
import { detectShadcnPaths } from "../path-detection.js";
import {
	buildWorkspaceComponentEntries,
	buildWorkspacePatternHints,
	buildWorkspaceTokenHints,
	inferRouteKind,
} from "./patterns.js";
import type {
	WorkspaceEvidenceAnchor,
	WorkspaceHotspot,
	WorkspaceLayoutEntry,
	WorkspaceProfile,
	WorkspaceRouteEntry,
	WorkspaceRoutingMode,
	WorkspaceSignalConfidence,
	WorkspaceStyleStack,
} from "./types.js";

function extractRouteGroupSegments(relativePath: string): string[] {
	return normalizePath(relativePath)
		.split("/")
		.filter((segment) => /^\(.+\)$/.test(segment))
		.map((segment) => segment.slice(1, -1));
}

function extractParallelRouteKeys(relativePath: string): string[] {
	return normalizePath(relativePath)
		.split("/")
		.filter((segment) => segment.startsWith("@"))
		.map((segment) => segment.slice(1));
}

function extractDynamicSegments(relativePath: string): string[] {
	return normalizePath(relativePath).match(/\[[^/]+\]/g) || [];
}

function routePathFromPagesFile(relativePath: string): string {
	const normalized = normalizePath(relativePath);
	const pagesSegment = normalized.startsWith("pages/")
		? normalized.slice("pages/".length)
		: (() => {
				const pagesIndex = normalized.indexOf("/pages/");
				return pagesIndex >= 0
					? normalized.slice(pagesIndex + "/pages/".length)
					: normalized;
			})();
	const withoutExtension = pagesSegment.replace(/\.(tsx|ts|jsx|js)$/, "");
	const withoutSpecial =
		withoutExtension === "index"
			? ""
			: withoutExtension.replace(/\/index$/, "");
	const cleaned = withoutSpecial
		.split("/")
		.filter((segment) => segment.length > 0)
		.join("/");
	return cleaned ? `/${cleaned}` : "/";
}

async function listRouteFiles(scanRoot: string): Promise<string[]> {
	const entries: string[] = [];

	async function walk(current: string): Promise<void> {
			const dirEntries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
		for (const entry of dirEntries) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				entry.name === ".next"
			) {
				continue;
			}
			const absolutePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(absolutePath);
				continue;
			}
			const relativePath = normalizePath(path.relative(scanRoot, absolutePath));
			const isAppRouterFile =
				/(?:^|\/)(page|layout|route|loading|error)\.(tsx|ts|jsx|js)$/.test(
					relativePath,
				) && /(?:^|\/)app\//.test(relativePath);
			const isPagesRouterFile =
				/(?:^|\/)pages\/.*\.(tsx|ts|jsx|js)$/.test(relativePath) &&
				!/(?:^|\/)pages\/api\//.test(relativePath) &&
				!/(?:^|\/)pages\/_app\.(tsx|ts|jsx|js)$/.test(relativePath) &&
				!/(?:^|\/)pages\/_document\.(tsx|ts|jsx|js)$/.test(relativePath) &&
				!/(?:^|\/)pages\/_error\.(tsx|ts|jsx|js)$/.test(relativePath);
			if (isAppRouterFile || isPagesRouterFile) {
				entries.push(relativePath);
			}
		}
	}

	await walk(scanRoot);
	return entries.sort();
}

function detectRoutingMode(routeFiles: string[]): WorkspaceRoutingMode {
	const hasAppRouter = routeFiles.some((filePath) => /(?:^|\/)app\//.test(filePath));
	const hasPagesRouter = routeFiles.some((filePath) =>
		/(?:^|\/)pages\//.test(filePath),
	);
	if (hasAppRouter && hasPagesRouter) {
		return "mixed";
	}
	if (hasAppRouter) {
		return "app-router";
	}
	if (hasPagesRouter) {
		return "pages-router";
	}
	return "unknown";
}

function deriveStyleStack(input: {
	detectionEvidence: string[];
	tokenHints: WorkspaceProfile["tokenHints"];
}): WorkspaceStyleStack {
	const usesComponentsJson = input.detectionEvidence.some((item) =>
		item.includes("components.json"),
	);
	const usesTailwindConfig = input.tokenHints.tailwindConfigFiles.length > 0;
	const usesCssVariables = input.tokenHints.cssVariableFiles.length > 0;
	return {
		usesComponentsJson,
		usesTailwindConfig,
		usesCssVariables,
		tokenAuthority: usesCssVariables
			? "css-variables"
			: usesTailwindConfig
				? "tailwind-only"
				: "unknown",
	};
}

function buildConfidenceSummary(input: {
	routeEntries: WorkspaceRouteEntry[];
	componentEntries: WorkspaceProfile["componentEntries"];
	tokenHints: WorkspaceProfile["tokenHints"];
	patternHints: WorkspaceProfile["patternHints"];
	unknowns: string[];
}): WorkspaceProfile["confidence"] {
	const routing: WorkspaceSignalConfidence =
		input.routeEntries.length > 0 ? "high" : "low";
	const components: WorkspaceSignalConfidence =
		input.componentEntries.length > 0 ? "high" : "medium";
	const styling: WorkspaceSignalConfidence =
		input.tokenHints.cssVariableFiles.length > 0 ||
		input.tokenHints.tailwindConfigFiles.length > 0
			? "high"
			: "low";
	const patternSignals =
		input.patternHints.formLibraries.length +
		input.patternHints.dataLibraries.length +
		(input.patternHints.formFiles?.length || 0) +
		(input.patternHints.tableFiles?.length || 0) +
		(input.patternHints.chartFiles?.length || 0) +
		(input.patternHints.navigationFiles?.length || 0);
	const patterns: WorkspaceSignalConfidence =
		patternSignals >= 3 ? "high" : patternSignals > 0 ? "medium" : "low";
	const lowSignals = [routing, components, styling, patterns].filter(
		(value) => value === "low",
	).length;
	const overall: WorkspaceSignalConfidence =
		input.unknowns.length >= 3 || lowSignals >= 2
			? "low"
			: lowSignals === 1
				? "medium"
				: "high";
	return {
		routing,
		components,
		styling,
		patterns,
		overall,
	};
}

function buildEvidenceAnchors(input: {
	routeEntries: WorkspaceRouteEntry[];
	componentEntries: WorkspaceProfile["componentEntries"];
	tokenHints: WorkspaceProfile["tokenHints"];
	patternHints: WorkspaceProfile["patternHints"];
	styleStack: WorkspaceStyleStack;
}): WorkspaceEvidenceAnchor[] {
	const anchors: WorkspaceEvidenceAnchor[] = [];
	for (const routeEntry of input.routeEntries.slice(0, 3)) {
		anchors.push({
			area: "routing",
			label: `${routeEntry.kind}:${routeEntry.routePath}`,
			filePath: routeEntry.filePath,
			reason: "Route topology was discovered from a concrete route file.",
			confidence: "high",
		});
	}
	for (const componentEntry of input.componentEntries.slice(0, 3)) {
		anchors.push({
			area: "components",
			label: componentEntry.category,
			filePath: componentEntry.filePath,
			reason: "Component inventory entry was discovered under the target root.",
			confidence: "medium",
		});
	}
	for (const tokenFile of input.tokenHints.cssVariableFiles.slice(0, 2)) {
		anchors.push({
			area: "styling",
			label: input.styleStack.tokenAuthority,
			filePath: tokenFile,
			reason: "Token authority was inferred from discovered styling files.",
			confidence: "high",
		});
	}
	for (const navigationFile of (input.patternHints.navigationFiles || []).slice(0, 2)) {
		anchors.push({
			area: "patterns",
			label: "navigation-surface",
			filePath: navigationFile,
			reason: "Navigation-oriented file detected in target workspace.",
			confidence: "medium",
		});
	}
	for (const tableFile of (input.patternHints.tableFiles || []).slice(0, 1)) {
		anchors.push({
			area: "patterns",
			label: "table-surface",
			filePath: tableFile,
			reason: "Table-oriented surface detected from source code.",
			confidence: "medium",
		});
	}
	return anchors;
}

function buildHotspots(input: {
	layoutEntries: WorkspaceLayoutEntry[];
	routeGroups: string[];
	parallelRouteKeys: string[];
	patternHints: WorkspaceProfile["patternHints"];
	styleStack: WorkspaceStyleStack;
}): WorkspaceHotspot[] {
	const hotspots: WorkspaceHotspot[] = [];
	for (const layoutEntry of input.layoutEntries.slice(0, 2)) {
		hotspots.push({
			kind: "layout-shell",
			label: layoutEntry.routePath,
			filePath: layoutEntry.filePath,
			severity: "high",
			reason:
				"Layout shell changes can affect multiple downstream routes and reviewer expectations.",
		});
	}
	for (const group of input.routeGroups.slice(0, 3)) {
		hotspots.push({
			kind: "route-group",
			label: group,
			severity: "medium",
			reason:
				"Route groups suggest grouped navigation or layout behavior that may widen the change surface.",
		});
	}
	for (const key of input.parallelRouteKeys.slice(0, 3)) {
		hotspots.push({
			kind: "parallel-route",
			label: key,
			severity: "medium",
			reason:
				"Parallel route keys increase the chance that a seemingly local change touches shared app-shell behavior.",
		});
	}
	for (const filePath of (input.patternHints.formFiles || []).slice(0, 2)) {
		hotspots.push({
			kind: "form-surface",
			label: path.basename(filePath),
			filePath,
			severity: "medium",
			reason: "Form-oriented surface detected; field state and validation often need manual review.",
		});
	}
	for (const filePath of (input.patternHints.tableFiles || []).slice(0, 2)) {
		hotspots.push({
			kind: "table-surface",
			label: path.basename(filePath),
			filePath,
			severity: "medium",
			reason: "Table-oriented surface detected; data density and layout changes can widen review scope.",
		});
	}
	for (const filePath of (input.patternHints.chartFiles || []).slice(0, 2)) {
		hotspots.push({
			kind: "chart-surface",
			label: path.basename(filePath),
			filePath,
			severity: "medium",
			reason: "Chart-oriented surface detected; visual and data semantics may require reviewer attention.",
		});
	}
	for (const filePath of (input.patternHints.navigationFiles || []).slice(0, 2)) {
		hotspots.push({
			kind: "navigation-surface",
			label: path.basename(filePath),
			filePath,
			severity: "medium",
			reason: "Navigation-oriented surface detected; shared shell behavior may be affected.",
		});
	}
	if (input.styleStack.tokenAuthority === "unknown") {
		hotspots.push({
			kind: "token-authority",
			label: "styling-unknown",
			severity: "low",
			reason:
				"Token authority is not obvious from the current workspace; design-token alignment may need manual confirmation.",
		});
	}
	return hotspots;
}

export async function scanWorkspaceProfile(input?: {
	workspaceRoot?: string;
	targetRoot?: string;
}): Promise<WorkspaceProfile> {
	const workspaceRoot = path.resolve(input?.workspaceRoot || getWorkspaceRoot());
	const detection = await detectShadcnPaths(workspaceRoot);
	const defaultTargetRoot = input?.targetRoot
		? normalizePath(input.targetRoot)
		: normalizePath(
				(await fs
					.access(path.resolve(workspaceRoot, DEFAULT_APP_WEB_ROOT))
					.then(() => DEFAULT_APP_WEB_ROOT)
					.catch(() => ".")),
			);
	const scanRoot = path.resolve(workspaceRoot, defaultTargetRoot);
	const scanRelativeUiDir = normalizePath(
		path.relative(scanRoot, path.resolve(workspaceRoot, detection.uiDir)),
	);
	const scanRelativeComponentsDir = normalizePath(
		path.relative(
			scanRoot,
			path.resolve(workspaceRoot, detection.componentsDir),
		),
	);

	const routeFiles = await listRouteFiles(scanRoot);
	const routingMode = detectRoutingMode(routeFiles);
	const routeEntries: WorkspaceRouteEntry[] = routeFiles.map((filePath) => ({
		routePath: /(?:^|\/)pages\//.test(filePath)
			? routePathFromPagesFile(filePath)
			: routePathFromAppFile(filePath),
		filePath,
		kind: inferRouteKind(filePath),
		sourceRoot: /(?:^|\/)pages\//.test(filePath) ? "pages" : "app",
		routeGroupSegments: extractRouteGroupSegments(filePath),
		parallelRouteKeys: extractParallelRouteKeys(filePath),
		dynamicSegments: extractDynamicSegments(filePath),
	}));
	const layoutEntries: WorkspaceLayoutEntry[] = routeEntries
		.filter((entry) => entry.kind === "layout")
		.map((entry) => ({
			routePath: entry.routePath,
			filePath: entry.filePath,
			routeGroupSegments: entry.routeGroupSegments || [],
		}));
	const routeGroups = Array.from(
		new Set(routeEntries.flatMap((entry) => entry.routeGroupSegments || [])),
	).sort();
	const parallelRouteKeys = Array.from(
		new Set(routeEntries.flatMap((entry) => entry.parallelRouteKeys || [])),
	).sort();

	const componentEntries = await buildWorkspaceComponentEntries({
		root: scanRoot,
		uiDir: scanRelativeUiDir,
		componentsDir: scanRelativeComponentsDir,
	});
	const tokenHints = await buildWorkspaceTokenHints(scanRoot);
	const patternHints = await buildWorkspacePatternHints(scanRoot);
	const styleStack = deriveStyleStack({
		detectionEvidence: detection.evidence,
		tokenHints,
	});
	const unknowns: string[] = [];

	if (!routeEntries.length) {
		unknowns.push(
			"No route files were discovered in the target root for app-router or pages-router detection.",
		);
	}
	if (!componentEntries.length) {
		unknowns.push("No component inventory was discovered under the target root.");
	}
	if (!tokenHints.cssVariableFiles.length) {
		unknowns.push("No obvious CSS variable or token files were discovered.");
	}
	if (routingMode === "mixed") {
		unknowns.push(
			"Both app-router and pages-router signals were discovered; shared routing assumptions may require manual confirmation.",
		);
	}
	const hotspots = buildHotspots({
		layoutEntries,
		routeGroups,
		parallelRouteKeys,
		patternHints,
		styleStack,
	});
	const confidence = buildConfidenceSummary({
		routeEntries,
		componentEntries,
		tokenHints,
		patternHints,
		unknowns,
	});
	const evidenceAnchors = buildEvidenceAnchors({
		routeEntries,
		componentEntries,
		tokenHints,
		patternHints,
		styleStack,
	});

	return {
		version: 1,
		workspaceRoot: normalizePath(workspaceRoot),
		defaultTargetRoot,
		uiImportBase: detection.uiImportBase,
		uiDir: scanRelativeUiDir,
		componentsDir: scanRelativeComponentsDir,
		componentsImportBase: detection.componentsImportBase,
		routeEntries,
		routingMode,
		routeGroups,
		parallelRouteKeys,
		layoutEntries,
		componentEntries,
		tokenHints,
		patternHints,
		styleStack,
		evidence: detection.evidence,
		evidenceAnchors,
		hotspots,
		confidence,
		unknowns,
	};
}
