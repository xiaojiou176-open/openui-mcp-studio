export type WorkspaceRouteKind = "page" | "layout" | "route" | "loading" | "error";
export type WorkspaceRoutingMode =
	| "app-router"
	| "pages-router"
	| "mixed"
	| "unknown";
export type WorkspaceSignalConfidence = "high" | "medium" | "low";

export type WorkspaceRouteEntry = {
	routePath: string;
	filePath: string;
	kind: WorkspaceRouteKind;
	sourceRoot?: "app" | "pages";
	routeGroupSegments?: string[];
	parallelRouteKeys?: string[];
	dynamicSegments?: string[];
};

export type WorkspaceLayoutEntry = {
	routePath: string;
	filePath: string;
	routeGroupSegments: string[];
};

export type WorkspaceComponentEntry = {
	filePath: string;
	exportNames: string[];
	category: "ui" | "generated" | "shared" | "other";
};

export type WorkspacePatternHints = {
	formLibraries: string[];
	formFiles?: string[];
	dataLibraries: string[];
	serverActionFiles: string[];
	clientComponentFiles: string[];
	tableFiles?: string[];
	chartFiles?: string[];
	navigationFiles?: string[];
};

export type WorkspaceTokenHints = {
	tokenFiles: string[];
	cssVariableFiles: string[];
	tailwindConfigFiles: string[];
};

export type WorkspaceStyleStack = {
	usesComponentsJson: boolean;
	usesTailwindConfig: boolean;
	usesCssVariables: boolean;
	tokenAuthority: "css-variables" | "tailwind-only" | "unknown";
};

export type WorkspaceEvidenceAnchor = {
	area: "routing" | "components" | "styling" | "patterns";
	label: string;
	reason: string;
	confidence: WorkspaceSignalConfidence;
	filePath?: string;
};

export type WorkspaceHotspot = {
	kind:
		| "layout-shell"
		| "route-group"
		| "parallel-route"
		| "form-surface"
		| "data-surface"
		| "table-surface"
		| "chart-surface"
		| "navigation-surface"
		| "token-authority";
	label: string;
	reason: string;
	severity: "high" | "medium" | "low";
	filePath?: string;
};

export type WorkspaceConfidenceSummary = {
	routing: WorkspaceSignalConfidence;
	components: WorkspaceSignalConfidence;
	styling: WorkspaceSignalConfidence;
	patterns: WorkspaceSignalConfidence;
	overall: WorkspaceSignalConfidence;
};

export type WorkspaceProfile = {
	version: 1;
	workspaceRoot: string;
	defaultTargetRoot: string;
	uiImportBase: string;
	uiDir: string;
	componentsDir: string;
	componentsImportBase: string;
	routeEntries: WorkspaceRouteEntry[];
	routingMode?: WorkspaceRoutingMode;
	routeGroups?: string[];
	parallelRouteKeys?: string[];
	layoutEntries?: WorkspaceLayoutEntry[];
	componentEntries: WorkspaceComponentEntry[];
	tokenHints: WorkspaceTokenHints;
	patternHints: WorkspacePatternHints;
	styleStack?: WorkspaceStyleStack;
	evidence: string[];
	evidenceAnchors?: WorkspaceEvidenceAnchor[];
	hotspots?: WorkspaceHotspot[];
	confidence?: WorkspaceConfidenceSummary;
	unknowns: string[];
};
