import Link from "next/link";

import {
  SectionHeader,
  SurfaceMetaList,
} from "@/components/frontdoor-primitives";
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
import {
  REVIEWER_ROUTE_BOARD,
  SITE_BRAND,
} from "@/lib/frontdoor-content";
import { getFrontdoorMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "Ship React UI into your workspace, with proof and review",
  description:
    "OneClickUI.ai is the front door for ShadcnBrief: an MCP-native UI/UX delivery and review workflow for React and shadcn teams with workspace writes, review bundles, acceptance, proof, and plugin-grade package surfaces for Codex, Claude Code, and OpenClaw-side packaging work.",
  path: "/",
  keywords: [
    "AI UI shipping",
    "prompt to React UI",
    "React and shadcn UI delivery",
    "workspace-integrated UI workflow",
    "Codex MCP UI workflow",
    "Claude Code UI workflow",
    "OpenClaw public-ready UI workflow",
    "MCP server for React UI delivery",
  ],
});

const siteUrl = getResolvedSiteUrl();

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_BRAND.technicalName,
  alternateName: SITE_BRAND.frontdoorName,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Windows, Linux",
  description:
    "MCP-native UI/UX delivery and review for React and shadcn teams with workspace writes, proof, review, acceptance, and builder-facing compatibility surfaces.",
  sameAs: [SITE_BRAND.repoUrl],
  url: siteUrl || undefined,
  featureList: [
    "Prompt to React UI delivery",
    "Writes into a real workspace",
    "Review bundle and acceptance outputs",
    "Feature-level delivery packaging",
    "MCP-native workflow",
    "Codex and Claude Code integration through stdio MCP",
    "Compatibility OpenAPI contract for bridge consumers",
  ],
};

export default async function FrontdoorHomePage() {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);
  const guidedPrimary = messages.home.guidedPaths.slice(0, 2);
  const guidedSecondary = messages.home.guidedPaths.slice(2);
  const compareHighlights = messages.home.comparePoints.slice(0, 3);

  return (
    <FrontdoorShell activeHref="/">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-6 sm:px-6 lg:px-8"
      >
        <section className="surface-outline overflow-hidden rounded-[calc(var(--radius-xl)+0.25rem)] border bg-frontdoor-hero shadow-[0_36px_100px_-60px_hsl(var(--shadow-color)/0.55)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(340px,0.82fr)] lg:items-center lg:gap-10 lg:px-10 lg:py-10">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-primary/95 text-primary-foreground">
                  {SITE_BRAND.frontdoorLabel}
                </Badge>
                <Badge variant="outline" className="surface-chip">
                  {SITE_BRAND.poweredBy}
                </Badge>
              </div>

              <div className="flex flex-col gap-4">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-primary/80">
                  Prompt to workspace. Proof before trust.
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                  {messages.home.heroTitle}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {messages.home.heroBody}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/walkthrough" data-testid="hero-cta-walkthrough">
                    {messages.home.heroCtas.walkthrough}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/proof" data-testid="hero-cta-proof">
                    {messages.home.heroCtas.proof}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link href="/workbench" data-testid="hero-cta-workbench">
                    {messages.home.heroCtas.workbench}
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {messages.home.heroSignals.map((signal) => (
                  <div
                    key={signal}
                    className="surface-chip rounded-[1.1rem] border px-4 py-3 text-sm leading-6 text-muted-foreground"
                  >
                    {signal}
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-terminal surface-outline rounded-[calc(var(--radius-xl)-0.2rem)] border p-6">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>

              <div className="mt-5 flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                  <Badge
                    variant="outline"
                    className="w-fit border-white/10 bg-white/8 text-white/82"
                  >
                    {messages.home.valueCheckBadge}
                  </Badge>
                  <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-white">
                      {messages.home.valueCheckTitle}
                    </h2>
                    <p className="text-sm leading-7 text-white/72">
                      {messages.home.valueCheckBody}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {messages.home.valueCheckPoints.map((point) => (
                    <div
                      key={point}
                      className="rounded-[1.1rem] border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-white/74"
                    >
                      {point}
                    </div>
                  ))}
                </div>

                <div className="rounded-[1.1rem] border border-white/10 bg-black/18 px-4 py-4">
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-white/48">
                    Recommended route
                  </p>
                  <div className="mt-4 grid gap-3">
                    {messages.home.nextStepLinks.slice(0, 3).map((item, index) => (
                      <div
                        key={item.href}
                        className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/8 bg-white/4 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[0.72rem] text-white/46">
                            0{index + 1}
                          </span>
                          <span className="text-sm font-medium text-white">
                            {item.label}
                          </span>
                        </div>
                        <Link
                          href={item.href}
                          className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/58 hover:text-white"
                        >
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6" aria-labelledby="guided-paths-title">
          <SectionHeader
            badge={messages.home.guidedPathsBadge}
            title={messages.home.guidedPathsTitle}
            body={messages.home.guidedPathsBody}
            id="guided-paths-title"
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
            <div className="grid gap-4 md:grid-cols-2">
              {guidedPrimary.map((path, index) => (
                <Card
                  key={path.title}
                  className={cn(
                    "h-full border-border/75",
                    index === 0
                      ? "surface-panel-elevated"
                      : "surface-panel-strong",
                  )}
                >
                  <CardHeader className="gap-4">
                    <Badge variant="outline" className="surface-badge w-fit">
                      {path.badge}
                    </Badge>
                    <div className="flex flex-col gap-3">
                      <CardTitle className="text-2xl tracking-tight">
                        {path.title}
                      </CardTitle>
                      <CardDescription>{path.body}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <Link href={path.href}>{path.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4">
              {guidedSecondary.map((path) => (
                <Card key={path.title} className="surface-panel h-full border-border/75">
                  <CardHeader className="gap-4">
                    <Badge variant="outline" className="surface-badge w-fit">
                      {path.badge}
                    </Badge>
                    <div className="flex flex-col gap-3">
                      <CardTitle className="text-xl tracking-tight">
                        {path.title}
                      </CardTitle>
                      <CardDescription>{path.body}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button asChild variant="outline" className="w-full justify-start">
                      <Link href={path.href}>{path.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6" aria-labelledby="proof-narrative-title">
          <SectionHeader
            badge={messages.home.proofSectionBadge}
            title={messages.home.proofSectionTitle}
            body={messages.home.proofSectionBody}
            id="proof-narrative-title"
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <Card className="surface-panel-strong h-full border-border/75">
              <CardHeader className="gap-4">
                <Badge variant="outline" className="surface-badge w-fit">
                  Reviewer-first router
                </Badge>
                <div className="flex flex-col gap-3">
                  <CardTitle className="text-2xl tracking-tight">
                    Pick the route that matches the question in your head.
                  </CardTitle>
                  <CardDescription>
                    The front door should feel like a good operator: it helps you
                    ask the right question first, then sends you to the surface
                    that can actually answer it.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-0">
                {REVIEWER_ROUTE_BOARD.map((route) => (
                  <div
                    key={route.title}
                    className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                  >
                    <div className="flex flex-col gap-2">
                      <p className="text-base font-medium text-foreground">
                        {route.title}
                      </p>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {route.body}
                      </p>
                      <p className="border-t border-border/70 pt-3 text-xs leading-6 text-muted-foreground">
                        {route.why}
                      </p>
                    </div>
                    <div className="pt-3">
                      <Button asChild variant="outline" className="w-full justify-start">
                        <Link href={route.href}>{route.cta}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              {messages.home.proofSteps.map((step) => (
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
                      aria-label={`${step.eyebrow} example artifact snippet`}
                      className="overflow-x-auto rounded-[1.05rem] border border-black/10 bg-[linear-gradient(180deg,hsl(var(--dark-surface))_0%,hsl(var(--dark-surface-2))_100%)] px-4 py-4 text-sm text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]"
                    >
                      <code>{step.snippet}</code>
                    </pre>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-5" aria-labelledby="reviewer-router-title">
          <div className="space-y-2">
            <Badge variant="outline" className="surface-badge">
              Reviewer-first router
            </Badge>
            <h2
              id="reviewer-router-title"
              className="text-3xl font-semibold tracking-tight"
            >
              Pick the route that matches the question in your head.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              The second cut of this front door is about pathing, not louder
              claims. If you are reviewing the repo, the fastest way to trust it
              is to choose the right question first instead of reading the whole
              shelf in order.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {REVIEWER_ROUTE_BOARD.map((route) => (
              <Card key={route.title} className="surface-panel h-full">
                <CardHeader className="space-y-3">
                  <CardTitle className="text-xl tracking-tight">
                    {route.title}
                  </CardTitle>
                  <CardDescription>{route.body}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0 text-sm leading-7 text-muted-foreground">
                  <div className="surface-panel-soft rounded-xl border p-4">
                    {route.why}
                  </div>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href={route.href}>{route.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
          aria-labelledby="audience-fit-title"
        >
          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge={messages.home.audienceBadge}
                title={messages.home.audienceTitle}
                body="This front door should tell different kinds of technical visitors where to go next without making them read the whole warehouse."
                id="audience-fit-title"
              />
            </CardHeader>
            <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
              {messages.home.audienceCards.map((audience) => (
                <div
                  key={audience.title}
                  className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                >
                  <div className="flex flex-col gap-2">
                    <p className="text-base font-medium text-foreground">
                      {audience.title}
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {audience.body}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel-strong border-border/75">
            <CardHeader className="gap-4">
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.compareBadge}
              </Badge>
              <div className="flex flex-col gap-3">
                <CardTitle
                  id="compare-teaser-title"
                  className="text-3xl tracking-tight"
                >
                  {messages.home.compareTitle}
                </CardTitle>
                <CardDescription>{messages.home.compareBody}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-0">
              <div className="grid gap-3">
                {compareHighlights.map((item) => (
                  <div
                    key={item.tool}
                    className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="surface-badge w-fit">
                          {item.tool} {messages.compare.cardLabels.alternativeSuffix}
                        </Badge>
                        <p className="text-sm font-medium text-foreground">
                          {item.officialPositioning}
                        </p>
                      </div>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {item.openUiEdge}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="section-rule pt-4">
                <Button asChild variant="outline" size="lg">
                  <Link href="/compare">{messages.home.compareCta}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          className="grid gap-6 xl:grid-cols-[minmax(0,1.03fr)_minmax(0,0.97fr)]"
          aria-labelledby="builder-entry-title"
        >
          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.builderBadge}
              </Badge>
              <div className="flex flex-col gap-3">
                <CardTitle
                  id="builder-entry-title"
                  className="text-3xl tracking-tight"
                >
                  {messages.home.builderTitle}
                </CardTitle>
                <CardDescription>{messages.home.builderBody}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {messages.home.builderEntryPoints.map((entry) => (
                <div
                  key={entry.title}
                  className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="surface-badge w-fit">
                        {entry.step}
                      </Badge>
                      <p className="text-base font-medium text-foreground">
                        {entry.title}
                      </p>
                    </div>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {entry.body}
                    </p>
                    <SurfaceMetaList
                      labels={messages.home.surfaceMetaLabels}
                      audience={entry.audience}
                      bestFor={entry.bestFor}
                      readWhen={entry.readWhen}
                      notFor={entry.notFor}
                    />
                    <div className="pt-1">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={entry.href}
                          target={entry.href.startsWith("http") ? "_blank" : undefined}
                          rel={entry.href.startsWith("http") ? "noreferrer" : undefined}
                        >
                          {entry.cta}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel border-border/75">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-3">
                <CardTitle className="text-3xl tracking-tight">
                  {messages.home.machineReadableTitle}
                </CardTitle>
                <CardDescription>
                  The discovery chain should work for both humans and machines
                  without turning the public surface into a maze.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-0">
              <div className="grid gap-3">
                {messages.home.machineReadableSurfaces.map((surface) => (
                  <div
                    key={surface.href}
                    className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="surface-badge w-fit">
                          {surface.label}
                        </Badge>
                        <p className="text-base font-medium text-foreground">
                          {surface.title}
                        </p>
                      </div>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {surface.body}
                      </p>
                      <SurfaceMetaList
                        labels={messages.home.surfaceMetaLabels}
                        audience={surface.audience}
                        bestFor={surface.bestFor}
                        readWhen={surface.readWhen}
                        notFor={surface.notFor}
                      />
                      <div className="pt-1">
                        <Button asChild size="sm" variant="outline">
                          <Link href={surface.href}>{surface.cta}</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-rule flex flex-col gap-3 pt-4 text-sm leading-7 text-muted-foreground">
                {messages.home.machineReadableNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Card className="surface-panel border-border/75" aria-label="Differentiators">
            <CardHeader className="gap-4">
              <CardTitle className="text-2xl tracking-tight">
                What makes the front door feel sharper
              </CardTitle>
              <CardDescription>
                These are the practical reasons this product reads like a tool,
                not like a vague builder promise.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.home.differentiators.map((item) => (
                <div
                  key={item.title}
                  className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                >
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-2">{item.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel border-border/75">
            <CardHeader className="gap-4">
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.ecosystemBadge}
              </Badge>
              <div className="flex flex-col gap-3">
                <CardTitle className="text-2xl tracking-tight">
                  {messages.home.ecosystemTitle}
                </CardTitle>
                <CardDescription>{messages.home.ecosystemBody}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.home.ecosystemBindings.map((binding) => (
                <div
                  key={binding.name}
                  className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
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

          <Card className="surface-panel border-border/75">
            <CardHeader className="gap-4">
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.aiBadge}
              </Badge>
              <div className="flex flex-col gap-3">
                <CardTitle className="text-2xl tracking-tight">
                  {messages.home.aiTitle}
                </CardTitle>
                <CardDescription>
                  Keep the AI story scoped to the lanes the repo can actually
                  own today.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.home.aiCapabilityLanes.map((lane) => (
                <div
                  key={lane.title}
                  className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                >
                  <p className="font-medium text-foreground">{lane.title}</p>
                  <p className="mt-2">{lane.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section
          className="grid gap-6 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]"
          aria-labelledby="next-step-title"
        >
          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.nextStepBadge}
              </Badge>
              <div className="flex flex-col gap-3">
                <CardTitle
                  id="next-step-title"
                  className="text-3xl tracking-tight"
                >
                  {messages.home.nextStepTitle}
                </CardTitle>
                <CardDescription>{messages.home.nextStepBody}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 sm:grid-cols-2">
              {messages.home.nextStepLinks.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant={item.href === "/proof" ? "default" : "outline"}
                  className="justify-start"
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel border-border/75">
            <CardHeader className="gap-4">
              <CardTitle className="text-xl tracking-tight">
                {messages.home.refusalTitle}
              </CardTitle>
              <CardDescription>
                Progressive disclosure only works when the front door stays
                honest about what it is not.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm leading-7 text-muted-foreground">
              {messages.home.refusalPoints.map((point) => (
                <div
                  key={point}
                  className="surface-panel-soft rounded-[1.15rem] border px-4 py-4"
                >
                  {point}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <script type="application/ld+json" aria-hidden="true">
          {serializeJsonLd(softwareJsonLd)}
        </script>
      </main>
    </FrontdoorShell>
  );
}
