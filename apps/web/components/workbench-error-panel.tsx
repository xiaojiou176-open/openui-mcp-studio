"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type WorkbenchErrorPanelProps = {
  title: string;
  description: ReactNode;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  digest?: string;
  heading: "page" | "section";
};

export function WorkbenchErrorPanel({
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  digest,
  heading,
}: WorkbenchErrorPanelProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center px-4 py-8 sm:px-6">
      <Card className="w-full border-destructive/20 bg-card/95 shadow-2xl">
        <CardHeader className="space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          {heading === "page" ? (
            <h1 className="text-2xl font-semibold leading-none tracking-tight">{title}</h1>
          ) : (
            <CardTitle>{title}</CardTitle>
          )}
        </CardHeader>
        <CardContent className={digest ? "space-y-3 text-sm text-muted-foreground" : "text-sm text-muted-foreground"}>
          <p>{description}</p>
          {digest ? (
            <p className="rounded-xl border border-border bg-background px-4 py-3 text-xs text-foreground/80">
              Reference: {digest}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button type="button" className="gap-2" onClick={onAction}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {actionLabel}
          </Button>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button type="button" variant="outline" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </main>
  );
}
