export type WorkspaceTab = "pipeline" | "review" | "release";
export type StatusFilter = "all" | "active" | "blocked" | "done";
export type ViewState = "ready" | "loading" | "error" | "success";
export type DraftKind = "landing" | "dashboard" | "checkout";
export type DialogContext = "draft" | "pipeline" | "review" | "release" | "priority";

export type WorkItem = {
  id: string;
  name: string;
  tab: WorkspaceTab;
  owner: string;
  stage: string;
  status: Exclude<StatusFilter, "all">;
  priority: "P0" | "P1" | "P2";
  due: string;
  summary: string;
  cta: string;
};

export const WORK_ITEMS: WorkItem[] = [
  {
    id: "brief-129",
    name: "AI Landing Revamp",
    tab: "pipeline",
    owner: "Lena",
    stage: "Prompt to wireframe",
    status: "active",
    priority: "P0",
    due: "Today · 16:00",
    summary: "Merge hero direction, pricing proof and mobile nav into one reviewable concept.",
    cta: "Continue briefing"
  },
  {
    id: "flow-301",
    name: "Workspace Search Patterns",
    tab: "pipeline",
    owner: "Noah",
    stage: "Spec alignment",
    status: "blocked",
    priority: "P1",
    due: "Tomorrow · 10:30",
    summary: "Waiting for taxonomy mapping before generating the final search/filter interaction set.",
    cta: "Resolve blocker"
  },
  {
    id: "qa-412",
    name: "Design QA Sprint",
    tab: "review",
    owner: "Mia",
    stage: "Accessibility pass",
    status: "active",
    priority: "P1",
    due: "Today · 18:20",
    summary: "Validate keyboard paths, error copy and empty states across the new dashboard views.",
    cta: "Open audit"
  },
  {
    id: "copy-120",
    name: "Success State Messaging",
    tab: "review",
    owner: "Ava",
    stage: "Microcopy approval",
    status: "done",
    priority: "P2",
    due: "Completed · 11:45",
    summary: "Finalized CTA language and approval notes for publish-ready success banners.",
    cta: "View notes"
  },
  {
    id: "ship-903",
    name: "Release Candidate 4",
    tab: "release",
    owner: "Kai",
    stage: "Gate verification",
    status: "active",
    priority: "P0",
    due: "Tomorrow · 09:00",
    summary: "Run smoke, visual QA and live prompt checks before pushing the latest workbench updates.",
    cta: "Run release gates"
  },
  {
    id: "ops-204",
    name: "Rollback Checklist",
    tab: "release",
    owner: "Iris",
    stage: "Ops readiness",
    status: "done",
    priority: "P1",
    due: "Completed · Yesterday",
    summary: "Verified environment notes, fallback routes and production ownership for launch day.",
    cta: "Review plan"
  }
];

export const TAB_COPY: Record<WorkspaceTab, { label: string; subtitle: string; cta: string }> = {
  pipeline: {
    label: "Pipeline",
    subtitle: "Shape prompts, briefs and generation scopes before they hit review.",
    cta: "Create brief"
  },
  review: {
    label: "Review",
    subtitle: "Keep QA, microcopy and interaction polish moving in one visible lane.",
    cta: "Start audit"
  },
  release: {
    label: "Release",
    subtitle: "Track gates, publish readiness and launch follow-ups without leaving the workbench.",
    cta: "Run release gates"
  }
};

export const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" }
];

export const DRAFT_OPTIONS: Array<{ value: DraftKind; label: string; hint: string }> = [
  { value: "landing", label: "Landing page", hint: "Hero, proof, CTA and narrative flow." },
  { value: "dashboard", label: "Dashboard", hint: "Metrics, tables, states and power-user controls." },
  { value: "checkout", label: "Checkout", hint: "High-trust payment, validation and success flows." }
];

export const DIALOG_COPY: Record<DialogContext, { title: string; description: string; prompt: string; kind: DraftKind }> = {
  draft: {
    title: "Create a launch-ready UI brief",
    description: "Package a new request with a clear surface area so review and release can start faster.",
    prompt: "Build an executive workbench with search, tabs, dialog and complete state coverage.",
    kind: "dashboard"
  },
  pipeline: {
    title: "Create a pipeline brief",
    description: "Turn the current pipeline lane into a structured generation brief with clear deliverables.",
    prompt: "Draft a production-ready pipeline brief with prompt goals, state coverage and ship criteria.",
    kind: "dashboard"
  },
  review: {
    title: "Start a review audit",
    description: "Launch a focused audit plan for copy, accessibility and interaction polish in the current lane.",
    prompt: "Create a review audit checklist covering accessibility, copy and interaction edge cases.",
    kind: "dashboard"
  },
  release: {
    title: "Run release gate prep",
    description: "Prepare a release-oriented brief that validates smoke, visual QA and rollout readiness.",
    prompt: "Build a release gate brief with smoke coverage, rollback notes and final visual checks.",
    kind: "checkout"
  },
  priority: {
    title: "Promote the top-priority task",
    description: "Convert the current highest-priority item into a polished launch brief without losing context.",
    prompt: "Promote the current top-priority task into a launch-ready brief.",
    kind: "dashboard"
  }
};

export function getStatusVariant(status: WorkItem["status"]): "default" | "secondary" | "success" | "destructive" | "outline" {
  if (status === "blocked") {
    return "destructive";
  }

  if (status === "done") {
    return "success";
  }

  return "default";
}
