import type { MetadataRoute } from "next";
import { getResolvedSiteUrl, resolveSiteHref } from "../lib/site-metadata";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
	const siteUrl = getResolvedSiteUrl();
	return {
		name: "OpenUI MCP Studio",
		short_name: "OpenUI",
		description:
			"MCP-native UI/UX delivery companion for Codex and Claude Code with proof, review, and acceptance.",
		start_url: resolveSiteHref("/", siteUrl),
		display: "standalone",
		background_color: "#f8fbff",
		theme_color: "#2457d6",
		categories: ["developer", "productivity", "design"],
			shortcuts: [
				{
					name: "Docs guide",
					short_name: "Docs",
					url: resolveSiteHref("/docs", siteUrl),
					description:
						"Human-readable discovery route that keeps README, proof, evaluator, release, and ecosystem guidance in one in-app path.",
				},
				{
					name: "30-second proof",
					short_name: "Proof",
				url: resolveSiteHref("/proof", siteUrl),
				description:
					"Proof desk for evaluators who need the shortest honest path through repo-owned evidence and next-step routing.",
			},
			{
				name: "Compare",
				short_name: "Compare",
				url: resolveSiteHref("/compare", siteUrl),
				description:
					"Decision surface for teams comparing repo-aware UI delivery with hosted builders without flattening the category boundary.",
			},
			{
				name: "Workbench",
				short_name: "Workbench",
				url: resolveSiteHref("/workbench", siteUrl),
				description:
					"Operator desk for repo-local packet decisions, proof checks, and next-step guidance that still stops short of live ops truth.",
			},
			{
				name: "LLM guide",
				short_name: "llms.txt",
				url: resolveSiteHref("/llms.txt", siteUrl),
				description:
					"Machine-readable front-door summary with route roles, builder order, and current product boundaries for LLM and agent consumers.",
				},
			],
		};
}
