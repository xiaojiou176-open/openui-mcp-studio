import Link from "next/link";
import type { ReactNode } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    { href: "/walkthrough", label: messages.shell.navLinks.walkthrough },
    { href: "/proof", label: messages.shell.navLinks.proof },
    { href: "/workbench", label: messages.shell.navLinks.workbench },
    { href: "/compare", label: messages.shell.navLinks.compare },
    { href: "/docs", label: messages.shell.navLinks.docs },
    { href: "/", label: messages.shell.navLinks.home },
  ];
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
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <div className="surface-shell mx-auto w-full max-w-7xl rounded-[calc(var(--radius-xl)+0.15rem)]">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/"
                    className="inline-flex min-h-10 items-center font-mono text-[0.72rem] font-medium uppercase tracking-[0.22em] text-primary"
                  >
                    {SITE_BRAND.frontdoorName}
                  </Link>
                  <Badge variant="outline" className="surface-badge">
                    Front door
                  </Badge>
                </div>
                <p className="text-sm font-medium text-foreground/84">
                  {SITE_BRAND.poweredBy}
                </p>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {messages.shell.productLine}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <Button asChild size="sm" className="shadow-none">
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
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {navLinks.map((item) => {
                  const isActive = item.href === activeHref;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200",
                        isActive
                          ? "border-primary/25 bg-primary/8 text-foreground shadow-[0_12px_32px_-26px_hsl(var(--shadow-color)/0.4)]"
                          : "border-border/70 bg-background/68 text-muted-foreground hover:border-foreground/12 hover:bg-card/92 hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="flex flex-wrap items-center gap-3 rounded-[1.1rem] border border-border/70 bg-background/68 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  <Badge variant="outline" className="surface-badge">
                    {messages.shell.routeGuideBadge}
                  </Badge>
                  <p className="max-w-4xl">{messages.shell.routeGuideBody}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-[1.1rem] border border-border/70 bg-background/68 px-4 py-3 text-xs leading-6 text-muted-foreground">
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Quick shelves
                  </span>
                  {quickShelfLinks.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noreferrer" : undefined}
                      className="link-quiet inline-flex min-h-10 items-center rounded-full border border-transparent px-3 py-1.5 hover:border-border/70 hover:bg-background/72"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {children}

      <footer className="px-3 pb-6 pt-10 sm:px-6">
        <div className="surface-shell mx-auto flex w-full max-w-7xl flex-col gap-6 rounded-[calc(var(--radius-xl)+0.15rem)] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3">
              <Badge variant="outline" className="surface-badge w-fit">
                {messages.shell.footerBadge}
              </Badge>
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">
                  {messages.shell.footerTitle}
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  {messages.shell.footerBody}
                </p>
              </div>
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
