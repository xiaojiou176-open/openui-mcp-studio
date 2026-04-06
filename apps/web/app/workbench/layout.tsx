import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildStructuredDiscoveryJsonLd, serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Operator desk",
  description:
    "The repo-local operator desk for OpenUI MCP Studio. Use it to inspect packets, review lanes, readiness signals, and next actions after the proof meaning is already clear.",
  path: "/workbench",
  keywords: ["operator desk", "repo-local operator desk", "UI delivery workbench"],
});

const workbenchStructuredData = buildStructuredDiscoveryJsonLd({
  siteUrl: getResolvedSiteUrl(),
  path: "/workbench",
  title: "Operator desk",
  description:
    "The repo-local operator desk for OpenUI MCP Studio. Use it to inspect packets, review lanes, readiness signals, and next actions after the proof meaning is already clear.",
  type: "WebPage",
  breadcrumbLabel: "Workbench",
  about: ["repo-local operator desk", "readiness signals", "review lanes", "next actions"],
});

export default function WorkbenchLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      {workbenchStructuredData ? (
        <script type="application/ld+json" aria-hidden="true">
          {serializeJsonLd(workbenchStructuredData)}
        </script>
      ) : null}
    </>
  );
}
