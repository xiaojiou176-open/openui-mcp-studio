"use client";

import { Component, Fragment, type ReactNode } from "react";

import { WorkbenchErrorPanel } from "@/components/workbench-error-panel";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  resetKey: number;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    resetKey: 0,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true, resetKey: 0 };
  }

  private handleReset = () => {
    this.setState((state) => ({ hasError: false, resetKey: state.resetKey + 1 }));
  };

  override render() {
    if (!this.state.hasError) {
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }

    return (
      <WorkbenchErrorPanel
        heading="section"
        title="The workbench needs a fresh restart."
        description="A client-side rendering error interrupted the current session. Reload the workbench to recover."
        actionLabel="Restore the workbench"
        onAction={this.handleReset}
        secondaryActionLabel="Reload page"
        onSecondaryAction={() => window.location.reload()}
      />
    );
  }
}
