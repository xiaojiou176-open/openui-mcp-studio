import type { Metadata } from "next";

import {
  PRIMARY_KEYWORDS,
  SITE_BRAND,
  SUPPORTING_KEYWORDS,
} from "./frontdoor-content";
import { SOCIAL_PREVIEW_ROUTE } from "./social-preview";

const GITHUB_PAGES_DEPLOY_TARGET = "github-pages";

function isSupportedSiteProtocol(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function resolveSiteUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    if (!isSupportedSiteProtocol(url)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function normalizePathInput(pathValue: string): string {
  if (!pathValue || pathValue === "/") {
    return "";
  }
  return pathValue.startsWith("/") ? pathValue.slice(1) : pathValue;
}

function getSiteUrlObject(input?: string | URL | null): URL | null {
  if (!input) {
    return null;
  }

  if (input instanceof URL) {
    return input;
  }

  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function isStaticExportBuild(): boolean {
  return process.env.OPENUI_DEPLOY_TARGET === GITHUB_PAGES_DEPLOY_TARGET;
}

export function resolveSiteHref(
  pathValue: string,
  siteUrlInput?: string | URL | null,
): string {
  const siteUrl = getSiteUrlObject(siteUrlInput ?? resolveSiteUrl());
  if (!siteUrl) {
    return pathValue;
  }

  const basePath = siteUrl.pathname.endsWith("/")
    ? siteUrl.pathname
    : `${siteUrl.pathname}/`;
  const normalizedPath = normalizePathInput(pathValue);

  return new URL(normalizedPath, `${siteUrl.origin}${basePath}`).toString();
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  const siteUrl = resolveSiteUrl();
  const canonicalUrl = siteUrl ? resolveSiteHref(input.path, siteUrl) : undefined;
  const socialPreviewImages = siteUrl
    ? [resolveSiteHref(SOCIAL_PREVIEW_ROUTE, siteUrl)]
    : undefined;
  const indexable = shouldIndexFrontdoor();
  const keywords = Array.from(new Set([
    ...PRIMARY_KEYWORDS,
    ...SUPPORTING_KEYWORDS,
    ...(input.keywords || []),
  ]));

  return {
    applicationName: SITE_BRAND.technicalName,
    category: "developer tools",
    title: input.title,
    description: input.description,
    keywords,
    robots: indexable
      ? {
          index: true,
          follow: true,
        }
      : {
          index: false,
          follow: false,
        },
    alternates: canonicalUrl
      ? {
          canonical: canonicalUrl,
          languages: {
            "en-US": canonicalUrl,
          },
        }
      : undefined,
    openGraph: {
      title: input.title,
      description: input.description,
      locale: "en_US",
      type: "website",
      url: canonicalUrl,
      siteName: SITE_BRAND.frontdoorName,
      images: socialPreviewImages,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: socialPreviewImages,
    },
  };
}

export function shouldIndexFrontdoor(): boolean {
  return resolveSiteUrl() !== null;
}

export function getResolvedSiteUrl(): string | null {
  return resolveSiteUrl()?.toString() ?? null;
}

export function getResolvedSiteUrlObject(): URL | undefined {
  return resolveSiteUrl() ?? undefined;
}
