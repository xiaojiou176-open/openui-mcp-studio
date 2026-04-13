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
  title: "First-minute walkthrough",
  description:
    "A fast route through the front door, proof surface, workbench, and docs for OpenUIStudio.",
  path: "/walkthrough",
  keywords: [
    "OpenUIStudio walkthrough",
    "first-minute proof path",
    "AI UI shipping walkthrough",
  ],
});

const walkthroughStructuredData = buildStructuredDiscoveryJsonLd({
  siteUrl: getResolvedSiteUrl(),
  path: "/walkthrough",
  title: "First-minute walkthrough",
  description:
    "A fast route through the front door, proof surface, workbench, and docs for OpenUIStudio.",
  type: "HowTo",
  breadcrumbLabel: "Walkthrough",
  about: ["front door", "proof desk", "operator desk", "repo-owned commands"],
  howToSteps: [
    "Read the front door like a product evaluator.",
    "See the proof desk before the operator desk.",
    "Open the operator desk once the proof meaning is clear.",
    "Read the longer walkthrough notes and run one real command.",
  ],
});

export default async function WalkthroughPage() {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);

  return (
    <FrontdoorShell activeHref="/walkthrough">
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-6 sm:px-6 lg:px-8"
      >
        <section className="surface-outline overflow-hidden rounded-[calc(var(--radius-xl)+0.25rem)] border bg-frontdoor-hero shadow-[0_32px_90px_-54px_hsl(var(--shadow-color)/0.48)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-center lg:px-10 lg:py-10">
            <div className="flex flex-col gap-5">
              <Badge className="bg-primary/95 text-primary-foreground">
                {messages.walkthrough.heroBadge}
              </Badge>
              <div className="flex flex-col gap-4">
                <p className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-primary/78">
                  Guided route. One clear move at a time.
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  {messages.walkthrough.heroTitle}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {messages.walkthrough.heroBody}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/proof">{messages.walkthrough.heroCtas.proof}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/workbench">
                    {messages.walkthrough.heroCtas.workbench}
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
              <div className="mt-5 flex flex-col gap-3">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-white/48">
                  Minute-one route
                </p>
                {messages.walkthrough.steps.map((item) => (
                  <div
                    key={item.step}
                    className="rounded-[1rem] border border-white/10 bg-white/6 px-4 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[0.72rem] text-white/46">
                        {item.step}
                      </span>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-white/68">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader
            badge="Guided path"
            title="Pick the path that matches how deep you want to go."
            body="This page should feel like a tour guide, not a detached doc excerpt. Each stop has one job, one question, and one next move."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {messages.walkthrough.steps.map((item) => (
              <Card key={item.step} className="surface-panel h-full border-border/75">
                <CardHeader className="gap-4">
                  <Badge variant="outline" className="surface-badge w-fit">
                    {item.step}
                  </Badge>
                  <div className="flex flex-col gap-3">
                    <CardTitle className="text-2xl tracking-tight">
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.body}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                    >
                      {item.cta}
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
                badge="One real command"
                title={messages.walkthrough.commandsTitle}
                body="The walkthrough should end in something concrete. Think of this as the boarding pass that proves you actually reached the right gate."
              />
            </CardHeader>
            <CardContent className="pt-0">
              <pre className="overflow-x-auto rounded-[1.05rem] border border-black/10 bg-[linear-gradient(180deg,hsl(var(--dark-surface))_0%,hsl(var(--dark-surface-2))_100%)] px-4 py-4 text-sm text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
                <code>{`npm run demo:ship\nnpm run smoke:e2e\nnpm run repo:doctor\nnpm run visual:qa`}</code>
              </pre>
            </CardContent>
          </Card>

          <Card className="surface-panel-elevated border-border/75">
            <CardHeader className="gap-4">
              <SectionHeader
                badge="30-second proof"
                title="Choose the next route after the tour."
                body={messages.home.nextStepBody}
              />
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-4">
              {messages.home.nextStepLinks.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant="outline"
                  className="justify-start"
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </section>

        {walkthroughStructuredData ? (
          <script type="application/ld+json" aria-hidden="true">
            {serializeJsonLd(walkthroughStructuredData)}
          </script>
        ) : null}
      </main>
    </FrontdoorShell>
  );
}
