import { buildFrontdoorPayload } from "../../../lib/frontdoor-api-payload";
import { getResolvedSiteUrl, shouldIndexFrontdoor } from "../../../lib/site-metadata";

export const dynamic = "force-static";

export function GET(): Response {
	const siteUrl = getResolvedSiteUrl();
	const payload = buildFrontdoorPayload({
		siteUrl,
	});

	return Response.json({
		...payload,
		seo: {
			indexable: shouldIndexFrontdoor(),
			canonicalSiteUrl: siteUrl,
			manifest: payload.seo.manifest,
			sitemap: payload.seo.sitemap,
			robots: payload.seo.robots,
		},
	});
}
