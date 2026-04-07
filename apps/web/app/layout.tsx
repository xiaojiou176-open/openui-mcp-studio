import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { LocaleProvider } from "@/components/locale-provider";
import {
  COMPARE_KEYWORDS,
  PRIMARY_KEYWORDS,
  SITE_BRAND,
  SUPPORTING_KEYWORDS,
} from "@/lib/frontdoor-content";
import { getRequestLocale } from "@/lib/i18n/server";
import { SOCIAL_PREVIEW_ROUTE } from "@/lib/social-preview";
import { getResolvedSiteUrlObject, resolveSiteHref } from "@/lib/site-metadata";

import "./globals.css";

const siteUrl = getResolvedSiteUrlObject();
const defaultSocialPreviewImage = siteUrl
  ? [resolveSiteHref(SOCIAL_PREVIEW_ROUTE, siteUrl)]
  : undefined;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: SITE_BRAND.technicalName,
  category: "developer tools",
  keywords: Array.from(
    new Set([...PRIMARY_KEYWORDS, ...SUPPORTING_KEYWORDS, ...COMPARE_KEYWORDS]),
  ),
  title: {
    default: "OpenUI MCP Studio | OneClickUI.ai front door",
    template: "%s | OpenUI MCP Studio",
  },
  description:
    "MCP-native UI/UX delivery and review for React and shadcn teams through a local workflow for Codex, Claude Code, and builder-facing review paths.",
  openGraph: {
    title: "OpenUI MCP Studio | OneClickUI.ai front door",
    description:
      "Ship React UI into your workspace with proof, review, acceptance, UI/UX audit surfaces, and an MCP-native builder workflow instead of stopping at a screenshot.",
    siteName: "OneClickUI.ai",
    locale: "en_US",
    type: "website",
    images: defaultSocialPreviewImage,
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenUI MCP Studio | OneClickUI.ai front door",
    description:
      "Prompt to React UI/UX delivery for Codex, Claude Code, and MCP-native builders with proof, review, and acceptance.",
    images: defaultSocialPreviewImage,
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="skip-link fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg"
        >
          Skip to content
        </a>
        <LocaleProvider initialLocale={locale}>
          <ErrorBoundary>
            <div className="relative flex flex-col">{children}</div>
          </ErrorBoundary>
        </LocaleProvider>
      </body>
    </html>
  );
}
