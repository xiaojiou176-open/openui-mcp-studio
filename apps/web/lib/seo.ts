import { SITE_BRAND } from "./frontdoor-content";
import { resolveSiteHref } from "./site-metadata";

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

type StructuredDiscoveryPageType = "CollectionPage" | "HowTo" | "WebPage";

type StructuredDiscoveryJsonLdInput = {
  siteUrl: string | null;
  path: string;
  title: string;
  description: string;
  type: StructuredDiscoveryPageType;
  breadcrumbLabel: string;
  about?: string[];
  howToSteps?: string[];
};

export function buildStructuredDiscoveryJsonLd(
  input: StructuredDiscoveryJsonLdInput,
): Array<Record<string, unknown>> | null {
  if (!input.siteUrl) {
    return null;
  }

  const pageUrl = resolveSiteHref(input.path, input.siteUrl);
  const pageJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": input.type,
    name: input.title,
    description: input.description,
    url: pageUrl,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: SITE_BRAND.frontdoorName,
      url: input.siteUrl,
    },
  };

  if (input.about?.length) {
    pageJsonLd.about = input.about.map((name) => ({
      "@type": "Thing",
      name,
    }));
  }

  if (input.type === "HowTo" && input.howToSteps?.length) {
    pageJsonLd.step = input.howToSteps.map((name, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name,
    }));
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: SITE_BRAND.frontdoorName,
        item: input.siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: input.breadcrumbLabel,
        item: pageUrl,
      },
    ],
  };

  return [pageJsonLd, breadcrumbJsonLd];
}
