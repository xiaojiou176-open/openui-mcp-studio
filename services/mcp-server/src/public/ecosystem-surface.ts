export type OpenuiEcosystemSurfaceStatus =
	| "starter-only"
	| "current-packaging"
	| "future-ready"
	| "compatibility-only"
	| "plugin-grade-public-package"
	| "public-ready"
	| "supporting-parked";

export type OpenuiEcosystemSurfaceEntry = {
	id: string;
	title: string;
	status: OpenuiEcosystemSurfaceStatus;
	audience: string;
	bestFor: string;
	readWhen: string;
	notFor: string;
	description: string;
};

export const OPENUI_ECOSYSTEM_SURFACE_ORDER = [
	{
		id: "formal-skills",
		title: "Public Skills starter kit",
		status: "current-packaging",
		audience: "maintainers and builders drafting future skill-shaped integrations",
		bestFor:
			"installable starter contracts, manifests, and examples that stay honest about the current builder surface",
		readWhen:
			"Read this after the main MCP, OpenAPI, and workflow surfaces are clear and you need a public starter contract.",
		notFor:
			"claiming a marketplace listing, hosted Skills runtime, or vendor-approved plugin catalog",
		description:
			"Current truth now includes an installable public starter package while staying explicitly short of a marketplace or hosted Skills runtime.",
	},
	{
		id: "plugin-like-install-packaging",
		title: "Codex and Claude plugin-grade public package",
		status: "plugin-grade-public-package",
		audience: "Codex and Claude Code users who install local MCP servers",
		bestFor:
			"configuration snippets, starter bundles, proof loop, and discovery metadata that make local MCP installation feel productized",
		readWhen:
			"Read this when the next question is how to add OpenUI to Codex or Claude Code without inventing an official plugin marketplace story.",
		notFor:
			"claiming a Codex marketplace item or a published Claude Code plugin before those artifacts exist",
		description:
			"The strongest current packaging is a repo-owned plugin-grade public package, not a listed marketplace plugin.",
	},
	{
		id: "openclaw-public-ready",
		title: "OpenClaw public-ready bundle",
		status: "public-ready",
		audience: "OpenClaw-side builders and operators who need a discoverable repo-owned install and proof path",
		bestFor:
			"starter config, proof loop, and machine-readable discovery artifacts before any official listing exists",
		readWhen:
			"Read this when the next question is how to present OpenUI honestly to OpenClaw-side users without pretending a catalog approval exists.",
		notFor:
			"claiming an official OpenClaw runtime, ClawHub listing, or vendor approval",
		description:
			"The repo now ships a public-ready OpenClaw bundle at the artifact layer, but not an official listing.",
	},
	{
		id: "public-sdk",
		title: "Hosted client SDK",
		status: "supporting-parked",
		audience: "developers evaluating future thin-client or package surfaces",
		bestFor:
			"installing a thin HTTP client for the hosted compatibility service with explicit auth and boundary semantics",
		readWhen:
			"Read this when the question becomes 'how do I call the hosted compatibility service from code?'",
		notFor: "claiming a registry-published SDK or a local MCP replacement",
		description:
			"Current truth still includes an installable hosted client SDK package, but it is now a supporting or parked lane.",
	},
	{
		id: "hosted-api",
		title: "Hosted compatibility service",
		status: "supporting-parked",
		audience: "adapter authors and future hosted-surface planners",
		bestFor:
			"running an authenticated HTTP compatibility service that bridges into the current MCP runtime",
		readWhen:
			"Read this after the compatibility bridge semantics are clear and you need a real HTTP service/runtime surface.",
		notFor:
			"claiming a managed SaaS deployment, control plane, or remote write surface",
		description:
			"Current truth still includes a repo-run hosted compatibility service with auth, rate limit, and observability boundaries, but it is now a supporting or parked lane.",
	},
] as const satisfies readonly OpenuiEcosystemSurfaceEntry[];

export const OPENUI_ECOSYSTEM_OPERATOR_ONLY_ACTIONS = [
	"GitHub Homepage or custom landing-site settings",
	"GitHub Social Preview selection and verification",
	"publishing draft releases and refreshing attached public assets",
	"official marketplace or catalog submission",
	"marketplace or vendor account submission",
	"domain, DNS, TLS, and hosted infrastructure setup",
] as const;
