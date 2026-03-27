"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  ChevronRight,
  Clock3,
  Layers3,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  X
} from "lucide-react";

import { WorkbenchSuccessToast } from "@/components/workbench-success-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioCardItem, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTabScrollState } from "@/components/use-tab-scroll-state";
import {
  DIALOG_COPY,
  DRAFT_OPTIONS,
  FILTER_OPTIONS,
  TAB_COPY,
  WORK_ITEMS,
  type DialogContext,
  type DraftKind,
  getStatusVariant,
  type StatusFilter,
  type ViewState,
  type WorkItem,
  type WorkspaceTab
} from "./workbench-data";

function statusFilterIcon(filter: StatusFilter) {
  switch (filter) {
    case "active":
      return <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    case "blocked":
      return <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    default:
      return <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
}

function matchesWorkbenchFilters(item: WorkItem, normalizedQuery: string, statusFilter: StatusFilter): boolean {
  const matchesQuery =
    normalizedQuery.length === 0 ||
    item.name.toLowerCase().includes(normalizedQuery) ||
    item.summary.toLowerCase().includes(normalizedQuery) ||
    item.owner.toLowerCase().includes(normalizedQuery);
  const matchesStatus = statusFilter === "all" || item.status === statusFilter;

  return matchesQuery && matchesStatus;
}

function simulateWorkspaceRefresh(signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve("Workspace sync completed. Review-ready artifacts and gate signals are current.");
    }, 900);

    const handleAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Refresh cancelled.", "AbortError"));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", handleAbort);
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

const MIN_DRAFT_PROMPT_LENGTH = 16;

export default function Page() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("pipeline");
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [successMessage, setSuccessMessage] = useState("Workflow healthy. Your workspace is ready for the next brief.");
  const [draftKind, setDraftKind] = useState<DraftKind>("dashboard");
  const [draftPrompt, setDraftPrompt] = useState("Build an executive workbench with search, tabs, dialog and complete state coverage.");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContext, setDialogContext] = useState<DialogContext>("draft");
  const [draftPromptError, setDraftPromptError] = useState<string | null>(null);
  const [resultsAnnouncement, setResultsAnnouncement] = useState("");
  const refreshAbortRef = useRef<AbortController | null>(null);
  const lastDialogTriggerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const draftPromptHintId = useId();
  const draftPromptErrorId = useId();
  const {
    handleTabScrollFocus,
    handleScrollTabs,
    handleTabScrollKeyDown,
    tabsCanScrollLeft,
    tabsCanScrollRight,
    tabsListRef,
    tabsReady
  } =
    useTabScrollState({ activeTab, query, statusFilter });

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (viewState !== "loading") {
      return undefined;
    }

    const controller = new AbortController();
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = controller;

    void simulateWorkspaceRefresh(controller.signal)
      .then((message) => {
        if (controller.signal.aborted) {
          return;
        }
        setSuccessMessage(message);
        setViewState("success");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setViewState("error");
      });

    return () => {
      controller.abort();
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    };
  }, [viewState]);

  const normalizedQuery = query.trim().toLowerCase();
  const tabVisibleCounts = useMemo(() => {
    const counts: Record<WorkspaceTab, number> = { pipeline: 0, review: 0, release: 0 };
    for (const item of WORK_ITEMS) {
      if (matchesWorkbenchFilters(item, normalizedQuery, statusFilter)) {
        counts[item.tab] += 1;
      }
    }
    return counts;
  }, [normalizedQuery, statusFilter]);
  const tabItems = useMemo(() => {
    return WORK_ITEMS.filter((item) => {
      if (item.tab !== activeTab) {
        return false;
      }
      return matchesWorkbenchFilters(item, normalizedQuery, statusFilter);
    });
  }, [activeTab, normalizedQuery, statusFilter]);
  const queryMatchedTabItems = useMemo(() => {
    return WORK_ITEMS.filter((item) => {
      if (item.tab !== activeTab) {
        return false;
      }
      return matchesWorkbenchFilters(item, normalizedQuery, "all");
    });
  }, [activeTab, normalizedQuery]);
  const hasActiveFilters = normalizedQuery.length > 0 || statusFilter !== "all";
  const activeCount = queryMatchedTabItems.filter((item) => item.status === "active").length;
  const blockedCount = queryMatchedTabItems.filter((item) => item.status === "blocked").length;
  const doneCount = queryMatchedTabItems.filter((item) => item.status === "done").length;
  const tabMeta = TAB_COPY[activeTab];
  const promotionButtonLabel = hasActiveFilters ? "Promote top visible priority" : "Promote top priority";
  const promotionDescription = hasActiveFilters
    ? "Filters are active. Promotion uses the top-priority task in the current results."
    : "Promote the highest-priority item into a reviewable artifact bundle for the team.";
  const draftPromptCharacterCount = draftPrompt.trim().length;
  const draftPromptDescribedBy = draftPromptError ? `${draftPromptHintId} ${draftPromptErrorId}` : draftPromptHintId;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setResultsAnnouncement(
        `${tabItems.length} results in the ${tabMeta.label.toLowerCase()} lane.`
      );
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [tabItems.length, tabMeta.label]);

  useEffect(() => {
    if (viewState !== "success") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setViewState("ready");
    }, 5_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [viewState]);

  const openDialogForContext = (
    context: DialogContext,
    promptOverride?: string,
    triggerElement?: HTMLElement | null
  ) => {
    const nextCopy = DIALOG_COPY[context];
    lastDialogTriggerRef.current =
      triggerElement ?? (document.activeElement as HTMLElement | null);
    setDialogContext(context);
    setDraftKind(nextCopy.kind);
    setDraftPrompt(promptOverride ?? nextCopy.prompt);
    setDraftPromptError(null);
    setDialogOpen(true);
  };

  const handleWorkItemAction = (
    item: WorkItem,
    triggerElement?: HTMLElement | null
  ) => {
    openDialogForContext(
      item.tab,
      `${item.cta}: ${item.name}. Owner: ${item.owner}. Stage: ${item.stage}. Build the next artifact with explicit QA and release criteria.`,
      triggerElement
    );
  };

  const handleRefresh = () => {
    setViewState("loading");
  };

  const handlePreviewRecoveryState = () => {
    setViewState("error");
  };

  const handleCheckSignals = () => {
    setViewState("success");
    setSuccessMessage(`Quality signals refreshed for the ${tabMeta.label.toLowerCase()} lane.`);
  };

  const handleReset = () => {
    setQuery("");
    setStatusFilter("all");
    setViewState("ready");
    setSuccessMessage("Filters cleared. Showing the full workspace lane again.");
  };

  const handleClearQuery = () => {
    setQuery("");
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleDismissSuccess = () => {
    setViewState("ready");
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      setDraftPromptError(null);
    }
  };

  const handleCreateDraft = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const normalizedPrompt = draftPrompt.trim();
    if (normalizedPrompt.length < MIN_DRAFT_PROMPT_LENGTH) {
      setDraftPromptError(`Prompt must include at least ${MIN_DRAFT_PROMPT_LENGTH} characters.`);
      return;
    }
    setDraftPrompt(normalizedPrompt);
    setDraftPromptError(null);
    setDialogOpen(false);
    setViewState("success");
    setSuccessMessage(`Draft queued: ${DRAFT_OPTIONS.find((option) => option.value === draftKind)?.label}.`);
  };

  useEffect(() => {
    const node = tabsListRef.current;
    if (!node) {
      return;
    }

    const activeTrigger = node.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!activeTrigger) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activeTrigger.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth"
    });
  }, [activeTab, tabsListRef]);

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="workbench-page"
      data-hydrated={hydrated ? "true" : "false"}
    >
      <section
        className="overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/95 shadow-2xl"
        data-testid="workbench-shell"
        aria-labelledby="workbench-title"
      >
        <div className="border-b border-border/70 bg-workbench-hero px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-foreground">
                Product workbench
              </Badge>
              <div className="space-y-2">
                <h1 id="workbench-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Generate, review and ship polished UI flows in one place.
                </h1>
                <p className="max-w-[65ch] text-sm text-muted-foreground sm:text-base">
                  A production-ready cockpit for briefs, QA and release gates with complete interaction state coverage.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2" data-testid="workspace-signal">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                  3 active lanes
                </span>
                <span className="inline-flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" aria-hidden="true" />
                  Stable UI primitives only
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="gap-2"
                data-testid="create-draft-trigger"
                aria-label="Create a new UI draft"
                onClick={(event) =>
                  openDialogForContext("draft", undefined, event.currentTarget)
                }
              >
                <Rocket className="h-4 w-4" aria-hidden="true" />
                New draft
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleRefresh}
                className="gap-2"
                data-testid="refresh-workbench"
                aria-label="Refresh workspace data"
                disabled={viewState === "loading"}
              >
                <RefreshCw className={`h-4 w-4 ${viewState === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
                {viewState === "loading" ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-border/70 bg-background/70 px-6 py-5 sm:grid-cols-2 sm:px-8 xl:grid-cols-3">
          <Card data-testid="summary-active">
            <CardHeader className="pb-3">
              <CardDescription>Active work</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {activeCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Tasks currently moving through the {tabMeta.label.toLowerCase()} lane.
            </CardContent>
          </Card>
          <Card data-testid="summary-blocked">
            <CardHeader className="pb-3">
              <CardDescription>Blocked</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {blockedCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Dependencies that need decisions before this lane can move forward.
            </CardContent>
          </Card>
          <Card data-testid="summary-complete">
            <CardHeader className="pb-3">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {doneCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Recently finished items ready to reuse or hand off downstream.
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="text-xl font-semibold tracking-tight text-foreground">Command bar</div>
                <p className="text-sm text-muted-foreground">
                  Search work items, focus a status lane and reset back to the full board instantly.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePreviewRecoveryState}
                  data-testid="simulate-error"
                  aria-label="Preview recovery state"
                >
                  Preview recovery
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleReset}
                  data-testid="reset-filters"
                  aria-label="Reset search and filters"
                >
                  Reset
                </Button>
              </div>
            </div>

            <div
              className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
              data-testid="command-bar"
            >
              <div className="grid gap-2">
                <Label htmlFor="workspace-search">Search</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="workspace-search"
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search briefs, owners or review notes"
                    className="pl-9 pr-10"
                    aria-controls="workbench-results-region"
                    data-testid="search-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 transition-opacity ${query.length > 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    aria-label="Clear search query"
                    data-testid="search-clear"
                    disabled={query.length === 0}
                    onClick={handleClearQuery}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label id="status-filter-label">Filter</Label>
                <RadioGroup
                  value={statusFilter}
                  onValueChange={(value: string) => setStatusFilter(value as StatusFilter)}
                  className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
                  aria-labelledby="status-filter-label"
                  data-testid="status-filter-group"
                >
                  {FILTER_OPTIONS.map((option) => (
                    <RadioCardItem
                      key={option.value}
                      value={option.value}
                      id={`status-${option.value}`}
                      className="items-center px-4 py-3 text-sm font-medium"
                      data-testid={`status-card-${option.value}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {statusFilterIcon(option.value)}
                        {option.label}
                      </span>
                    </RadioCardItem>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value: string) => setActiveTab(value as WorkspaceTab)}
            className="space-y-4"
            data-testid="workspace-tabs"
          >
            <span className="sr-only" aria-live="polite" data-testid="results-announcer">
              {resultsAnnouncement}
            </span>
            <div className="relative px-10 sm:px-12">
              <div className="absolute inset-y-0 left-0 flex items-center rounded-l-xl pl-0.5 pr-1 sm:pl-1 sm:pr-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-full text-muted-foreground/80 transition-opacity ${tabsReady && tabsCanScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"}`}
                  aria-controls="workbench-tab-scroll-region"
                  aria-label="Scroll tabs left"
                  data-testid="scroll-tabs-left"
                  disabled={!tabsReady || !tabsCanScrollLeft}
                  onClick={() => handleScrollTabs("left")}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center rounded-r-xl pl-1 pr-0.5 sm:pl-2 sm:pr-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-full text-muted-foreground/80 transition-opacity ${tabsReady && tabsCanScrollRight ? "opacity-100" : "pointer-events-none opacity-0"}`}
                  aria-controls="workbench-tab-scroll-region"
                  aria-label="Scroll tabs right"
                  data-testid="scroll-tabs-right"
                  disabled={!tabsReady || !tabsCanScrollRight}
                  onClick={() => handleScrollTabs("right")}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div
                id="workbench-tab-scroll-region"
                ref={tabsListRef}
                role="region"
                aria-label="Scrollable workbench tab list"
                className="overflow-x-auto rounded-xl"
                data-testid="workbench-tab-scroll-region"
                onFocusCapture={handleTabScrollFocus}
                onKeyDown={handleTabScrollKeyDown}
              >
                <TabsList
                  id="workbench-tablist"
                  aria-label="Workbench lanes"
                  className="whitespace-nowrap px-2 py-3 pb-4"
                >
                  <TabsTrigger value="pipeline" data-testid="tab-pipeline" aria-label={`Pipeline lane, ${tabVisibleCounts.pipeline} items`} onFocus={handleTabScrollFocus}>
                    <span className="inline-flex items-center gap-2">
                      Pipeline
                      <Badge variant="secondary" data-testid="tab-count-pipeline" aria-hidden="true">{tabVisibleCounts.pipeline}</Badge>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="review" data-testid="tab-review" aria-label={`Review lane, ${tabVisibleCounts.review} items`} onFocus={handleTabScrollFocus}>
                    <span className="inline-flex items-center gap-2">
                      Review
                      <Badge variant="secondary" data-testid="tab-count-review" aria-hidden="true">{tabVisibleCounts.review}</Badge>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="release" data-testid="tab-release" aria-label={`Release lane, ${tabVisibleCounts.release} items`} onFocus={handleTabScrollFocus}>
                    <span className="inline-flex items-center gap-2">
                      Release
                      <Badge variant="secondary" data-testid="tab-count-release" aria-hidden="true">{tabVisibleCounts.release}</Badge>
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value={activeTab} className="space-y-4" data-testid={`panel-${activeTab}`}>
                  <Card>
                    <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{tabMeta.label}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {`${tabItems.length} visible`}
                          </span>
                        </div>
                        <h2 className="text-2xl font-semibold tracking-tight">{tabMeta.label} workbench</h2>
                        <CardDescription>{tabMeta.subtitle}</CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        data-testid={`cta-${activeTab}`}
                        onClick={(event) =>
                          openDialogForContext(activeTab, undefined, event.currentTarget)
                        }
                      >
                        {tabMeta.cta}
                      </Button>
                    </CardHeader>
                  </Card>

                  <div id="workbench-results-region">
                  {viewState === "loading" ? (
                    <div
                      className="grid gap-4 lg:grid-cols-2"
                      role="status"
                      aria-live="polite"
                      aria-busy="true"
                      data-testid="loading-state"
                    >
                      <p className="sr-only">Loading work items for the active lane.</p>
                      {[0, 1, 2, 3].map((index) => (
                        <Card key={index}>
                          <CardHeader className="space-y-3">
                            <Skeleton className="h-4 w-24" aria-hidden="true" />
                            <Skeleton className="h-7 w-2/3" aria-hidden="true" />
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Skeleton className="h-4 w-full" aria-hidden="true" />
                            <Skeleton className="h-4 w-5/6" aria-hidden="true" />
                            <Skeleton className="h-10 w-full" aria-hidden="true" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : null}

                  {viewState === "error" ? (
                    <Card
                      className="border-destructive/30 bg-destructive/5"
                      role="alert"
                      aria-live="assertive"
                      data-testid="error-state"
                    >
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                          <div className="space-y-1">
                            <CardTitle className="text-xl">The workspace lost its latest sync.</CardTitle>
                            <CardDescription>
                              We could not refresh the selected lane. Retry the request or reset the command bar.
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardFooter className="gap-3">
                        <Button type="button" onClick={handleRefresh} data-testid="retry-refresh" aria-label="Retry refresh">
                          Retry refresh
                        </Button>
                        <Button type="button" variant="outline" onClick={handleReset} aria-label="Reset workspace state">
                          Reset state
                        </Button>
                      </CardFooter>
                    </Card>
                  ) : null}

                  {viewState !== "loading" && viewState !== "error" && tabItems.length === 0 ? (
                    <Card role="status" aria-live="polite" data-testid="empty-state">
                      <CardHeader>
                        <CardTitle className="text-xl">No work items match this view.</CardTitle>
                        <CardDescription>
                          {hasActiveFilters
                            ? "Try a broader search or reset the status filter to bring the full queue back."
                            : `The ${tabMeta.label.toLowerCase()} lane is clear right now. Start a new task to populate it.`}
                        </CardDescription>
                      </CardHeader>
                      <CardFooter>
                        {hasActiveFilters ? (
                          <Button type="button" variant="outline" onClick={handleReset} aria-label="Reset filters from empty state">
                            Reset filters
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                        onClick={(event) =>
                          openDialogForContext(activeTab, undefined, event.currentTarget)
                        }
                          >
                            {tabMeta.cta}
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  ) : null}

                  {viewState !== "loading" && viewState !== "error" && tabItems.length > 0 ? (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
                      <div className="grid gap-4" role="list" aria-label={`${tabMeta.label} work items`} data-testid="work-item-list">
                        {tabItems.map((item) => (
                          <Card key={item.id} role="listitem" data-testid={`work-item-${item.id}`}>
                            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
                                  <Badge variant="outline">{item.priority}</Badge>
                                  <span className="text-sm text-muted-foreground">{item.stage}</span>
                                </div>
                                <h3 className="text-xl font-semibold leading-none tracking-tight">{item.name}</h3>
                                <CardDescription>{item.summary}</CardDescription>
                              </div>
                              <div className="text-right text-sm text-muted-foreground">
                                <p>{item.owner}</p>
                                <p>{item.due}</p>
                              </div>
                            </CardHeader>
                            <CardFooter className="flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
                              <p className="text-sm text-muted-foreground">
                                Stable identifiers: <span className="font-medium text-foreground">{item.id}</span>
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                aria-label={`${item.cta}: ${item.name}`}
                                data-testid={`work-item-action-${item.id}`}
                                onClick={(event) =>
                                  handleWorkItemAction(item, event.currentTarget)
                                }
                              >
                                {item.cta}
                              </Button>
                            </CardFooter>
                          </Card>
                        ))}
                      </div>

                      <div className="grid gap-4">
                        <Card data-testid="ops-panel">
                          <CardHeader>
                            <h3 className="text-xl font-semibold tracking-tight">Launch controls</h3>
                            <CardDescription>Keep the next decision visible and move the lane forward with one action.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4 text-sm text-muted-foreground">
                            <div className="rounded-xl border border-border bg-background p-4">
                              <p className="font-medium text-foreground">Next best action</p>
                              <p className="mt-2">{promotionDescription}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-background p-4">
                              <p className="font-medium text-foreground">Quality signal</p>
                              <p className="mt-2">Keyboard paths, state coverage and CTA labels are ready for regression checks.</p>
                            </div>
                          </CardContent>
                          <CardFooter className="gap-3">
                            <Button
                              type="button"
                              className="gap-2"
                              data-testid="primary-cta"
                              aria-label={
                                hasActiveFilters
                                  ? "Promote the top priority task in the current filtered results"
                                  : "Promote the top priority task"
                              }
                              onClick={(event) => {
                                const promotedItem = tabItems[0];
                                openDialogForContext(
                                  "priority",
                                  promotedItem
                                    ? hasActiveFilters
                                      ? `Promote ${promotedItem.name} from the current filtered view into a launch-ready brief with explicit QA and release checkpoints.`
                                      : `Promote ${promotedItem.name} into a launch-ready brief with explicit QA and release checkpoints.`
                                    : hasActiveFilters
                                      ? "Promote the current top-priority task from the filtered results into a launch-ready brief."
                                      : "Promote the current top-priority task into a launch-ready brief.",
                                  event.currentTarget
                                );
                              }}
                            >
                              <Rocket className="h-4 w-4" aria-hidden="true" />
                              {promotionButtonLabel}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="gap-2"
                              aria-label="Refresh quality signals"
                              data-testid="refresh-signals"
                              onClick={handleCheckSignals}
                            >
                              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                              Check signals
                            </Button>
                          </CardFooter>
                        </Card>
                      </div>
                    </div>
                  ) : null}
                  </div>
                </TabsContent>
          </Tabs>
        </div>
      </section>
      <WorkbenchSuccessToast
        message={successMessage}
        onDismiss={handleDismissSuccess}
        open={viewState === "success"}
      />
      <Dialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
      >
        <DialogContent
          data-testid="create-draft-dialog"
          aria-describedby="create-draft-description"
          onCloseAutoFocus={(event: Event) => {
            const trigger = lastDialogTriggerRef.current;
            if (!trigger) {
              return;
            }
            event.preventDefault();
            trigger.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{DIALOG_COPY[dialogContext].title}</DialogTitle>
            <DialogDescription id="create-draft-description">
              {DIALOG_COPY[dialogContext].description}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-5" onSubmit={handleCreateDraft}>
            <div className="grid gap-2">
              <Label htmlFor="draft-prompt">Prompt</Label>
              <Textarea
                id="draft-prompt"
                value={draftPrompt}
                onChange={(event) => {
                  const nextPrompt = event.target.value;
                  setDraftPrompt(nextPrompt);
                  if (draftPromptError && nextPrompt.trim().length >= MIN_DRAFT_PROMPT_LENGTH) {
                    setDraftPromptError(null);
                  }
                }}
                placeholder="Describe the UI goal"
                rows={4}
                aria-invalid={draftPromptError ? "true" : undefined}
                aria-describedby={draftPromptDescribedBy}
                data-testid="draft-prompt-input"
              />
              <p id={draftPromptHintId} className="text-xs text-muted-foreground">
                {draftPromptCharacterCount}/{MIN_DRAFT_PROMPT_LENGTH} minimum characters with the target user flow.
              </p>
              {draftPromptError ? (
                <p id={draftPromptErrorId} className="text-xs text-destructive">
                  {draftPromptError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3">
              <Label id="draft-surface-label">Surface</Label>
              <RadioGroup
                value={draftKind}
                onValueChange={(value: string) => setDraftKind(value as DraftKind)}
                className="gap-3"
                aria-labelledby="draft-surface-label"
                data-testid="draft-surface-group"
              >
                {DRAFT_OPTIONS.map((option) => (
                  <RadioCardItem
                    key={option.value}
                    value={option.value}
                    id={`draft-${option.value}`}
                    data-testid={`draft-option-${option.value}`}
                  >
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-sm text-muted-foreground">{option.hint}</span>
                    </span>
                  </RadioCardItem>
                ))}
              </RadioGroup>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Cancel
              </Button>
                    <Button
                      type="submit"
                      data-testid="create-draft-submit"
                      aria-label="Queue the new draft"
                    >
                      Queue draft
                    </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
