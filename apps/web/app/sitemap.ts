import type { MetadataRoute } from "next";

import {
  getResolvedSiteUrl,
  resolveSiteHref,
  shouldIndexFrontdoor,
} from "@/lib/site-metadata";

export const dynamic = "force-static";

const ROUTES = [
	"/",
	"/docs",
	"/proof",
	"/compare",
	"/walkthrough",
	"/workbench",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getResolvedSiteUrl();
  if (!siteUrl || !shouldIndexFrontdoor()) {
    return [];
  }

  return ROUTES.map((route) => ({
    url: resolveSiteHref(route, siteUrl),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/workbench" ? 0.8 : 0.7,
  }));
}
