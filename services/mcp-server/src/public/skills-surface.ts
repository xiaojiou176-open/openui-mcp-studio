export type OpenUiPublicSkillsStarterPackFile = {
	path: string;
	role: string;
};

export const OPENUI_PUBLIC_SKILLS_STARTER_PACK = {
	id: "public-skills-starter-pack",
	title: "Plugin-grade public starter pack",
	status: "plugin-grade-public-package",
	audience:
		"maintainers and builder teams drafting skill-shaped OpenUI integrations or official-surface-ready bundles",
	bestFor:
		"copyable starter contracts, manifest-driven discovery, starter bundles, and install/use guidance that stay honest about current runtime boundaries",
	readWhen:
		"Open this after the main MCP path is clear and you need a formal public starter-pack or official-surface-ready bundle for Codex, Claude Code, or OpenClaw-style integrations.",
	notFor:
		"claiming a marketplace listing, a managed Skills runtime, or any official publication that has not been freshly verified",
	manifestPath: "examples/skills/public-starter.manifest.json",
	files: [
		{
			path: "examples/skills/README.md",
			role: "starter-pack overview",
		},
		{
			path: "examples/skills/public-starter.manifest.json",
			role: "machine-readable public starter-pack contract",
		},
		{
			path: "examples/skills/starter-contract.md",
			role: "field definitions and authoring rules",
		},
		{
			path: "examples/skills/starter-contract.template.json",
			role: "copyable starter template",
		},
		{
			path: "examples/skills/starter-contract.example.json",
			role: "honest repo-side example",
		},
		{
			path: "examples/skills/integration-note.md",
			role: "boundary-first integration note",
		},
		{
			path: "examples/skills/install-use-note.md",
			role: "zero-context install/use route",
		},
		{
			path: "packages/skills-kit/starter-bundles/codex-plugin/",
			role: "Codex Plugin Directory-ready bundle",
		},
		{
			path: "packages/skills-kit/starter-bundles/claude-code-plugin/",
			role: "Claude Code marketplace-ready bundle",
		},
		{
			path: "packages/skills-kit/starter-bundles/openclaw-skill/",
			role: "OpenClaw / ClawHub-ready skill bundle",
		},
		{
			path: "packages/skills-kit/starter-troubleshooting.md",
			role: "starter troubleshooting guide",
		},
	],
	commands: [
		"openui-mcp-studio skills starter --json",
		"openui-mcp-studio ecosystem-guide --json",
	],
	boundary:
		"Formal public starter-pack packaging is current, including plugin-grade starter bundles and the OpenClaw public-ready bundle. Marketplace listings, official catalog approval, and vendor-specific submissions remain operator-only or later.",
} as const;
