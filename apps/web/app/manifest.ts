import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "OpenUI MCP Studio",
		short_name: "OpenUI",
		description:
			"MCP-native UI/UX delivery companion for Codex and Claude Code with proof, review, and acceptance.",
		start_url: "/",
		display: "standalone",
		background_color: "#f8fbff",
		theme_color: "#2457d6",
		categories: ["developer", "productivity", "design"],
			shortcuts: [
				{
					name: "Docs guide",
					short_name: "Docs",
					url: "/docs",
					description:
						"Human-readable discovery route that keeps README, proof, evaluator, release, and ecosystem guidance in one in-app path.",
				},
				{
					name: "30-second proof",
					short_name: "Proof",
				url: "/proof",
				description:
					"Proof desk for evaluators who need the shortest honest path through repo-owned evidence and next-step routing.",
			},
			{
				name: "Compare",
				short_name: "Compare",
				url: "/compare",
				description:
					"Decision surface for teams comparing repo-aware UI delivery with hosted builders without flattening the category boundary.",
			},
			{
				name: "Workbench",
				short_name: "Workbench",
				url: "/workbench",
				description:
					"Operator desk for repo-local packet decisions, proof checks, and next-step guidance that still stops short of live ops truth.",
			},
			{
				name: "LLM guide",
				short_name: "llms.txt",
				url: "/llms.txt",
				description:
					"Machine-readable front-door summary with route roles, builder order, and current product boundaries for LLM and agent consumers.",
				},
			],
		};
}
