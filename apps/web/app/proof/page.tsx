import Link from "next/link";

import { SectionHeader } from "@/components/frontdoor-primitives";
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
    "See how OpenUIStudio turns a prompt into React output, changed files, review bundle, acceptance, and proof-ready evidence.",
  path: "/proof",
  keywords: [
    "AI UI proof",
    "review bundle for UI changes",
    "acceptance workflow for generated UI",
  ],
});

const featureTreeSnippet = `feature-flow/<feature-slug>/
  feature-flow-plan.json
  feature-flow-quality.json
  feature-flow-acceptance-result.json
  feature-flow-review-bundle.md
  routes/
    01-<route-id>/
      workspace-profile.json
      change-plan.json
      acceptance-pack.json
      review-bundle.json
    02-<route-id>/
      workspace-profile.json
      change-plan.json
      acceptance-pack.json
      review-bundle.json`;

const proofStructuredData = buildStructuredDiscoveryJsonLd({
  siteUrl: getResolvedSiteUrl(),
  path: "/proof",
  title: "30-second proof for React UI delivery",
  description:
    "See how OpenUIStudio turns a prompt into React output, changed files, review bundle, acceptance, and proof-ready evidence.",
  type: "WebPage",
  breadcrumbLabel: "Proof",
  about: [
    "proof desk",
    "review bundle",
    "acceptance evidence",
    "React UI delivery",
  ],
});

export default async function ProofPage() {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);

  return (
    <FrontdoorShell activeHref="/proof">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-6 sm:px-6 lg:px-8"
      >
        <section className="surface-outline overflow-hidden rounded-[calc(var(--radius-xl)+0.25rem)] border bg-frontdoor-hero shadow-[0_32px_90px_-54px_hsl(var(--shadow-color)/0.48)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:items-center lg:px-10 lg:py-10">
            <div className="flex flex-col gap-5">
              <Badge className="bg-primary/95 text-primary-foreground">
                {messages.proof.heroBadge}
              </Badge>
              <div className="flex flex-col gap-4">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-primary/78">
                  Repo-owned evidence. Human judgment still visible.
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  {messages.proof.heroTitle}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {messages.proof.heroBody}
                </p>
              </div>
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

            <div className="hero-terminal surface-outline rounded-[calc(var(--radius-xl)-0.2rem)] border p-6">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Badge
                    variant="outline"
                    className="w-fit border-white/10 bg-white/8 text-white/84"
                  >
                    {messages.proof.contractTitle}
                  </Badge>
                  <p className="text-sm leading-7 text-white/72">
                    {messages.proof.contractBody}
                  </p>
                </div>
                <div className="grid gap-3">
                  {messages.proof.contractCards.map((card) => (
                    <div
                      key={card.title}
                      className="rounded-[1.05rem] border border-white/10 bg-white/6 px-4 py-4"
                    >
                      <p className="text-sm font-medium text-white">{card.title}</p>
                      <p className="mt-2 text-sm leading-7 text-white/68">
                        {card.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Triage split"
                title={messages.proof.triageTitle}
                body={messages.proof.triageBody}
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.proof.triageCards.map((card) => (
                <div
                  key={card.title}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  <p className="font-medium text-foreground">{card.title}</p>
                  <p className="mt-2">{card.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel-strong border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Next route"
                title={messages.proof.nextRoutesTitle}
                body={messages.proof.nextRoutesBody}
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {messages.proof.nextRoutes.map((route) => (
                <div
                  key={route.title}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  <Badge variant="outline" className="surface-badge w-fit">
                    {route.badge}
                  </Badge>
                  <p className="mt-3 text-base font-medium text-foreground">
                    {route.title}
                  </p>
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

        <section className="flex flex-col gap-6" aria-labelledby="proof-packet-anatomy-title">
          <SectionHeader
            badge={messages.proof.heroBadge}
            title={messages.proof.packetAnatomyTitle}
            body={messages.proof.packetAnatomyBody}
            id="proof-packet-anatomy-title"
          />

          <div className="grid gap-4 md:grid-cols-2">
            {messages.proof.proofSteps.map((step) => (
              <Card key={step.eyebrow} className="surface-panel-hero h-full border-border/75">
                <CardHeader className="gap-4">
                  <Badge variant="outline" className="surface-badge w-fit">
                    {step.eyebrow}
                  </Badge>
                  <div className="flex flex-col gap-3">
                    <CardTitle className="text-xl tracking-tight">
                      {step.title}
                    </CardTitle>
                    <CardDescription>{step.body}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <pre
                    tabIndex={0}
                    aria-label={`${step.eyebrow} proof snippet`}
                    className="overflow-x-auto rounded-[1.05rem] border border-black/10 bg-[linear-gradient(180deg,hsl(var(--dark-surface))_0%,hsl(var(--dark-surface-2))_100%)] px-4 py-4 text-sm text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]"
                  >
                    <code>{step.snippet}</code>
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <Card className="surface-panel border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Review split"
                title={messages.proof.reviewDeskTitle}
                body={messages.proof.reviewDeskBody}
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.proof.reviewDeskCards.map((card, index) => (
                <div
                  key={card.title}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  <Badge variant="outline" className="surface-badge w-fit">
                    {messages.proof.reviewDeskTags[index]}
                  </Badge>
                  <p className="mt-3 font-medium text-foreground">{card.title}</p>
                  <p className="mt-2">{card.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel-strong border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Feature delivery"
                title={messages.proof.featureTitle}
                body={messages.proof.featureBody}
              />
            </CardHeader>
            <CardContent className="pt-0">
              <pre
                tabIndex={0}
                aria-label="Feature-level delivery artifact tree"
                className="overflow-x-auto rounded-[1.05rem] border border-black/10 bg-[linear-gradient(180deg,hsl(var(--dark-surface))_0%,hsl(var(--dark-surface-2))_100%)] px-4 py-4 text-sm text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]"
              >
                <code>{featureTreeSnippet}</code>
              </pre>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Acceptance"
                title={messages.proof.acceptanceTitle}
                body="Acceptance is the part that proves the packet is coherent enough to move, not the part that pretends every human judgment has already been replaced."
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.proof.acceptancePoints.map((point) => (
                <div
                  key={point}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  {point}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Operator guide"
                title={messages.proof.operatorGuideTitle}
                body={messages.proof.operatorGuideBody}
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground md:grid-cols-3">
              {messages.proof.operatorGuideSteps.map((step) => (
                <div
                  key={step.title}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  <p className="font-medium text-foreground">{step.title}</p>
                  <p className="mt-2">{step.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="surface-panel-strong border-border/75">
          <CardHeader className="gap-4">
            <SectionHeader
              badge="Not proved"
              title={messages.proof.notProvedTitle}
              body={messages.proof.notProvedBody}
            />
          </CardHeader>
          <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground md:grid-cols-3">
            {messages.proof.notProvedPoints.map((point) => (
              <div
                key={point}
                className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
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
