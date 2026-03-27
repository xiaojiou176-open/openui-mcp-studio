import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";

import "./globals.css";

export const metadata: Metadata = {
  title: "OpenUI MCP Studio Proof Workbench",
  description: "Review the default proof target for OpenUI MCP Studio before you trust a generated UI workflow.",
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
