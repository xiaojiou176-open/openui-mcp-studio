"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
  X,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { WorkbenchSuccessToast } from "@/components/workbench-success-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioCardItem, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/locale-provider";
import { useTabScrollState } from "@/components/use-tab-scroll-state";
import {
  getWorkbenchContent,
  type DialogContext,
  type DraftKind,
  getStatusVariant,
  type StatusFilter,
  type ViewState,
  type WorkItem,
  type WorkspaceTab,
} from "../workbench-data";
import {
  matchesWorkbenchFilters,
  simulateWorkspaceRefresh,
} from "../workbench-utils";

function statusFilterIcon(filter: StatusFilter) {
  switch (filter) {
    case "active":
      return (
        <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      );
    case "blocked":
      return (
        <ShieldAlert
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      );
    case "done":
      return (
        <CheckCircle2
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      );
    default:
      return (
        <CircleDot
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      );
  }
}

const MIN_DRAFT_PROMPT_LENGTH = 16;

export default function Page() {
  const { locale } = useLocale();
  const copy = getWorkbenchContent(locale);
  const workItems = copy.workItems;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("pipeline");
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewState, setViewState] = useState<ViewState>("ready");
  const [successMessage, setSuccessMessage] = useState(copy.workspaceHealthy);
  const [draftKind, setDraftKind] = useState<DraftKind>("dashboard");
  const [draftPrompt, setDraftPrompt] = useState(copy.dialogCopy.draft.prompt);
  const tabMeta = copy.tabCopy[activeTab];
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
    tabsReady,
  } = useTabScrollState({ activeTab, query, statusFilter });

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

    void simulateWorkspaceRefresh(
      controller.signal,
      copy.refreshSuccess(copy.tabCopy[activeTab].label),
    )
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
  }, [activeTab, locale, viewState]);

  const normalizedQuery = query.trim().toLowerCase();
  const tabVisibleCounts = useMemo(() => {
    const counts: Record<WorkspaceTab, number> = {
      pipeline: 0,
      review: 0,
      release: 0,
    };
    for (const item of workItems) {
      if (matchesWorkbenchFilters(item, normalizedQuery, statusFilter)) {
        counts[item.tab] += 1;
      }
    }
    return counts;
  }, [normalizedQuery, statusFilter, workItems]);
  const tabItems = useMemo(() => {
    return workItems.filter((item) => {
      if (item.tab !== activeTab) {
        return false;
      }
      return matchesWorkbenchFilters(item, normalizedQuery, statusFilter);
    });
  }, [activeTab, normalizedQuery, statusFilter, workItems]);
  const queryMatchedTabItems = useMemo(() => {
    return workItems.filter((item) => {
      if (item.tab !== activeTab) {
        return false;
      }
      return matchesWorkbenchFilters(item, normalizedQuery, "all");
    });
  }, [activeTab, normalizedQuery, workItems]);
  const hasActiveFilters = normalizedQuery.length > 0 || statusFilter !== "all";
  const activeCount = queryMatchedTabItems.filter(
    (item) => item.status === "active",
  ).length;
  const blockedCount = queryMatchedTabItems.filter(
    (item) => item.status === "blocked",
  ).length;
  const doneCount = queryMatchedTabItems.filter(
    (item) => item.status === "done",
  ).length;
  const leadVisibleItem = tabItems[0] ?? null;
  const promotionButtonLabel = hasActiveFilters
    ? copy.promoteTopPriorityFiltered
    : copy.promoteTopPriority;
  const promotionDescription = hasActiveFilters
    ? copy.promoteDescriptionFiltered
    : copy.promoteDescription;
  const nextActionGuidance = leadVisibleItem
    ? copy.nextActionGuidance[leadVisibleItem.status]
    : copy.nextActionGuidance.empty;
  const draftPromptCharacterCount = draftPrompt.trim().length;
  const draftPromptDescribedBy = draftPromptError
    ? `${draftPromptHintId} ${draftPromptErrorId}`
    : draftPromptHintId;

  useEffect(() => {
    if (viewState === "ready") {
      setSuccessMessage(copy.workspaceHealthy);
    }
  }, [copy.workspaceHealthy, viewState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setResultsAnnouncement(
        copy.resultsAnnouncement(tabItems.length, tabMeta.label),
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
    triggerElement?: HTMLElement | null,
  ) => {
    const nextCopy = copy.dialogCopy[context];
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
    triggerElement?: HTMLElement | null,
  ) => {
    openDialogForContext(
      item.tab,
      `${item.cta}: ${item.name}. ${copy.ownerLabel}: ${item.owner}. ${copy.stageLabel}: ${item.stage}. ${copy.artifactBriefSuffix}`,
      triggerElement,
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
    setSuccessMessage(copy.refreshSuccess(tabMeta.label));
  };

  const handleReset = () => {
    setQuery("");
    setStatusFilter("all");
    setViewState("ready");
    setSuccessMessage(copy.workspaceHealthy);
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
      setDraftPromptError(copy.dialogPromptError(MIN_DRAFT_PROMPT_LENGTH));
      return;
    }
    setDraftPrompt(normalizedPrompt);
    setDraftPromptError(null);
    setDialogOpen(false);
    setViewState("success");
    setSuccessMessage(
      copy.draftQueued(
        copy.draftOptions.find((option) => option.value === draftKind)?.label ??
          draftKind,
      ),
    );
  };

  useEffect(() => {
    const node = tabsListRef.current;
    if (!node) {
      return;
    }

    const activeTrigger = node.querySelector<HTMLElement>(
      '[role="tab"][data-state="active"]',
    );
    if (!activeTrigger) {
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    activeTrigger.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeTab, tabsListRef]);

  return (
    <main
      id="main-content"
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
              <Badge
                variant="outline"
                className="w-fit border-primary/20 bg-primary/5 text-foreground"
              >
                {copy.badge}
              </Badge>
              <div className="space-y-2">
                <h1
                  id="workbench-title"
                  className="text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  {copy.pageTitle}
                </h1>
                <p className="max-w-[65ch] text-sm text-muted-foreground sm:text-base">
                  {copy.pageDescription}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span
                  className="inline-flex items-center gap-2"
                  data-testid="workspace-signal"
                >
                  <Sparkles
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  {copy.laneSignal}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Layers3
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  {copy.primitiveSignal}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <LanguageSwitcher
                label={copy.localeLabel}
                localeLabels={copy.localeNames}
              />
              <Button asChild size="lg" className="gap-2">
                <Link href="/proof">{copy.proofDeskLink}</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-border/70 bg-background/80 px-6 py-4 sm:px-8">
          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr_auto] lg:items-center">
            <div className="space-y-1">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {copy.statusStripTitle}
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                {copy.statusStripBody}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs leading-6 text-muted-foreground">
              <span className="surface-chip rounded-full border px-3 py-1.5">
                {copy.reviewDeskTitle}
              </span>
              <span className="surface-chip rounded-full border px-3 py-1.5">
                {copy.decisionSplitTitle}
              </span>
              <span className="surface-chip rounded-full border px-3 py-1.5">
                {copy.pauseTitle}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 justify-self-start lg:justify-self-end">
              <Button
                type="button"
                size="sm"
                className="gap-2"
                data-testid="create-draft-trigger"
                aria-label={copy.newDraft}
                onClick={(event) =>
                  openDialogForContext("draft", undefined, event.currentTarget)
                }
              >
                <Rocket className="h-4 w-4" aria-hidden="true" />
                {copy.newDraft}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="gap-2"
                data-testid="refresh-workbench"
                aria-label={copy.refresh}
                disabled={viewState === "loading"}
              >
                <RefreshCw
                  className={`h-4 w-4 ${viewState === "loading" ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {viewState === "loading" ? copy.refreshing : copy.refresh}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-border/70 bg-background/70 px-6 py-5 sm:grid-cols-2 sm:px-8 xl:grid-cols-3">
          <Card data-testid="summary-active">
            <CardHeader className="pb-3">
              <CardDescription>{copy.activeWork}</CardDescription>
              <p
                aria-label={`${copy.activeWork} count`}
                className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                {activeCount}
              </p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {copy.activeWorkBody(tabMeta.label)}
            </CardContent>
          </Card>
          <Card data-testid="summary-blocked">
            <CardHeader className="pb-3">
              <CardDescription>{copy.blocked}</CardDescription>
              <p
                aria-label={`${copy.blocked} count`}
                className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                {blockedCount}
              </p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {copy.blockedBody}
            </CardContent>
          </Card>
          <Card data-testid="summary-complete">
            <CardHeader className="pb-3">
              <CardDescription>{copy.completed}</CardDescription>
              <p
                aria-label={`${copy.completed} count`}
                className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
              >
                {doneCount}
              </p>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {copy.completedBody}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 px-6 py-6 sm:px-8">
          <Card data-testid="desk-signals">
            <CardHeader className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                {copy.stanceTitle}
              </h2>
              <CardDescription>{copy.stanceBody}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-3">
              {copy.stanceCards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-xl border border-border/70 bg-background/80 p-4 text-sm leading-7 text-muted-foreground"
                >
                  <p className="font-medium text-foreground">{card.title}</p>
                  <p className="mt-2">{card.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="text-xl font-semibold tracking-tight text-foreground">
                  {copy.commandBarTitle}
                </div>
                <p className="text-sm text-muted-foreground">
                  {copy.commandBarBody}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePreviewRecoveryState}
                  data-testid="simulate-error"
                  aria-label={copy.previewRecovery}
                >
                  {copy.previewRecovery}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleReset}
                  data-testid="reset-filters"
                  aria-label={copy.reset}
                >
                  {copy.reset}
                </Button>
              </div>
            </div>

            <div
              className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
              data-testid="command-bar"
            >
              <div className="grid gap-2">
                <Label htmlFor="workspace-search">{copy.searchLabel}</Label>
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
                    placeholder={copy.searchPlaceholder}
                    className="pl-9 pr-10"
                    aria-controls="workbench-results-region"
                    data-testid="search-input"
                  />
                  <button
                    type="button"
                    className={`absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground transition-opacity duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${query.length > 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    aria-label={copy.clearSearch}
                    data-testid="search-clear"
                    disabled={query.length === 0}
                    onClick={handleClearQuery}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label id="status-filter-label">{copy.filterLabel}</Label>
                <RadioGroup
                  value={statusFilter}
                  onValueChange={(value: string) =>
                    setStatusFilter(value as StatusFilter)
                  }
                  className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
                  aria-labelledby="status-filter-label"
                  data-testid="status-filter-group"
                >
                  {copy.filterOptions.map((option) => (
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
            onValueChange={(value: string) =>
              setActiveTab(value as WorkspaceTab)
            }
            className="space-y-4"
            data-testid="workspace-tabs"
          >
            <span
              className="sr-only"
              aria-live="polite"
              data-testid="results-announcer"
            >
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
                  aria-label={copy.scrollTabsLeft}
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
                  aria-label={copy.scrollTabsRight}
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
                aria-label={copy.scrollableTabListLabel}
                className="overflow-x-auto rounded-xl"
                data-testid="workbench-tab-scroll-region"
                onFocusCapture={handleTabScrollFocus}
                onKeyDown={handleTabScrollKeyDown}
              >
                <TabsList
                  id="workbench-tablist"
                  aria-label={copy.tabsAriaLabel}
                  className="whitespace-nowrap px-2 py-3 pb-4"
                >
                  <TabsTrigger
                    value="pipeline"
                    data-testid="tab-pipeline"
                    aria-label={`${copy.tabCopy.pipeline.label}, ${tabVisibleCounts.pipeline} ${copy.tabItemsUnit}`}
                    onFocus={handleTabScrollFocus}
                  >
                    <span className="inline-flex items-center gap-2">
                      {copy.tabCopy.pipeline.label}
                      <Badge
                        variant="secondary"
                        data-testid="tab-count-pipeline"
                        aria-hidden="true"
                      >
                        {tabVisibleCounts.pipeline}
                      </Badge>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="review"
                    data-testid="tab-review"
                    aria-label={`${copy.tabCopy.review.label}, ${tabVisibleCounts.review} ${copy.tabItemsUnit}`}
                    onFocus={handleTabScrollFocus}
                  >
                    <span className="inline-flex items-center gap-2">
                      {copy.tabCopy.review.label}
                      <Badge
                        variant="secondary"
                        data-testid="tab-count-review"
                        aria-hidden="true"
                      >
                        {tabVisibleCounts.review}
                      </Badge>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="release"
                    data-testid="tab-release"
                    aria-label={`${copy.tabCopy.release.label}, ${tabVisibleCounts.release} ${copy.tabItemsUnit}`}
                    onFocus={handleTabScrollFocus}
                  >
                    <span className="inline-flex items-center gap-2">
                      {copy.tabCopy.release.label}
                      <Badge
                        variant="secondary"
                        data-testid="tab-count-release"
                        aria-hidden="true"
                      >
                        {tabVisibleCounts.release}
                      </Badge>
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent
              value={activeTab}
              className="space-y-4"
              data-testid={`panel-${activeTab}`}
            >
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{tabMeta.label}</Badge>
                      <Badge variant="secondary" className="surface-chip">
                        {copy.exampleQueueLabel}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {copy.laneVisible(tabItems.length)}
                      </span>
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {tabMeta.label}
                    </h2>
                    <CardDescription>{tabMeta.subtitle}</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid={`cta-${activeTab}`}
                    onClick={(event) =>
                      openDialogForContext(
                        activeTab,
                        undefined,
                        event.currentTarget,
                      )
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
                    <p className="sr-only">{copy.loadingAnnouncement}</p>
                    {[0, 1, 2, 3].map((index) => (
                      <Card key={index}>
                        <CardHeader className="space-y-3">
                          <Skeleton className="h-4 w-24" aria-hidden="true" />
                          <Skeleton className="h-7 w-2/3" aria-hidden="true" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <Skeleton className="h-4 w-full" aria-hidden="true" />
                          <Skeleton className="h-4 w-5/6" aria-hidden="true" />
                          <Skeleton
                            className="h-10 w-full"
                            aria-hidden="true"
                          />
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
                        <AlertTriangle
                          className="h-5 w-5 text-destructive"
                          aria-hidden="true"
                        />
                        <div className="space-y-1">
                          <CardTitle className="text-xl">
                            {copy.errorTitle}
                          </CardTitle>
                          <CardDescription>{copy.errorBody}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="gap-3">
                      <Button
                        type="button"
                        onClick={handleRefresh}
                        data-testid="retry-refresh"
                        aria-label={copy.retryRefresh}
                      >
                        {copy.retryRefresh}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                        aria-label={copy.resetState}
                      >
                        {copy.resetState}
                      </Button>
                    </CardFooter>
                  </Card>
                ) : null}

                {viewState !== "loading" &&
                viewState !== "error" &&
                tabItems.length === 0 ? (
                  <Card
                    role="status"
                    aria-live="polite"
                    data-testid="empty-state"
                  >
                    <CardHeader>
                      <CardTitle className="text-xl">
                        {copy.emptyTitle}
                      </CardTitle>
                      <CardDescription>
                        {hasActiveFilters
                          ? copy.emptyBodyFiltered
                          : copy.emptyBodyLane(tabMeta.label)}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter>
                      {hasActiveFilters ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleReset}
                          aria-label={copy.reset}
                        >
                          {copy.reset}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(event) =>
                            openDialogForContext(
                              activeTab,
                              undefined,
                              event.currentTarget,
                            )
                          }
                        >
                          {tabMeta.cta}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ) : null}

                {viewState !== "loading" &&
                viewState !== "error" &&
                tabItems.length > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
                    <div
                      className="grid gap-4"
                      role="list"
                      aria-label={copy.workItemsAriaLabel(tabMeta.label)}
                      data-testid="work-item-list"
                    >
                      {tabItems.map((item) => (
                        <Card
                          key={item.id}
                          role="listitem"
                          data-testid={`work-item-${item.id}`}
                        >
                          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={getStatusVariant(item.status)}>
                                  {copy.statusLabels[item.status]}
                                </Badge>
                                <Badge variant="outline">{item.priority}</Badge>
                                <span className="text-sm text-muted-foreground">
                                  {item.stage}
                                </span>
                              </div>
                              <h3 className="text-xl font-semibold leading-none tracking-tight">
                                {item.name}
                              </h3>
                              <CardDescription>{item.summary}</CardDescription>
                            </div>
                            <div className="text-right text-sm text-muted-foreground">
                              <p>{item.owner}</p>
                              <p>{item.due}</p>
                            </div>
                          </CardHeader>
                          <CardFooter className="flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
                            <p className="text-sm text-muted-foreground">
                              {copy.workItemStableIdentifiers}{" "}
                              <span className="font-medium text-foreground">
                                {item.id}
                              </span>
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
                          <h3 className="text-xl font-semibold tracking-tight">
                            {copy.launchControlsTitle}
                          </h3>
                          <CardDescription>
                            {copy.launchControlsBody}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-muted-foreground">
                          <div
                            className="rounded-xl border border-border bg-background p-4"
                            data-testid="operator-focus-card"
                          >
                            <p className="font-medium text-foreground">
                              {copy.currentFocusTitle}
                            </p>
                            {leadVisibleItem ? (
                              <>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant={getStatusVariant(
                                      leadVisibleItem.status,
                                    )}
                                  >
                                    {copy.statusLabels[leadVisibleItem.status]}
                                  </Badge>
                                  <span className="font-medium text-foreground">
                                    {leadVisibleItem.name}
                                  </span>
                                </div>
                                <p className="mt-2">
                                  {copy.currentFocusMeta(
                                    copy.statusLabels[leadVisibleItem.status],
                                    leadVisibleItem.owner,
                                    leadVisibleItem.stage,
                                  )}
                                </p>
                                <p className="mt-2">
                                  {leadVisibleItem.summary}
                                </p>
                              </>
                            ) : (
                              <p className="mt-2">{copy.currentFocusEmpty}</p>
                            )}
                          </div>
                          <div
                            className="rounded-xl border border-border bg-background p-4"
                            data-testid="next-action-card"
                          >
                            <p className="font-medium text-foreground">
                              {copy.nextBestAction}
                            </p>
                            <p className="mt-2">{nextActionGuidance}</p>
                            <p className="mt-2 text-xs text-muted-foreground/90">
                              {promotionDescription}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border bg-background p-4">
                            <p className="font-medium text-foreground">
                              {copy.proofSignal}
                            </p>
                            <p className="mt-2">{copy.proofSignalBody}</p>
                          </div>
                          <div
                            className="rounded-xl border border-border bg-background p-4"
                            data-testid="pause-card"
                          >
                            <p className="font-medium text-foreground">
                              {copy.pauseTitle}
                            </p>
                            <p className="mt-2">{copy.pauseBody}</p>
                            <div className="mt-4 rounded-xl border border-border/70 bg-card/80 p-3">
                              <p className="font-medium text-foreground">
                                {copy.proofDeskShortcutTitle}
                              </p>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {copy.proofDeskShortcutBody}
                              </p>
                            </div>
                            <div className="pt-3">
                              <Button asChild size="sm" variant="outline">
                                <Link href="/proof">
                                  {copy.proofDeskShortcutCta}
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                        <CardFooter className="gap-3">
                          <Button
                            type="button"
                            className="gap-2"
                            data-testid="primary-cta"
                            aria-label={
                              hasActiveFilters
                                ? copy.promoteTopPriorityFiltered
                                : copy.promoteTopPriority
                            }
                            onClick={(event) => {
                              const promotedItem = tabItems[0];
                              openDialogForContext(
                                "priority",
                                promotedItem
                                  ? hasActiveFilters
                                    ? `${copy.promoteTopPriorityFiltered}: ${promotedItem.name}.`
                                    : `${copy.promoteTopPriority}: ${promotedItem.name}.`
                                  : hasActiveFilters
                                    ? copy.priorityDraftPromptFiltered
                                    : copy.priorityDraftPrompt,
                                event.currentTarget,
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
                            aria-label={copy.checkSignals}
                            data-testid="refresh-signals"
                            onClick={handleCheckSignals}
                          >
                            <ShieldCheck
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            {copy.checkSignals}
                          </Button>
                        </CardFooter>
                      </Card>
                      <Card data-testid="review-desk">
                        <CardHeader>
                          <h3 className="text-xl font-semibold tracking-tight">
                            {copy.reviewDeskTitle}
                          </h3>
                          <CardDescription>
                            {copy.reviewDeskBody}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
                          {copy.reviewDeskCards.map((card) => (
                            <div
                              key={card.title}
                              className="rounded-xl border border-border bg-background p-4"
                            >
                              <p className="font-medium text-foreground">
                                {card.title}
                              </p>
                              <p className="mt-2">{card.body}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                      <Card data-testid="decision-split">
                        <CardHeader>
                          <h3 className="text-xl font-semibold tracking-tight">
                            {copy.decisionSplitTitle}
                          </h3>
                          <CardDescription>
                            {copy.decisionSplitBody}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
                          {copy.decisionSplitCards.map((card) => (
                            <div
                              key={card.title}
                              className="rounded-xl border border-border bg-background p-4"
                            >
                              <p className="font-medium text-foreground">
                                {card.title}
                              </p>
                              <p className="mt-2">{card.body}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                      <Card data-testid="operator-guide">
                        <CardHeader>
                          <h3 className="text-xl font-semibold tracking-tight">
                            {copy.operatorGuideTitle}
                          </h3>
                          <CardDescription>
                            {copy.operatorGuideBody}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ol className="grid gap-3 text-sm leading-7 text-muted-foreground">
                            {copy.operatorGuideSteps.map((step) => (
                              <li
                                key={step.title}
                                className="rounded-xl border border-border bg-background px-4 py-3"
                              >
                                <p className="font-medium text-foreground">
                                  {step.title}
                                </p>
                                <p className="mt-2">{step.body}</p>
                              </li>
                            ))}
                          </ol>
                        </CardContent>
                      </Card>
                      <Card data-testid="lane-contract">
                        <CardHeader>
                          <h3 className="text-xl font-semibold tracking-tight">
                            {copy.laneContractTitle}
                          </h3>
                          <CardDescription>
                            {copy.laneContractBody}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm leading-7 text-muted-foreground">
                          {copy.laneContracts.map((card) => (
                            <div
                              key={card.title}
                              className="rounded-xl border border-border bg-background p-4"
                            >
                              <p className="font-medium text-foreground">
                                {card.title}
                              </p>
                              <p className="mt-2">{card.body}</p>
                            </div>
                          ))}
                        </CardContent>
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
        dismissLabel={copy.dismissSuccessLabel}
        message={successMessage}
        onDismiss={handleDismissSuccess}
        open={viewState === "success"}
        title={copy.successToastTitle}
      />
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          data-testid="create-draft-dialog"
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
            <DialogTitle>{copy.dialogCopy[dialogContext].title}</DialogTitle>
            <DialogDescription>
              {copy.dialogCopy[dialogContext].description}
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-5" onSubmit={handleCreateDraft}>
            <div className="grid gap-2">
              <Label htmlFor="draft-prompt">{copy.dialogPromptLabel}</Label>
              <Textarea
                id="draft-prompt"
                value={draftPrompt}
                onChange={(event) => {
                  const nextPrompt = event.target.value;
                  setDraftPrompt(nextPrompt);
                  if (
                    draftPromptError &&
                    nextPrompt.trim().length >= MIN_DRAFT_PROMPT_LENGTH
                  ) {
                    setDraftPromptError(null);
                  }
                }}
                placeholder={copy.dialogPromptPlaceholder}
                rows={4}
                aria-invalid={draftPromptError ? "true" : undefined}
                aria-describedby={draftPromptDescribedBy}
                data-testid="draft-prompt-input"
              />
              <p
                id={draftPromptHintId}
                className="text-xs text-muted-foreground"
              >
                {copy.dialogPromptHint(
                  draftPromptCharacterCount,
                  MIN_DRAFT_PROMPT_LENGTH,
                )}
              </p>
              {draftPromptError ? (
                <p id={draftPromptErrorId} className="text-xs text-destructive">
                  {draftPromptError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3">
              <Label id="draft-surface-label">{copy.dialogSurfaceLabel}</Label>
              <RadioGroup
                value={draftKind}
                onValueChange={(value: string) =>
                  setDraftKind(value as DraftKind)
                }
                className="gap-3"
                aria-labelledby="draft-surface-label"
                data-testid="draft-surface-group"
              >
                {copy.draftOptions.map((option) => (
                  <RadioCardItem
                    key={option.value}
                    value={option.value}
                    id={`draft-${option.value}`}
                    data-testid={`draft-option-${option.value}`}
                  >
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </RadioCardItem>
                ))}
              </RadioGroup>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
              >
                {copy.dialogCancel}
              </Button>
              <Button
                type="submit"
                data-testid="create-draft-submit"
                aria-label={copy.dialogQueue}
              >
                {copy.dialogQueue}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
