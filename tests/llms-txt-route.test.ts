import { describe, expect, it } from "vitest";

import { GET } from "../apps/web/app/llms.txt/route";

describe("llms.txt route", () => {
	it("returns an English-first machine-readable front-door summary", async () => {
		const response = GET();
		const text = await response.text();

		expect(response.headers.get("content-type")).toContain("text/plain");
		expect(text).toContain("# OpenUI MCP Studio");
		expect(text).toContain("> OneClickUI.ai is the front door");
		expect(text).toContain("frontdoor_label: OneClickUI.ai");
		expect(text).toContain("technical_product: OpenUI MCP Studio");
		expect(text).toContain("canonical_runtime: local stdio MCP");
		expect(text).toContain("primary_bindings: MCP, Codex, Claude Code");
		expect(text).toContain(
			"summary: Turn UI/UX briefs into React + shadcn delivery",
		);
		expect(text).toContain(
			"positioning: A stronger UI/UX execution, proof, and review companion",
		);
		expect(text).toContain("public_surface_language: en-US");
		expect(text).toContain("default_locale: en-US");
		expect(text).toContain("supported_locales: en-US, zh-CN");
		expect(text).toContain("locale_cookie: openui_locale");
		expect(text).toContain(
			"ui_switch_scope: apps/web frontdoor routes and shared shell",
		);
		expect(text).toContain("i18n_policy: English-first public pages");
		expect(text).toContain("compatibility OpenAPI URL:");
		expect(text).toContain("## Later lanes, not current promises");
		expect(text).toContain(
			"- registry publication for supporting package surfaces",
		);
		expect(text).not.toContain("- formal Skills surface");
		expect(text).toContain("## Discovery chain");
		expect(text).toContain("## Ecosystem productization");
		expect(text).toContain("- Public Skills starter kit: current-packaging");
		expect(text).toContain(
			"- Codex and Claude plugin-grade public package: official-surface-ready",
		);
		expect(text).toContain("- OpenClaw public-ready bundle: clawhub-ready");
		expect(text).toContain("- Hosted client SDK: supporting-parked");
		expect(text).toContain("## Operator-only public surfaces");
		expect(text).toContain("- GitHub Homepage");
		expect(text).toContain("- frontdoor JSON: /api/frontdoor");
		expect(text).toContain("- manifest.webmanifest: /manifest.webmanifest");
		expect(text).toContain("- robots.txt: /robots.txt");
		expect(text).toContain("  - role: proof desk");
		expect(text).toContain("  - audience: evaluators, reviewers");
		expect(text).toContain("  - best_for:");
		expect(text).toContain("  - read_when:");
		expect(text).toContain("not_the_main_category: generic AI assistant");
		expect(text).toContain(
			"- Codex and Claude now have a repo-owned plugin-grade public package, and OpenClaw now has a repo-owned public-ready bundle",
		);
		expect(text).toContain(
			"- official listing, registry publication, and managed deployment remain later/operator-owned",
		);
		expect(text).toContain("- Open the operator desk: /workbench");
	});
});
