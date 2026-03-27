import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";

import "./globals.css";

export const metadata: Metadata = {
  title: "UIUX Generator",
  description: "Generate polished UI and UX deliverables from natural language prompts.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ErrorBoundary>
          <div className="relative flex flex-col">{children}</div>
        </ErrorBoundary>
      </body>
    </html>
  );
}
