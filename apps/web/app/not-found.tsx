import Link from "next/link";

import { FrontdoorShell } from "@/components/frontdoor-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <FrontdoorShell>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8"
      >
        <section className="space-y-4 rounded-[var(--radius-xl)] border border-border/70 bg-frontdoor-hero px-6 py-8 shadow-xl sm:px-8">
          <Badge className="bg-primary/95 text-primary-foreground">
            Proof target not found
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            This route does not exist on the current proof surface.
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Return to the front door, open the proof desk, or jump straight to
            the operator desk to keep the repo-owned evaluation path visible.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/">Back to the front door</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/proof">Open the proof desk</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/workbench">Open the operator desk</Link>
            </Button>
          </div>
        </section>
      </main>
    </FrontdoorShell>
  );
}
