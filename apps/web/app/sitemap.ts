import type { MetadataRoute } from "next";

import { getResolvedSiteUrl, shouldIndexFrontdoor } from "@/lib/site-metadata";

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
    url: new URL(route, siteUrl).toString(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : route === "/workbench" ? 0.8 : 0.7,
  }));
}
