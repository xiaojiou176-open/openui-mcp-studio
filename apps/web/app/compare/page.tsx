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
import { getFrontdoorMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { buildStructuredDiscoveryJsonLd, serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title:
    "Bolt alternative, Lovable alternative, v0 alternative, and MCP workflow compare",
  description:
    "An honest compare surface for teams evaluating OpenUIStudio against Bolt, Lovable, v0, and broader Codex / Claude Code / OpenHands / OpenCode traffic.",
  path: "/compare",
  keywords: [
    "Bolt alternative",
    "Lovable alternative",
    "v0 alternative",
    "workspace-integrated UI shipping",
    "Codex MCP workflow",
    "Claude Code MCP workflow",
    "OpenHands comparison",
    "OpenCode comparison",
  ],
});

const compareStructuredData = buildStructuredDiscoveryJsonLd({
  siteUrl: getResolvedSiteUrl(),
  path: "/compare",
  title:
    "Bolt alternative, Lovable alternative, v0 alternative, and MCP workflow compare",
  description:
    "An honest compare surface for teams evaluating OpenUIStudio against Bolt, Lovable, v0, and broader Codex / Claude Code / OpenHands / OpenCode traffic.",
  type: "CollectionPage",
  breadcrumbLabel: "Compare",
  about: [
    "hosted builder alternatives",
    "repo-aware UI shipping",
    "Codex",
    "Claude Code",
  ],
});

export default async function ComparePage() {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);

  return (
    <FrontdoorShell activeHref="/compare">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-6 sm:px-6 lg:px-8"
      >
        <section className="surface-outline overflow-hidden rounded-[calc(var(--radius-xl)+0.25rem)] border bg-frontdoor-hero shadow-[0_32px_90px_-54px_hsl(var(--shadow-color)/0.48)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:items-center lg:px-10 lg:py-10">
            <div className="flex flex-col gap-5">
              <Badge className="bg-primary/95 text-primary-foreground">
                {messages.compare.heroBadge}
              </Badge>
              <div className="flex flex-col gap-4">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-primary/78">
                  Choose the lane before you choose the tool.
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  {messages.compare.heroTitle}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {messages.compare.heroBody}
                </p>
              </div>
            </div>

            <div className="hero-terminal surface-outline rounded-[calc(var(--radius-xl)-0.2rem)] border p-6">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>
              <div className="mt-5 flex flex-col gap-3">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-white/48">
                  Honest split
                </p>
                <div className="rounded-[1rem] border border-white/10 bg-white/6 px-4 py-4">
                  <p className="text-sm font-medium text-white">
                    {messages.compare.honestSplitLabels.goThereFirst}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/68">
                    {messages.compare.goThereFirst}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-white/10 bg-white/6 px-4 py-4">
                  <p className="text-sm font-medium text-white">
                    {messages.compare.honestSplitLabels.startHereInstead}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/68">
                    {messages.compare.startHereInstead}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Ecosystem map"
                title={messages.compare.ecosystemTitle}
                body={messages.compare.ecosystemBody}
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground sm:grid-cols-2">
              {messages.compare.ecosystemBindings.map((binding) => (
                <div
                  key={binding.name}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="surface-badge w-fit">
                      {binding.classification}
                    </Badge>
                    <p className="font-medium text-foreground">{binding.name}</p>
                  </div>
                  <p className="mt-2">{binding.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel-strong border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge={messages.compare.heroBadge}
                title={messages.compare.decisionCardsTitle}
                body={messages.compare.decisionCardsBody}
                id="decision-cards-title"
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {messages.compare.decisionCards.map((card) => (
                <div
                  key={card.title}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  <Badge variant="outline" className="surface-badge w-fit">
                    {card.badge}
                  </Badge>
                  <p className="mt-3 text-base font-medium text-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    {card.body}
                  </p>
                  <div className="pt-3">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <Link
                        href={card.href}
                        target={card.href.startsWith("http") ? "_blank" : undefined}
                        rel={card.href.startsWith("http") ? "noreferrer" : undefined}
                      >
                        {card.cta}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="surface-panel border-border/75">
          <CardHeader className="gap-4">
            <SectionHeader
              badge="Market split"
              title={messages.compare.honestSplitTitle}
              body="This section exists to stop category blur. If the user wants hosted speed, tell them that clearly. If they want repo-aware proof and review, tell them that clearly too."
            />
          </CardHeader>
          <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground sm:grid-cols-2">
            <div className="surface-panel-soft rounded-[1.1rem] border px-4 py-4 shadow-sm">
              <p className="font-medium text-foreground">
                {messages.compare.honestSplitLabels.goThereFirst}
              </p>
              <p className="mt-2">{messages.compare.goThereFirst}</p>
            </div>
            <div className="surface-panel-soft rounded-[1.1rem] border border-primary/20 bg-primary/5 px-4 py-4">
              <p className="font-medium text-foreground">
                {messages.compare.honestSplitLabels.startHereInstead}
              </p>
              <p className="mt-2">{messages.compare.startHereInstead}</p>
            </div>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-6">
          <SectionHeader
            badge="Head-to-head"
            title="Open the product category before you open the official site."
            body="Each card answers one practical question: where the other tool is a stronger fit, why OpenUI is different, and when OpenUI is simply the wrong lane."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {messages.compare.comparePoints.map((item) => (
              <Card
                key={item.tool}
                id={`${item.tool.toLowerCase()}-alternative`}
                className="surface-panel h-full border-border/75"
              >
                <CardHeader className="gap-4">
                  <Badge variant="outline" className="surface-badge w-fit">
                    {item.tool} {messages.compare.cardLabels.alternativeSuffix}
                  </Badge>
                  <div className="flex flex-col gap-3">
                    <CardTitle className="text-2xl tracking-tight">
                      {item.tool}
                    </CardTitle>
                    <CardDescription>{item.officialPositioning}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0 text-sm leading-7 text-muted-foreground">
                  <div>
                    <p className="font-medium text-foreground">
                      {messages.compare.cardLabels.betterFitThere}
                    </p>
                    <p>{item.bestFor}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {messages.compare.cardLabels.whyOpenUiDiffers}
                    </p>
                    <p>{item.openUiEdge}</p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {messages.compare.cardLabels.notBestFitHereIf}
                    </p>
                    <p>{item.notFor}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={item.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.compare.cardLabels.openOfficialSite} {item.tool}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
          <Card className="surface-panel-strong border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Refusal"
                title={messages.compare.refusalTitle}
                body="A good compare page should refuse to win by lying. This is the small print that protects the front door from generic builder rhetoric."
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.compare.refusalPoints.map((point) => (
                <div
                  key={point}
                  className="surface-panel-soft rounded-[1.1rem] border px-4 py-4"
                >
                  {point}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="Follow-up"
                title={messages.compare.followUpTitle}
                body={messages.compare.followUpBody}
                id="follow-up-title"
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 lg:grid-cols-[1fr_1fr_1.05fr]">
              {messages.compare.followUpLinks.map((item) => (
                <Card
                  key={item.title}
                  className={`surface-panel-soft h-full border-border/75 ${item.href === "/proof" ? "shadow-[0_20px_48px_-32px_hsl(var(--shadow-color)/0.35)]" : ""}`}
                >
                  <CardHeader className="gap-3">
                    <Badge variant="outline" className="surface-badge w-fit">
                      {item.badge}
                    </Badge>
                    <CardTitle className="text-xl tracking-tight">
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.body}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <Link href={item.href}>{item.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </section>

        {compareStructuredData ? (
          <script type="application/ld+json" aria-hidden="true">
            {serializeJsonLd(compareStructuredData)}
          </script>
        ) : null}
      </main>
    </FrontdoorShell>
  );
}
