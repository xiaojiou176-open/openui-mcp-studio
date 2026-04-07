import {
	BRAND_SPLIT,
	CURRENT_BUILDER_SURFACE_ORDER,
	LATER_BUILDER_SURFACE_LANES,
	AI_CAPABILITY_LANES,
	BUILDER_ENTRY_POINTS,
	DISCOVERY_CHAIN,
	ECOSYSTEM_PRODUCTIZATION_STATUS,
	ECOSYSTEM_BINDINGS,
	FRONTDOOR_ROUTE_CONTRACTS,
	MACHINE_READABLE_SURFACES,
	OPERATOR_ONLY_PUBLIC_SURFACES,
	PRODUCT_POSITIONING,
	PUBLIC_BUNDLE,
	PUBLIC_PRODUCT_LINES,
	SITE_BRAND,
} from "./frontdoor-content";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	SUPPORTED_LOCALES,
} from "./i18n/config";
import { resolveSiteHref } from "./site-metadata";

function resolveFrontdoorUrl(pathValue: string, siteUrl?: string | null): string {
	if (siteUrl) {
		return resolveSiteHref(pathValue, siteUrl);
	}
	return pathValue;
}

export function buildFrontdoorPayload(input?: { siteUrl?: string | null }) {
	const siteUrl = input?.siteUrl ?? null;

	return {
		product: {
			technicalName: SITE_BRAND.technicalName,
			frontdoorName: SITE_BRAND.frontdoorName,
			category: PRODUCT_POSITIONING.category,
			summary: PRODUCT_POSITIONING.summary,
			positioning: PRODUCT_POSITIONING.companionLine,
			language: "en-US",
		},
		brandSplit: {
			technicalName: SITE_BRAND.technicalName,
			frontdoorName: SITE_BRAND.frontdoorName,
			frontdoorLabel: SITE_BRAND.frontdoorLabel,
			poweredBy: SITE_BRAND.poweredBy,
			canonicalRuntime: BRAND_SPLIT.canonicalRuntime,
			technicalTruth: BRAND_SPLIT.technicalTruth,
			notTruth: BRAND_SPLIT.notTruth,
		},
		routes: FRONTDOOR_ROUTE_CONTRACTS.map((route) => ({
			...route,
			url: resolveFrontdoorUrl(route.href, siteUrl),
		})),
		discoveryChain: DISCOVERY_CHAIN.map((item) => ({
			...item,
			url: item.href.startsWith("/")
				? resolveFrontdoorUrl(item.href, siteUrl)
				: item.href,
		})),
		bindings: ECOSYSTEM_BINDINGS,
		aiCapabilities: AI_CAPABILITY_LANES,
		builderEntryPoints: BUILDER_ENTRY_POINTS,
		machineReadableSurfaces: MACHINE_READABLE_SURFACES.map((surface) => ({
			...surface,
			url: resolveFrontdoorUrl(surface.href, siteUrl),
		})),
		ecosystemProductization: ECOSYSTEM_PRODUCTIZATION_STATUS,
		publicProductLines: PUBLIC_PRODUCT_LINES,
		publicBundle: PUBLIC_BUNDLE,
		operatorOnlyPublicSurfaces: OPERATOR_ONLY_PUBLIC_SURFACES,
		i18n: {
			publicSurfaceLanguage: "en-US",
			defaultLocale: DEFAULT_LOCALE,
			supportedLocales: SUPPORTED_LOCALES,
			localeCookieName: LOCALE_COOKIE_NAME,
			uiSwitchScope: "apps/web frontdoor routes and shared shell",
			coverageStage:
				"Frontdoor routes plus the proof desk, workbench shell, next-action guidance, pause guidance, dialog, success/error, and key state copy now support bilingual switching; broader descriptive parity remains a later expansion lane.",
			switchStrategy:
				"Cookie-backed UI switch with English-first canonical public routes.",
			localeSource:
				"Persist the explicit product-UI language choice in the locale cookie, then fall back to en-US for the canonical public route.",
			messageSource:
				"Centralized route copy lives in apps/web/lib/i18n/messages.ts and apps/web/app/workbench-data.ts. Do not scatter bilingual literals across route files.",
			policy:
				"English-first public pages and machine-readable routes; product UI may switch to zh-CN through centralized message sources; avoid scattered mixed-language literals across the front door.",
		},
		seo: {
			indexable: true,
			canonicalSiteUrl: siteUrl,
			manifest: resolveFrontdoorUrl("/manifest.webmanifest", siteUrl),
			sitemap: resolveFrontdoorUrl("/sitemap.xml", siteUrl),
			robots: resolveFrontdoorUrl("/robots.txt", siteUrl),
		},
		repository: {
			url: SITE_BRAND.repoUrl,
			docs: SITE_BRAND.docs,
		},
		builderSurface: {
			order: CURRENT_BUILDER_SURFACE_ORDER,
			laterLanes: LATER_BUILDER_SURFACE_LANES,
		},
		boundaries: [
			"not a hosted SaaS-first builder",
			"not a generic AI assistant",
			"not a generic coding agent",
			"write-capable remote MCP is not the current promise",
			"unsupported marketplace claims remain out of scope",
		],
	};
}

export type FrontdoorPayload = ReturnType<typeof buildFrontdoorPayload>;
