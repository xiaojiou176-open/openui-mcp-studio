import type { MetadataRoute } from "next";

import {
  getResolvedSiteUrl,
  resolveSiteHref,
  shouldIndexFrontdoor,
} from "@/lib/site-metadata";

export const dynamic = "force-static";

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
    sitemap: siteUrl ? [resolveSiteHref("/sitemap.xml", siteUrl)] : undefined,
    host: siteUrl ? new URL(siteUrl).origin : undefined,
  };
}
