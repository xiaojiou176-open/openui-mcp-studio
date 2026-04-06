import Link from "next/link";

import { FrontdoorShell } from "@/components/frontdoor-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SITE_BRAND } from "@/lib/frontdoor-content";
import { getFrontdoorMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { buildStructuredDiscoveryJsonLd, serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "30-second proof for React UI delivery",
  description:
    "See how OpenUI MCP Studio turns a prompt into React output, changed files, review bundle, acceptance, and proof-ready evidence.",
  path: "/proof",
  keywords: [
    "AI UI proof",
    "review bundle for UI changes",
    "acceptance workflow for generated UI",
  ],
});

const featureTreeSnippet = `feature-flow/<feature-slug>/\n  feature-flow-plan.json\n  feature-flow-quality.json\n  feature-flow-acceptance-result.json\n  feature-flow-review-bundle.md\n  routes/\n    01-<route-id>/\n      workspace-profile.json\n      change-plan.json\n      acceptance-pack.json\n      review-bundle.json\n    02-<route-id>/\n      workspace-profile.json\n      change-plan.json\n      acceptance-pack.json\n      review-bundle.json`;

const proofStructuredData = buildStructuredDiscoveryJsonLd({
  siteUrl: getResolvedSiteUrl(),
  path: "/proof",
  title: "30-second proof for React UI delivery",
  description:
    "See how OpenUI MCP Studio turns a prompt into React output, changed files, review bundle, acceptance, and proof-ready evidence.",
  type: "WebPage",
  breadcrumbLabel: "Proof",
  about: ["proof desk", "review bundle", "acceptance evidence", "React UI delivery"],
});

export default async function ProofPage() {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);

  return (
    <FrontdoorShell activeHref="/proof">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
      >
        <section className="rounded-[var(--radius-xl)] border border-border/70 bg-frontdoor-hero px-6 py-8 shadow-xl sm:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
            <div className="space-y-4">
              <Badge className="bg-primary/95 text-primary-foreground">
                {messages.proof.heroBadge}
              </Badge>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
                {messages.proof.heroTitle}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                {messages.proof.heroBody}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/workbench">{messages.proof.heroCtas.workbench}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={SITE_BRAND.docs.proofFaq}>
                    {messages.proof.heroCtas.proofFaq}
                  </Link>
                </Button>
              </div>
            </div>

            <Card className="border-border/70 bg-card/90 shadow-xl">
              <CardHeader>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {messages.proof.contractTitle}
                </h2>
                <CardDescription>{messages.proof.contractBody}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
                {messages.proof.contractCards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-xl border border-border/70 bg-background/80 p-4"
                  >
                    <p className="font-medium text-foreground">{card.title}</p>
                    <p className="mt-2">{card.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">
                {messages.proof.triageTitle}
              </CardTitle>
              <CardDescription>{messages.proof.triageBody}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
              {messages.proof.triageCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-border/70 bg-background/80 p-4"
                >
                  <p className="font-medium text-foreground">{card.title}</p>
                  <p className="mt-2">{card.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">
                {messages.proof.nextRoutesTitle}
              </CardTitle>
              <CardDescription>{messages.proof.nextRoutesBody}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {messages.proof.nextRoutes.map((route) => (
                <div
                  key={route.title}
                  className="rounded-xl border border-border/70 bg-background/80 p-4"
                >
                  <Badge
                    variant="outline"
                    className="w-fit border-primary/20 bg-primary/5"
                  >
                    {route.badge}
                  </Badge>
                  <p className="mt-3 font-medium text-foreground">{route.title}</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {route.body}
                  </p>
                  <div className="pt-3">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <Link
                        href={route.href}
                        target={route.href.startsWith("http") ? "_blank" : undefined}
                        rel={route.href.startsWith("http") ? "noreferrer" : undefined}
                      >
                        {route.cta}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4" aria-labelledby="proof-packet-anatomy-title">
          <div className="space-y-2">
            <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
              {messages.proof.heroBadge}
            </Badge>
            <h2
              id="proof-packet-anatomy-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {messages.proof.packetAnatomyTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {messages.proof.packetAnatomyBody}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {messages.proof.proofSteps.map((step) => (
              <Card key={step.eyebrow} className="border-border/70 bg-card/90">
                <CardHeader>
                  <Badge
                    variant="outline"
                    className="w-fit border-primary/20 bg-primary/5"
                  >
                    {step.eyebrow}
                  </Badge>
                  <CardTitle className="text-xl tracking-tight">
                    {step.title}
                  </CardTitle>
                  <CardDescription>{step.body}</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre
                    tabIndex={0}
                    aria-label={`${step.eyebrow} proof snippet`}
                    className="overflow-x-auto rounded-xl border border-border/70 bg-foreground px-4 py-4 text-sm text-background"
                  >
                    <code>{step.snippet}</code>
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">
                {messages.proof.reviewDeskTitle}
              </CardTitle>
              <CardDescription>{messages.proof.reviewDeskBody}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
              {messages.proof.reviewDeskCards.map((card, index) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-border/70 bg-background/80 p-4"
                >
                  <Badge
                    variant="outline"
                    className="w-fit border-primary/20 bg-primary/5"
                  >
                    {messages.proof.reviewDeskTags[index]}
                  </Badge>
                  <p className="mt-3 font-medium text-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2">{card.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">
                {messages.proof.featureTitle}
              </CardTitle>
              <CardDescription>{messages.proof.featureBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre
                tabIndex={0}
                aria-label="Feature-level delivery artifact tree"
                className="overflow-x-auto rounded-xl border border-border/70 bg-foreground px-4 py-4 text-sm text-background"
              >
                <code>{featureTreeSnippet}</code>
              </pre>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight">
                {messages.proof.acceptanceTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
              {messages.proof.acceptancePoints.map((point) => (
                <p key={point}>{point}</p>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {messages.proof.operatorGuideTitle}
            </CardTitle>
            <CardDescription>
              {messages.proof.operatorGuideBody}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground md:grid-cols-3">
            {messages.proof.operatorGuideSteps.map((step) => (
              <div
                key={step.title}
                className="rounded-xl border border-border/70 bg-background/80 p-4"
              >
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="mt-2">{step.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {messages.proof.notProvedTitle}
            </CardTitle>
            <CardDescription>{messages.proof.notProvedBody}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground md:grid-cols-3">
            {messages.proof.notProvedPoints.map((point) => (
              <div
                key={point}
                className="rounded-xl border border-border/70 bg-background/80 p-4"
              >
                {point}
              </div>
            ))}
          </CardContent>
        </Card>

        {proofStructuredData ? (
          <script type="application/ld+json" aria-hidden="true">
            {serializeJsonLd(proofStructuredData)}
          </script>
        ) : null}

      </main>
    </FrontdoorShell>
  );
}
