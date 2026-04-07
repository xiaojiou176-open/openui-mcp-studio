import {
	BRAND_SPLIT,
	CURRENT_BUILDER_SURFACE_ORDER,
	DISCOVERY_CHAIN,
	ECOSYSTEM_PRODUCTIZATION_STATUS,
	FRONTDOOR_ROUTE_CONTRACTS,
	LATER_BUILDER_SURFACE_LANES,
	MACHINE_READABLE_SURFACES,
	OPERATOR_ONLY_PUBLIC_SURFACES,
	PRODUCT_POSITIONING,
	PUBLIC_BUNDLE,
	SITE_BRAND,
} from "../../lib/frontdoor-content";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
} from "../../lib/i18n/config";
import { getResolvedSiteUrl, resolveSiteHref } from "../../lib/site-metadata";

export const dynamic = "force-static";

function resolveFrontdoorUrl(path: string): string {
	const siteUrl = getResolvedSiteUrl();
	if (siteUrl) {
		return resolveSiteHref(path, siteUrl);
	}
	return path;
}

function formatDiscoveryContract(item: {
	label: string;
	href: string;
	role: string;
	audience: string;
	bestFor: string;
	notFor: string;
	boundary: string;
}): string[] {
	return [
		`- ${item.label}: ${resolveFrontdoorUrl(item.href)}`,
		`  - role: ${item.role}`,
		`  - audience: ${item.audience}`,
		`  - best_for: ${item.bestFor}`,
		`  - not_for: ${item.notFor}`,
		`  - boundary: ${item.boundary}`,
	];
}

function buildLlmsText(): string {
	const lines = [
		`# ${SITE_BRAND.technicalName}`,
		"",
		`> ${SITE_BRAND.frontdoorName} is the front door for ${SITE_BRAND.technicalName}: ${PRODUCT_POSITIONING.summary}`,
		"",
		`frontdoor_label: ${SITE_BRAND.frontdoorName}`,
		`technical_product: ${SITE_BRAND.technicalName}`,
		`canonical_runtime: ${BRAND_SPLIT.canonicalRuntime}`,
		`summary: ${PRODUCT_POSITIONING.summary}`,
		`positioning: ${PRODUCT_POSITIONING.companionLine}`,
		"language: en-US",
		"public_surface_language: en-US",
		`default_locale: ${DEFAULT_LOCALE}`,
		`supported_locales: ${SUPPORTED_LOCALES.join(", ")}`,
		`locale_cookie: ${LOCALE_COOKIE_NAME}`,
		"ui_switch_scope: apps/web frontdoor routes and shared shell",
		"bilingual_coverage_stage: frontdoor routes plus the proof desk, workbench shell, next-action guidance, pause guidance, dialog, success/error, and key state copy",
		`category: ${PRODUCT_POSITIONING.secondaryCategory}`,
		"primary_bindings: MCP, Codex, Claude Code",
		"secondary_comparisons: OpenHands, OpenCode",
		"not_the_main_category: generic AI assistant, generic coding agent, hosted app builder",
		"i18n_policy: English-first public pages and machine-readable routes; product UI can switch between en-US and zh-CN through centralized locale messages.",
		"",
		"## Start here",
		...FRONTDOOR_ROUTE_CONTRACTS.flatMap((route) =>
			formatDiscoveryContract(route),
		),
		`- README: ${SITE_BRAND.docs.readme}`,
		`- Discovery guide: ${SITE_BRAND.docs.discoveryGuide}`,
		`- Docs index: ${SITE_BRAND.docs.docsIndex}`,
		`- Proof FAQ: ${SITE_BRAND.docs.proofFaq}`,
		`- Walkthrough doc: ${SITE_BRAND.docs.walkthrough}`,
		`- Ecosystem contract: ${SITE_BRAND.docs.ecosystemContract}`,
		"",
		"## Discovery chain",
		...DISCOVERY_CHAIN.map(
			(item) =>
				[
					`- ${item.step}. ${item.title}: ${resolveFrontdoorUrl(item.href)}`,
					`  - role: ${item.role}`,
					`  - best_for: ${item.body}`,
				].join("\n"),
		),
		"",
		"## Builder-facing surfaces",
		...CURRENT_BUILDER_SURFACE_ORDER.map(
			(surface, index) =>
				[
					`- ${index + 1}. ${surface.title}: ${surface.body}`,
					`  - audience: ${surface.audience}`,
					`  - best_for: ${surface.bestFor}`,
					`  - read_when: ${surface.readWhen}`,
					`  - not_for: ${surface.notFor}`,
				].join("\n"),
		),
		`- compatibility OpenAPI URL: ${SITE_BRAND.docs.apiContract}`,
		"",
		"## Later lanes, not current promises",
		...LATER_BUILDER_SURFACE_LANES.map((lane) => `- ${lane}`),
		"",
		"## Machine-readable discovery",
		...MACHINE_READABLE_SURFACES.map((surface) =>
			[
				`- ${surface.label}: ${resolveFrontdoorUrl(surface.href)}`,
				`  - audience: ${surface.audience}`,
				`  - best_for: ${surface.bestFor}`,
				`  - read_when: ${surface.readWhen}`,
				`  - not_for: ${surface.notFor}`,
			].join("\n"),
		),
		"",
		"## Ecosystem productization",
		...ECOSYSTEM_PRODUCTIZATION_STATUS.map((surface) =>
			[
				`- ${surface.title}: ${surface.status}`,
				`  - audience: ${surface.audience}`,
				`  - best_for: ${surface.bestFor}`,
				`  - read_when: ${surface.readWhen}`,
				`  - not_for: ${surface.notFor}`,
			].join("\n"),
		),
		"",
		"## Public bundle",
		...PUBLIC_BUNDLE.map((bundle) =>
			[
				`- ${bundle.title}:`,
				...bundle.items.map((item) => `  - ${item}`),
			].join("\n"),
		),
		"",
		"## Operator-only public surfaces",
		...OPERATOR_ONLY_PUBLIC_SURFACES.map((surface) =>
			[
				`- ${surface.title}`,
				`  - reason: ${surface.body}`,
			].join("\n"),
		),
		"",
		"## Honest boundaries",
		"- not a hosted SaaS-first builder",
		"- not a generic autonomous coding agent",
		"- write-capable remote MCP is not the current promise",
		"- Codex and Claude now have a repo-owned plugin-grade public package, and OpenClaw now has a repo-owned public-ready bundle",
		"- the Skills starter pack remains current while @openui/sdk and the self-hosted Hosted API stay supporting or parked",
		"- official listing, registry publication, and managed deployment remain later/operator-owned",
	];

	return `${lines.join("\n")}\n`;
}

export function GET(): Response {
	return new Response(buildLlmsText(), {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=300",
		},
	});
}
