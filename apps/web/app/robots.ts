import type { MetadataRoute } from "next";

import { getResolvedSiteUrl, shouldIndexFrontdoor } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getResolvedSiteUrl();
  const indexable = shouldIndexFrontdoor();

  return {
    rules: indexable
      ? {
          userAgent: "*",
          allow: "/",
        }
      : {
          userAgent: "*",
          disallow: "/",
        },
    sitemap: siteUrl ? [`${siteUrl}sitemap.xml`] : undefined,
    host: siteUrl ?? undefined,
  };
}
