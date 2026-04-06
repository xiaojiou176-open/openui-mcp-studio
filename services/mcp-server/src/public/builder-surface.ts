export type OpenuiPublicExportAudience = "builder" | "ops" | "testing";
export type OpenuiSurfaceStatus = "current" | "later";
export type OpenuiBuilderSurfaceAudience =
	| "builder"
	| "builder-contract-reader"
	| "maintainer-operator";

export type OpenuiPublicExportEntry = {
	module: string;
	audience: OpenuiPublicExportAudience;
	status: OpenuiSurfaceStatus;
	description: string;
	bestFor: string;
	notFor: string;
};

export type OpenuiBuilderSurfaceEntry = {
	position: 1 | 2 | 3;
	id: string;
	status: "current";
	surface: string;
	entrypoints: readonly string[];
	description: string;
	audience: OpenuiBuilderSurfaceAudience;
	bestFor: string;
	readWhen: string;
	notFor: string;
};

export type OpenuiLaterLaneEntry = {
	id: string;
	status: "later";
	description: string;
};

export type OpenuiSkillsStarterFileEntry = {
	path: string;
	role: string;
};

export type OpenuiBuilderSurfaceGuide = {
	audience: string;
	startWith: string;
	openapiWhen: string;
	workflowPacketWhen: string;
	skillsStarterWhen: string;
	notFor: readonly string[];
};

export type OpenuiBuilderSurfaceDispatcher = {
	cli: string;
	surfaceGuideCommand: string;
	description: string;
};

export const OPENUI_PUBLIC_EXPORT_ALLOWLIST = [
	{
		module: "uiux-audit-foundation",
		audience: "builder",
		status: "current",
		description:
			"Allowlisted UI/UX audit frame, style-pack, and rubric contract for repo-local review tooling.",
		bestFor:
			"Reading the reusable review frame, style-pack vocabulary, and audit contract from a stable public layer.",
		notFor: "Inventing a new runtime lane or a generic design-system SDK story.",
	},
	{
		module: "builder-surface",
		audience: "builder",
		status: "current",
		description:
			"Frozen repo-side metadata for current builder-facing order and later-lane boundaries.",
		bestFor:
			"Inspecting the current builder order, guide text, and starter-only boundary without reading the whole repo first.",
		notFor: "Treating the package root as a hosted builder API or formal SDK.",
	},
	{
		module: "server",
		audience: "builder",
		status: "current",
		description:
			"Allowlisted local stdio server entrypoints for builder-side runtime wiring.",
		bestFor:
			"Connecting Codex, Claude Code, or another MCP client to the canonical local runtime.",
		notFor: "Claiming a remote-write MCP surface or hosted control plane.",
	},
	{
		module: "workflow-summary",
		audience: "ops",
		status: "current",
		description:
			"Read-only repo workflow readiness bridge for local maintainer/operator flows.",
		bestFor:
			"Maintainer-facing workflow snapshots and readiness packets that stay read-only.",
		notFor: "Acting like a public workflow service or remote mutation endpoint.",
	},
	{
		module: "ship",
		audience: "builder",
		status: "current",
		description:
			"Delivery tool registration surface for page-level and feature-level ship flows.",
		bestFor:
			"Registering the repo's real ship flows from a curated public surface.",
		notFor: "Advertising a generic autonomous agent platform.",
	},
	{
		module: "openui-client",
		audience: "builder",
		status: "current",
		description: "Allowlisted model invocation helpers for repo-local tooling.",
		bestFor:
			"Repo-local model invocation support inside the governed delivery path.",
		notFor: "Selling the package as a standalone hosted inference SDK.",
	},
	{
		module: "next-smoke",
		audience: "ops",
		status: "current",
		description: "Next.js smoke runner for repo-local proof and readiness checks.",
		bestFor:
			"Smoke-boot verification around the default proof target and release workflow.",
		notFor: "Replacing the main MCP runtime entrypoint.",
	},
	{
		module: "computer-use",
		audience: "ops",
		status: "current",
		description:
			"Guarded computer-use registration surface; real but not the primary product story.",
		bestFor:
			"Guarded advanced observation/action helpers that stay outside the primary builder story.",
		notFor: "Reframing OpenUI MCP Studio as a generic computer-use runtime.",
	},
	{
		module: "provider-testing",
		audience: "testing",
		status: "current",
		description:
			"Allowlisted test-side provider reset and sidecar bridge helpers for repo tooling.",
		bestFor:
			"Testing-only provider reset and sidecar bridge hooks for repo-local verification.",
		notFor: "Production builder entrypoints or public integration promises.",
	},
	{
		module: "tool-shared",
		audience: "ops",
		status: "current",
		description: "Shared request-id helper for allowlisted repo tooling.",
		bestFor: "Shared repo-tooling helpers that stay inside the curated public layer.",
		notFor: "A standalone runtime or external builder SDK surface.",
	},
	{
		module: "visual-diff",
		audience: "ops",
		status: "current",
		description: "Visual diff helper for repo-local QA tooling.",
		bestFor:
			"Repo-local visual QA helpers that support proof and review flows.",
		notFor: "Replacing the proof or workbench surfaces with a separate product lane.",
	},
] as const satisfies readonly OpenuiPublicExportEntry[];

export const OPENUI_BUILDER_SURFACE_ORDER = [
	{
		position: 1,
		id: "local-stdio-mcp",
		status: "current",
		surface: "Local stdio MCP",
		entrypoints: [
			"services/mcp-server/src/main.ts",
			"services/mcp-server/src/public/server.ts",
			"openui-mcp-studio mcp",
		],
		description:
			"Primary builder surface for Codex, Claude Code, and other MCP clients.",
		audience: "builder",
		bestFor:
			"Starting a real integration from the canonical local runtime surface.",
		readWhen:
			"Start here when you need the actual execution path for Codex, Claude Code, or another MCP client.",
		notFor:
			"Schema-only review, hosted API expectations, or remote mutation assumptions.",
	},
	{
		position: 2,
		id: "compatibility-openapi-bridge",
		status: "current",
		surface: "Compatibility OpenAPI bridge",
		entrypoints: [
			"docs/contracts/openui-mcp.openapi.json",
			"openui-mcp-studio openapi",
		],
		description:
			"Secondary bridge for contract review and adapter compatibility; not a hosted API claim.",
		audience: "builder-contract-reader",
		bestFor:
			"Reviewing call shape, adapter boundaries, and breaking-change impact after the MCP-first path is clear.",
		readWhen:
			"Read this after the MCP entrypoint when you need compatibility review or schema-oriented inspection.",
		notFor:
			"Replacing the MCP runtime or implying a hosted API product.",
	},
	{
		position: 3,
		id: "repo-local-workflow-readiness",
		status: "current",
		surface: "Repo-local workflow readiness slice",
		entrypoints: [
			"services/mcp-server/src/public/workflow-summary.ts",
			"npm run repo:workflow:summary",
			"npm run repo:workflow:ready",
			"openui-mcp-studio workflow summary",
			"openui-mcp-studio workflow ready",
		],
		description:
			"Maintainer-facing read-only workflow packet that stays separate from remote mutation.",
		audience: "maintainer-operator",
		bestFor:
			"Repo-local readiness checks, GitHub-connected review context, and non-mutating maintainer handoff.",
		readWhen:
			"Open this when the question becomes 'are we ready to move toward PR or checks review?' instead of 'how do I execute the tool?'",
		notFor:
			"Serving as a public API or a remote-mutation surface.",
	},
] as const satisfies readonly OpenuiBuilderSurfaceEntry[];

export const OPENUI_LATER_BUILDER_LANES = [
	{
		id: "plugin-marketplace-listing",
		status: "later",
		description:
			"Marketplace or vendor listing remains later even though truthful install-ready packaging now exists.",
	},
	{
		id: "published-sdk-registry-release",
		status: "later",
		description:
			"The SDK package shape exists, but registry publication and external distribution remain later/operator-owned.",
	},
	{
		id: "deployed-hosted-api-runtime",
		status: "later",
		description:
			"The hosted compatibility service exists as a repo-run runtime, but managed deployment remains later/operator-owned.",
	},
	{
		id: "write-capable-remote-mcp",
		status: "later",
		description:
			"Remote mutation remains out of scope for the current builder-facing contract.",
	},
] as const satisfies readonly OpenuiLaterLaneEntry[];

export const OPENUI_REPO_SIDE_SKILLS_STARTER = {
	root: "packages/skills-kit",
	status: "current-packaging",
	description:
		"Installable public starter kit for skill-shaped integrations, mirrored by repo-local examples for zero-context browsing.",
	bestFor:
		"Installing a public starter contract pack after the current MCP -> OpenAPI -> workflow order is already understood.",
	readWhen:
		"Open after the first three builder surfaces are clear and you need a public starter contract for a skill-shaped integration.",
	notFor:
		"Proof of a marketplace listing, hosted Skills runtime, or write-capable remote MCP surface.",
	files: [
		{
			path: "packages/skills-kit/README.md",
			role: "installable public package overview",
		},
		{
			path: "packages/skills-kit/manifest.json",
			role: "machine-readable public package manifest",
		},
		{
			path: "packages/skills-kit/starter-contract.template.json",
			role: "copyable public starter template",
		},
		{
			path: "packages/skills-kit/starter-contract.example.json",
			role: "honest public starter example",
		},
	],
	boundary:
		"Use this starter kit to draft skill-shaped integrations without claiming a marketplace listing, hosted runtime, or write-capable remote MCP surface.",
} as const satisfies {
	root: string;
	status: "current-packaging";
	description: string;
	bestFor: string;
	readWhen: string;
	notFor: string;
	files: readonly OpenuiSkillsStarterFileEntry[];
	boundary: string;
};

export const OPENUI_BUILDER_SURFACE_DISPATCHER = {
	cli: "openui-mcp-studio",
	surfaceGuideCommand: "openui-mcp-studio surface-guide",
	description:
		"Repo-local dispatcher and formal entry helper for the current builder surface order.",
} as const satisfies OpenuiBuilderSurfaceDispatcher;

export const OPENUI_BUILDER_SURFACE_GUIDE = {
	audience:
		"Zero-context builders evaluating or integrating OpenUI MCP Studio from the repo itself.",
	startWith:
		"Begin with the local stdio MCP surface because it is the canonical runtime entrypoint and the rest of the builder layer only explains or supports that runtime.",
	openapiWhen:
		"Read the OpenAPI bridge after the MCP-first flow is clear and you need compatibility review, adapter shaping, or breaking-change inspection.",
	workflowPacketWhen:
		"Read the workflow packet when you are in maintainer/operator mode and need repo-local plus GitHub-connected readiness without remote mutation.",
	skillsStarterWhen:
		"Open @openui/skills-kit after the first three surfaces are clear and you need a public starter contract for a skill-shaped integration.",
	notFor: [
		"Marketplace listing claims",
		"Registry publication claims",
		"Managed hosted deployment claims",
		"Write-capable remote MCP claims",
	],
} as const satisfies OpenuiBuilderSurfaceGuide;

export const OPENUI_BUILDER_SURFACE_MANIFEST = {
	publicEntrypoint: "services/mcp-server/src/public/index.ts",
	dispatcher: OPENUI_BUILDER_SURFACE_DISPATCHER,
	publicExports: OPENUI_PUBLIC_EXPORT_ALLOWLIST,
	currentOrder: OPENUI_BUILDER_SURFACE_ORDER,
	guide: OPENUI_BUILDER_SURFACE_GUIDE,
	laterLanes: OPENUI_LATER_BUILDER_LANES,
	skillsStarter: OPENUI_REPO_SIDE_SKILLS_STARTER,
} as const;
