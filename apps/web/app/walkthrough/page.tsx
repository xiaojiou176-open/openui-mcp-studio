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
  title: "First-minute walkthrough",
  description:
    "A fast route through the front door, proof surface, workbench, and docs for OpenUI MCP Studio.",
  path: "/walkthrough",
  keywords: [
    "OpenUI MCP Studio walkthrough",
    "first-minute proof path",
    "AI UI shipping walkthrough",
  ],
});

const walkthroughStructuredData = buildStructuredDiscoveryJsonLd({
  siteUrl: getResolvedSiteUrl(),
  path: "/walkthrough",
  title: "First-minute walkthrough",
  description:
    "A fast route through the front door, proof surface, workbench, and docs for OpenUI MCP Studio.",
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
        className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
      >
        <section className="space-y-4 rounded-[var(--radius-xl)] border border-border/70 bg-frontdoor-hero px-6 py-8 shadow-xl sm:px-8">
          <Badge className="bg-primary/95 text-primary-foreground">
            {messages.walkthrough.heroBadge}
          </Badge>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {messages.walkthrough.heroTitle}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            {messages.walkthrough.heroBody}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/proof">
                {messages.walkthrough.heroCtas.proof}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/workbench">
                {messages.walkthrough.heroCtas.workbench}
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {messages.walkthrough.steps.map((item) => (
            <Card key={item.step} className="border-border/70 bg-card/90">
              <CardHeader>
                <Badge
                  variant="outline"
                  className="w-fit border-primary/20 bg-primary/5"
                >
                  {item.step}
                </Badge>
                <CardTitle className="text-2xl tracking-tight">
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
                    target={item.href.startsWith("http") ? "_blank" : undefined}
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
        </section>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {messages.walkthrough.commandsTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-xl border border-border/70 bg-foreground px-4 py-4 text-sm text-background">
              <code>{`npm run demo:ship\nnpm run smoke:e2e\nnpm run repo:doctor\nnpm run visual:qa`}</code>
            </pre>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">
              {messages.home.nextStepTitle}
            </CardTitle>
            <CardDescription>
              {messages.home.nextStepBody}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {messages.home.nextStepLinks.map((item) => (
              <Button key={item.href} asChild variant="outline" className="justify-start">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        {walkthroughStructuredData ? (
          <script type="application/ld+json" aria-hidden="true">
            {serializeJsonLd(walkthroughStructuredData)}
          </script>
        ) : null}
      </main>
    </FrontdoorShell>
  );
}
