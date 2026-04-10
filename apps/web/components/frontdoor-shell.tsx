import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SITE_BRAND } from "@/lib/frontdoor-content";
import { getFrontdoorMessages } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

type FrontdoorShellProps = {
  activeHref?: string;
  children: ReactNode;
};

export async function FrontdoorShell({
  activeHref = "/",
  children,
}: FrontdoorShellProps) {
  const locale = await getRequestLocale();
  const messages = getFrontdoorMessages(locale);
  const navLinks = [
    { href: "/", label: messages.shell.navLinks.home },
    { href: "/walkthrough", label: messages.shell.navLinks.walkthrough },
    { href: "/proof", label: messages.shell.navLinks.proof },
    { href: "/workbench", label: messages.shell.navLinks.workbench },
    { href: "/docs", label: messages.shell.navLinks.docs },
    { href: "/compare", label: messages.shell.navLinks.compare },
  ];
  const primaryNavLinks = navLinks.slice(1, 4);
  const secondaryNavLinks = [navLinks[0], ...navLinks.slice(4)];
  const quickShelfLinks = [
    {
      href: SITE_BRAND.docs.readme,
      label: "README storefront",
      external: true,
    },
    {
      href: SITE_BRAND.docs.evaluatorChecklist,
      label: "Evaluator checklist",
    },
    {
      href: SITE_BRAND.docs.publicDistributionBundle,
      label: "Public bundle",
      external: true,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/92 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col">
              <Link
                href="/"
                className="w-fit text-sm font-semibold uppercase tracking-[0.28em] text-primary"
              >
                {SITE_BRAND.frontdoorName}
              </Link>
              <p className="truncate text-sm text-muted-foreground">
                {SITE_BRAND.poweredBy}
              </p>
              <p className="max-w-xl text-xs text-muted-foreground/90">
                {messages.shell.productLine}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Button asChild size="sm">
                <Link
                  href={SITE_BRAND.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {messages.shell.githubLabel}
                </Link>
              </Button>
              <LanguageSwitcher
                label={messages.localeLabel}
                localeLabels={messages.localeNames}
              />
            </div>
          </div>

          <nav
            aria-label={messages.shell.quickNavigationLabel}
            className="space-y-3"
          >
            <div className="flex flex-wrap gap-2">
              {primaryNavLinks.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant={item.href === activeHref ? "secondary" : "outline"}
                  size="sm"
                >
                  <Link
                    href={item.href}
                    aria-current={item.href === activeHref ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {secondaryNavLinks.map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant={item.href === activeHref ? "secondary" : "ghost"}
                  size="sm"
                >
                  <Link
                    href={item.href}
                    aria-current={item.href === activeHref ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/80 px-3 py-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
                {messages.shell.routeGuideBadge}
              </Badge>
              <p className="max-w-4xl leading-6">{messages.shell.routeGuideBody}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5">
                Quick shelves
              </Badge>
              {quickShelfLinks.map((item) => (
                <Button key={item.label} asChild variant="ghost" size="sm">
                  <Link
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                  >
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-border/70 bg-card/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge
                variant="outline"
                className="w-fit border-primary/20 bg-primary/5"
              >
                {messages.shell.footerBadge}
              </Badge>
              <h2 className="text-xl font-semibold tracking-tight">
                {messages.shell.footerTitle}
              </h2>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {messages.shell.footerBody}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={SITE_BRAND.docs.readme}
                  target="_blank"
                  rel="noreferrer"
                >
                  {messages.shell.footerLinks.readme}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={SITE_BRAND.docs.docsHub}>
                  {messages.shell.footerLinks.docs}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={SITE_BRAND.docs.proofFaq}>
                  {messages.shell.footerLinks.proofFaq}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={SITE_BRAND.docs.walkthrough}>
                  {messages.shell.footerLinks.walkthrough}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
