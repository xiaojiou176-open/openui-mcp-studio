"use client";

import { WorkbenchErrorPanel } from "@/components/workbench-error-panel";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <WorkbenchErrorPanel
      heading="page"
      title="The workbench hit an unexpected runtime error."
      description="Refresh the current state and try the action again. The rest of the release tooling is unchanged."
      digest={error.digest ?? "WORKBENCH_RUNTIME_ERROR"}
      actionLabel="Reload the workbench"
      onAction={reset}
      secondaryActionLabel="Reload page"
      onSecondaryAction={() => window.location.reload()}
    />
  );
}
