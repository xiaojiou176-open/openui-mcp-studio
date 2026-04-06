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
import { getFrontdoorMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { buildStructuredDiscoveryJsonLd, serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title:
    "Bolt alternative, Lovable alternative, v0 alternative, and MCP workflow compare",
  description:
    "An honest compare surface for teams evaluating OpenUI MCP Studio against Bolt, Lovable, v0, and broader Codex / Claude Code / OpenHands / OpenCode traffic.",
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
    "An honest compare surface for teams evaluating OpenUI MCP Studio against Bolt, Lovable, v0, and broader Codex / Claude Code / OpenHands / OpenCode traffic.",
  type: "CollectionPage",
  breadcrumbLabel: "Compare",
  about: ["hosted builder alternatives", "repo-aware UI shipping", "Codex", "Claude Code"],
});

export default async function ComparePage() {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);

  return (
    <FrontdoorShell activeHref="/compare">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
      >
        <section className="space-y-4 rounded-[var(--radius-xl)] border border-border/70 bg-frontdoor-hero px-6 py-8 shadow-xl sm:px-8">
          <Badge className="bg-primary/95 text-primary-foreground">
            {messages.compare.heroBadge}
          </Badge>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {messages.compare.heroTitle}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            {messages.compare.heroBody}
          </p>
        </section>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <h2 className="text-2xl font-semibold tracking-tight">
              {messages.compare.ecosystemTitle}
            </h2>
            <CardDescription>{messages.compare.ecosystemBody}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground sm:grid-cols-2">
            {messages.compare.ecosystemBindings.map((binding) => (
              <div
                key={binding.name}
                className="rounded-xl border border-border/70 bg-background/80 p-4"
              >
                <p className="font-medium text-foreground">
                  {binding.name} · {binding.classification}
                </p>
                <p>{binding.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="space-y-4" aria-labelledby="decision-cards-title">
          <div className="space-y-2">
            <Badge
              variant="outline"
              className="w-fit border-primary/20 bg-primary/5"
            >
              {messages.compare.heroBadge}
            </Badge>
            <h2
              id="decision-cards-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {messages.compare.decisionCardsTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {messages.compare.decisionCardsBody}
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {messages.compare.decisionCards.map((card) => (
              <Card key={card.title} className="border-border/70 bg-card/90">
                <CardHeader className="space-y-3">
                  <Badge
                    variant="outline"
                    className="w-fit border-primary/20 bg-primary/5"
                  >
                    {card.badge}
                  </Badge>
                  <CardTitle className="text-xl tracking-tight">
                    {card.title}
                  </CardTitle>
                  <CardDescription>{card.body}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link
                      href={card.href}
                      target={
                        card.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        card.href.startsWith("http") ? "noreferrer" : undefined
                      }
                    >
                      {card.cta}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {messages.compare.honestSplitTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm">
              <p className="font-medium text-foreground">
                {messages.compare.honestSplitLabels.goThereFirst}
              </p>
              <p>{messages.compare.goThereFirst}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="font-medium text-foreground">
                {messages.compare.honestSplitLabels.startHereInstead}
              </p>
              <p>{messages.compare.startHereInstead}</p>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-3">
          {messages.compare.comparePoints.map((item) => (
            <Card
              key={item.tool}
              id={`${item.tool.toLowerCase()}-alternative`}
              className="border-border/70 bg-card/90"
            >
              <CardHeader className="space-y-3">
                <Badge
                  variant="outline"
                  className="w-fit border-primary/20 bg-primary/5"
                >
                  {item.tool} {messages.compare.cardLabels.alternativeSuffix}
                </Badge>
                <CardTitle className="text-2xl tracking-tight">
                  {item.tool}
                </CardTitle>
                <CardDescription>{item.officialPositioning}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
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
        </section>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {messages.compare.refusalTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
            {messages.compare.refusalPoints.map((point) => (
              <p key={point}>{point}</p>
            ))}
          </CardContent>
        </Card>

        <section className="space-y-4" aria-labelledby="follow-up-title">
          <div className="space-y-2">
            <h2
              id="follow-up-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {messages.compare.followUpTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              {messages.compare.followUpBody}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.05fr]">
            {messages.compare.followUpLinks.map((item) => (
              <Card
                key={item.title}
                className={`border-border/70 bg-card/90 ${item.href === "/proof" ? "shadow-xl" : ""}`}
              >
                <CardHeader className="space-y-3">
                  <Badge
                    variant="outline"
                    className="w-fit border-primary/20 bg-primary/5"
                  >
                    {item.badge}
                  </Badge>
                  <CardTitle className="text-xl tracking-tight">
                    {item.title}
                  </CardTitle>
                  <CardDescription>{item.body}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link
                      href={item.href}
                      target={
                        item.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel={
                        item.href.startsWith("http") ? "noreferrer" : undefined
                      }
                    >
                      {item.cta}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
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
