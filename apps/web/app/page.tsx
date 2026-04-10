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
import {
  REVIEWER_ROUTE_BOARD,
  SITE_BRAND,
} from "@/lib/frontdoor-content";
import { getFrontdoorMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { serializeJsonLd } from "@/lib/seo";
import { buildPageMetadata, getResolvedSiteUrl } from "@/lib/site-metadata";

export const metadata = buildPageMetadata({
  title: "Ship React UI into your workspace, with proof and review",
  description:
    "OneClickUI.ai is the front door for OpenUI MCP Studio: an MCP-native UI/UX delivery and review workflow for React and shadcn teams with workspace writes, review bundles, acceptance, proof, and plugin-grade package surfaces for Codex, Claude Code, and OpenClaw-side packaging work.",
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

  return (
    <FrontdoorShell activeHref="/">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8"
      >
        <section className="surface-outline overflow-hidden rounded-[var(--radius-xl)] border bg-frontdoor-hero shadow-2xl">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-center">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-primary/95 text-primary-foreground">
                  {SITE_BRAND.frontdoorLabel}
                </Badge>
                <Badge variant="outline" className="surface-chip">
                  {SITE_BRAND.poweredBy}
                </Badge>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
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

              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {messages.home.heroSignals.map((signal) => (
                  <span
                    key={signal}
                    className="surface-chip rounded-full border px-3 py-1.5"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>

            <Card className="surface-panel-strong shadow-xl">
              <CardHeader className="pb-4">
                <Badge variant="outline" className="surface-badge w-fit">
                  {messages.home.valueCheckBadge}
                </Badge>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {messages.home.valueCheckTitle}
                </h2>
                <CardDescription>
                  {messages.home.valueCheckBody}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                {messages.home.valueCheckPoints.map((point) => (
                  <div
                    key={point}
                    className="surface-outline rounded-xl border bg-card px-4 py-3"
                  >
                    {point}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-5" aria-labelledby="guided-paths-title">
          <div className="space-y-2">
            <Badge variant="outline" className="surface-badge">
              {messages.home.guidedPathsBadge}
            </Badge>
            <h2
              id="guided-paths-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {messages.home.guidedPathsTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {messages.home.guidedPathsBody}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]">
            {messages.home.guidedPaths.map((path, index) => (
              <Card
                key={path.title}
                className={`surface-panel h-full ${index < 2 ? "surface-panel-elevated shadow-xl" : ""}`}
              >
                <CardHeader className="space-y-3">
                  <Badge variant="outline" className="surface-badge w-fit">
                    {path.badge}
                  </Badge>
                  <CardTitle className="text-xl tracking-tight">
                    {path.title}
                  </CardTitle>
                  <CardDescription>{path.body}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start"
                  >
                    <Link href={path.href}>{path.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-5" aria-labelledby="proof-narrative-title">
          <div className="space-y-2">
            <Badge variant="outline" className="surface-badge">
              {messages.home.proofSectionBadge}
            </Badge>
            <h2
              id="proof-narrative-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {messages.home.proofSectionTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {messages.home.proofSectionBody}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {messages.home.proofSteps.map((step) => (
              <Card key={step.eyebrow} className="surface-panel-hero h-full">
                <CardHeader className="space-y-3">
                  <Badge variant="outline" className="surface-badge w-fit">
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
                    aria-label={`${step.eyebrow} example artifact snippet`}
                    className="surface-outline overflow-x-auto rounded-xl border bg-foreground px-4 py-4 text-sm text-background"
                  >
                    <code>{step.snippet}</code>
                  </pre>
                </CardContent>
              </Card>
            ))}
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
          className="grid gap-4 lg:grid-cols-4"
          aria-label="Differentiators"
        >
          {messages.home.differentiators.map((item) => (
            <Card key={item.title} className="surface-panel">
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                {item.body}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-5" aria-labelledby="ecosystem-fit-title">
          <div className="space-y-2">
            <Badge variant="outline" className="surface-badge">
              {messages.home.ecosystemBadge}
            </Badge>
            <h2
              id="ecosystem-fit-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {messages.home.ecosystemTitle}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {messages.home.ecosystemBody}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {messages.home.ecosystemBindings.map((binding) => (
              <Card key={binding.name} className="surface-panel">
                <CardHeader className="space-y-3">
                  <Badge variant="outline" className="surface-badge w-fit">
                    {binding.classification}
                  </Badge>
                  <CardTitle className="text-xl tracking-tight">
                    {binding.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-7 text-muted-foreground">
                  {binding.body}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          className="grid gap-4 lg:grid-cols-3"
          aria-labelledby="ai-lanes-title"
        >
          <div className="space-y-2 lg:col-span-3">
            <Badge variant="outline" className="surface-badge">
              {messages.home.aiBadge}
            </Badge>
            <h2
              id="ai-lanes-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {messages.home.aiTitle}
            </h2>
          </div>

          {messages.home.aiCapabilityLanes.map((lane) => (
            <Card key={lane.title} className="surface-panel">
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  {lane.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                {lane.body}
              </CardContent>
            </Card>
          ))}
        </section>

        <section
          className="grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]"
          aria-labelledby="audience-fit-title"
        >
          <div className="space-y-2 lg:col-span-3">
            <Badge variant="outline" className="surface-badge">
              {messages.home.audienceBadge}
            </Badge>
            <h2
              id="audience-fit-title"
              className="text-3xl font-semibold tracking-tight"
            >
              {messages.home.audienceTitle}
            </h2>
          </div>

          {messages.home.audienceCards.map((audience) => (
            <Card key={audience.title} className="surface-panel">
              <CardHeader>
                <CardTitle className="text-xl tracking-tight">
                  {audience.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">
                {audience.body}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-5" aria-labelledby="compare-teaser-title">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="surface-badge">
                {messages.home.compareBadge}
              </Badge>
              <h2
                id="compare-teaser-title"
                className="text-3xl font-semibold tracking-tight"
              >
                {messages.home.compareTitle}
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {messages.home.compareBody}
              </p>
            </div>
            <Button asChild variant="outline" size="lg">
              <Link href="/compare">{messages.home.compareCta}</Link>
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {messages.home.comparePoints.map((item) => (
              <Card key={item.tool} className="surface-panel">
                <CardHeader className="space-y-3">
                  <Badge variant="outline" className="surface-badge w-fit">
                    {item.tool} {messages.compare.cardLabels.alternativeSuffix}
                  </Badge>
                  <CardTitle className="text-xl tracking-tight">
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
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section
          className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]"
          aria-labelledby="builder-entry-title"
        >
          <Card className="surface-panel-elevated shadow-xl">
            <CardHeader>
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.builderBadge}
              </Badge>
              <CardTitle
                id="builder-entry-title"
                className="text-3xl tracking-tight"
              >
                {messages.home.builderTitle}
              </CardTitle>
              <CardDescription>{messages.home.builderBody}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {messages.home.builderEntryPoints.map((entry) => (
                <div
                  key={entry.title}
                  className="surface-panel-soft rounded-xl border p-4 text-sm leading-7 text-muted-foreground"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="surface-badge w-fit">
                      {entry.step}
                    </Badge>
                    <p className="font-medium text-foreground">{entry.title}</p>
                  </div>
                  <p className="mt-3">{entry.body}</p>
                  <div className="mt-3 space-y-2 border-t border-border/70 pt-3 text-xs leading-6 text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">
                        {messages.home.surfaceMetaLabels.audience}:
                      </span>{" "}
                      {entry.audience}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        {messages.home.surfaceMetaLabels.bestFor}:
                      </span>{" "}
                      {entry.bestFor}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        {messages.home.surfaceMetaLabels.readWhen}:
                      </span>{" "}
                      {entry.readWhen}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">
                        {messages.home.surfaceMetaLabels.notFor}:
                      </span>{" "}
                      {entry.notFor}
                    </p>
                  </div>
                  <div className="pt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={entry.href}
                        target={
                          entry.href.startsWith("http") ? "_blank" : undefined
                        }
                        rel={
                          entry.href.startsWith("http")
                            ? "noreferrer"
                            : undefined
                        }
                      >
                        {entry.cta}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-xl tracking-tight">
                {messages.home.machineReadableTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                {messages.home.machineReadableSurfaces.map((surface) => (
                  <div
                    key={surface.href}
                    className="surface-panel-soft rounded-xl border p-4 text-sm leading-7 text-muted-foreground"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="surface-badge w-fit">
                        {surface.label}
                      </Badge>
                      <p className="font-medium text-foreground">
                        {surface.title}
                      </p>
                    </div>
                    <p className="mt-3">{surface.body}</p>
                    <div className="mt-3 space-y-2 border-t border-border/70 pt-3 text-xs leading-6 text-muted-foreground">
                      <p>
                        <span className="font-semibold text-foreground">
                          {messages.home.surfaceMetaLabels.audience}:
                        </span>{" "}
                        {surface.audience}
                      </p>
                      <p>
                        <span className="font-semibold text-foreground">
                          {messages.home.surfaceMetaLabels.bestFor}:
                        </span>{" "}
                        {surface.bestFor}
                      </p>
                      <p>
                        <span className="font-semibold text-foreground">
                          {messages.home.surfaceMetaLabels.readWhen}:
                        </span>{" "}
                        {surface.readWhen}
                      </p>
                      <p>
                        <span className="font-semibold text-foreground">
                          {messages.home.surfaceMetaLabels.notFor}:
                        </span>{" "}
                        {surface.notFor}
                      </p>
                    </div>
                    <div className="pt-3">
                      <Button asChild size="sm" variant="outline">
                        <Link href={surface.href}>{surface.cta}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                {messages.home.machineReadableNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"
          aria-labelledby="next-step-title"
        >
          <Card className="surface-panel-elevated shadow-xl">
            <CardHeader>
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.home.nextStepBadge}
              </Badge>
              <CardTitle
                id="next-step-title"
                className="text-3xl tracking-tight"
              >
                {messages.home.nextStepTitle}
              </CardTitle>
              <CardDescription>{messages.home.nextStepBody}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
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

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-xl tracking-tight">
                {messages.home.refusalTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
              {messages.home.refusalPoints.map((point) => (
                <p key={point}>{point}</p>
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
