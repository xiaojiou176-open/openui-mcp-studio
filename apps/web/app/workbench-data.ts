import type { AppLocale } from "@/lib/i18n/config";

export type WorkspaceTab = "pipeline" | "review" | "release";
export type StatusFilter = "all" | "active" | "blocked" | "done";
export type ViewState = "ready" | "loading" | "error" | "success";
export type DraftKind = "landing" | "dashboard" | "checkout";
export type DialogContext =
  | "draft"
  | "pipeline"
  | "review"
  | "release"
  | "priority";

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

type WorkbenchCopy = {
  localeLabel: string;
  localeNames: Record<AppLocale, string>;
  badge: string;
  workspaceHealthy: string;
  pageTitle: string;
  pageDescription: string;
  exampleQueueLabel: string;
  statusStripTitle: string;
  statusStripBody: string;
  laneSignal: string;
  primitiveSignal: string;
  proofDeskLink: string;
  stanceTitle: string;
  stanceBody: string;
  stanceCards: Array<{ title: string; body: string }>;
  statusLabels: Record<Exclude<StatusFilter, "all">, string>;
  newDraft: string;
  refresh: string;
  refreshing: string;
  activeWork: string;
  activeWorkBody: (laneLabel: string) => string;
  blocked: string;
  blockedBody: string;
  completed: string;
  completedBody: string;
  commandBarTitle: string;
  commandBarBody: string;
  previewRecovery: string;
  reset: string;
  searchLabel: string;
  searchPlaceholder: string;
  clearSearch: string;
  filterLabel: string;
  filterOptions: Array<{ value: StatusFilter; label: string }>;
  resultsAnnouncement: (count: number, laneLabel: string) => string;
  laneVisible: (count: number) => string;
  ownerLabel: string;
  stageLabel: string;
  artifactBriefSuffix: string;
  promoteTopPriority: string;
  promoteTopPriorityFiltered: string;
  priorityDraftPrompt: string;
  priorityDraftPromptFiltered: string;
  promoteDescription: string;
  promoteDescriptionFiltered: string;
  refreshSuccess: (laneLabel: string) => string;
  dialogPromptError: (minLength: number) => string;
  draftQueued: (label: string) => string;
  emptyTitle: string;
  emptyBodyFiltered: string;
  emptyBodyLane: (laneLabel: string) => string;
  workItemStableIdentifiers: string;
  launchControlsTitle: string;
  launchControlsBody: string;
  currentFocusTitle: string;
  currentFocusMeta: (
    statusLabel: string,
    owner: string,
    stage: string,
  ) => string;
  currentFocusEmpty: string;
  nextBestAction: string;
  nextActionGuidance: Record<Exclude<StatusFilter, "all"> | "empty", string>;
  proofSignal: string;
  proofSignalBody: string;
  checkSignals: string;
  reviewDeskTitle: string;
  reviewDeskBody: string;
  reviewDeskCards: Array<{ title: string; body: string }>;
  decisionSplitTitle: string;
  decisionSplitBody: string;
  decisionSplitCards: Array<{ title: string; body: string }>;
  laneContractTitle: string;
  laneContractBody: string;
  laneContracts: Array<{ title: string; body: string }>;
  operatorGuideTitle: string;
  operatorGuideBody: string;
  operatorGuideSteps: Array<{ title: string; body: string }>;
  pauseTitle: string;
  pauseBody: string;
  proofDeskShortcutTitle: string;
  proofDeskShortcutBody: string;
  proofDeskShortcutCta: string;
  successToastTitle: string;
  dismissSuccessLabel: string;
  loadingAnnouncement: string;
  errorTitle: string;
  errorBody: string;
  retryRefresh: string;
  resetState: string;
  dialogPromptLabel: string;
  dialogPromptPlaceholder: string;
  dialogPromptHint: (count: number, minLength: number) => string;
  dialogSurfaceLabel: string;
  dialogCancel: string;
  dialogQueue: string;
  scrollableTabListLabel: string;
  scrollTabsLeft: string;
  scrollTabsRight: string;
  tabsAriaLabel: string;
  tabItemsUnit: string;
  workItemsAriaLabel: (laneLabel: string) => string;
  draftOptions: Array<{ value: DraftKind; label: string; hint: string }>;
  dialogCopy: Record<
    DialogContext,
    { title: string; description: string; prompt: string; kind: DraftKind }
  >;
  tabCopy: Record<
    WorkspaceTab,
    { label: string; subtitle: string; cta: string }
  >;
  workItems: WorkItem[];
};

const WORK_ITEMS_EN: WorkItem[] = [
  {
    id: "brief-129",
    name: "Starter bundle truth sync",
    tab: "pipeline",
    owner: "Lena",
    stage: "Install + proof routing",
    status: "active",
    priority: "P0",
    due: "Today · 16:00",
    summary:
      "Align frontdoor hierarchy, install-ready bundle copy, and proof-first routing into one reviewable packet.",
    cta: "Continue packet",
  },
  {
    id: "flow-301",
    name: "OpenClaw public-ready shelf",
    tab: "pipeline",
    owner: "Noah",
    stage: "Discovery + proof shelf",
    status: "active",
    priority: "P1",
    due: "Tomorrow · 10:30",
    summary:
      "Keep the OpenClaw bundle discoverable and proofable without sliding back into bridge-only or overclaim wording.",
    cta: "Open bundle",
  },
  {
    id: "qa-412",
    name: "Plugin-grade package overclaim audit",
    tab: "review",
    owner: "Mia",
    stage: "Proof + wording pass",
    status: "active",
    priority: "P1",
    due: "Today · 18:20",
    summary:
      "Validate install-ready package claims, public-ready OpenClaw wording, and proof routing across the front door and proof desk.",
    cta: "Open audit",
  },
  {
    id: "copy-120",
    name: "SDK / hosted supporting-lane wording",
    tab: "review",
    owner: "Ava",
    stage: "Supporting-lane approval",
    status: "done",
    priority: "P2",
    due: "Completed · 11:45",
    summary:
      "Finalized wording that keeps SDK and hosted truthful, retained, and out of the front-stage public-distribution story.",
    cta: "View notes",
  },
  {
    id: "ship-903",
    name: "Public distribution proof shelf",
    tab: "release",
    owner: "Kai",
    stage: "Gate verification",
    status: "active",
    priority: "P0",
    due: "Tomorrow · 09:00",
    summary:
      "Run starter bundle, release-safe, and live proof checks before promoting the latest repo-owned public distribution surfaces.",
    cta: "Run release gates",
  },
  {
    id: "ops-204",
    name: "Browser lane and truth landing",
    tab: "release",
    owner: "Iris",
    stage: "Landed readback",
    status: "done",
    priority: "P1",
    due: "Completed · Yesterday",
    summary:
      "Captured the landed browser/runtime closeout and the public-truth boundary before this distribution upgrade wave.",
    cta: "Review ledger",
  },
];

const WORK_ITEMS_ZH: WorkItem[] = [
  {
    id: "brief-129",
    name: "Starter bundle 真相同步",
    tab: "pipeline",
    owner: "Lena",
    stage: "安装 + 证据路由",
    status: "active",
    priority: "P0",
    due: "今天 · 16:00",
    summary:
      "把前门层级、starter bundle 文案和证据优先路线收成一份可审查交付包。",
    cta: "继续推进交付包",
  },
  {
    id: "flow-301",
    name: "OpenClaw public-ready 货架",
    tab: "pipeline",
    owner: "Noah",
    stage: "发现面 + 证明面",
    status: "active",
    priority: "P1",
    due: "明天 · 10:30",
    summary:
      "保持 OpenClaw bundle 可发现、可 proof，但不滑回 bridge-only 或 overclaim 文案。",
    cta: "打开 bundle",
  },
  {
    id: "qa-412",
    name: "插件级分发包过度宣称审查",
    tab: "review",
    owner: "Mia",
    stage: "证明 + 文案复核",
    status: "active",
    priority: "P1",
    due: "今天 · 18:20",
    summary:
      "检查 install-ready package、OpenClaw public-ready 和证据路线有没有继续保持诚实清楚。",
    cta: "打开审查",
  },
  {
    id: "copy-120",
    name: "SDK / hosted supporting lane 文案",
    tab: "review",
    owner: "Ava",
    stage: "Supporting lane 批准",
    status: "done",
    priority: "P2",
    due: "已完成 · 11:45",
    summary:
      "已经确认 SDK 和 hosted 仍保留 proof，但不再占据当前 public-distribution 主舞台。",
    cta: "查看说明",
  },
  {
    id: "ship-903",
    name: "公开分发证明货架",
    tab: "release",
    owner: "Kai",
    stage: "门禁验证",
    status: "active",
    priority: "P0",
    due: "明天 · 09:00",
    summary:
      "在提升最新公开分发表面之前，先跑 starter bundle、release-safe 和 live proof 这组门禁。",
    cta: "运行发布门禁",
  },
  {
    id: "ops-204",
    name: "浏览器线与真相落地",
    tab: "release",
    owner: "Iris",
    stage: "落地回读",
    status: "done",
    priority: "P1",
    due: "已完成 · 昨天",
    summary:
      "已经记下 browser/runtime 收口已 landed，以及这轮 public distribution 提升要继承的 truth 边界。",
    cta: "查看账本",
  },
];

function buildEnglishCopy(): WorkbenchCopy {
  return {
    localeLabel: "Language",
    localeNames: {
      "en-US": "EN",
      "zh-CN": "中文",
    },
    badge: "Operator desk",
    workspaceHealthy:
      "Signals synced. The next reviewable packet is ready for an operator call.",
    pageTitle:
      "Run the next UI/UX delivery decision with proof still attached.",
    pageDescription:
      "A repo-local simulated operator desk that keeps repo-owned proof, reviewer judgment, and the next release move visible before the lane turns into Git landing work.",
    exampleQueueLabel: "Repo-native example queue",
    statusStripTitle: "Desk status strip",
    statusStripBody:
      "Read this strip like the lights above a service counter: it tells you what is moving, what is blocked, and whether you are still looking at a repo-local simulated operator surface.",
    laneSignal: "3 live decision lanes",
    primitiveSignal: "Repo-owned proof stays in view",
    proofDeskLink: "Open the proof desk",
    stanceTitle: "How to read this desk in 15 seconds",
    stanceBody:
      "Treat the workbench like a decision-and-execution surface: first sort the proof, then decide the human call, then move only the right packet.",
    stanceCards: [
      {
        title: "Already proved here",
        body: "Current focus, lane status, and the latest proof signal already live on this repo-owned surface.",
      },
      {
        title: "Still needs a human call",
        body: "Shared-surface polish, release confidence, and Git landing still belong to a reviewer or operator.",
      },
      {
        title: "Next move",
        body: "Refresh proof, choose one packet, and move only when the lane signal and the evidence still agree.",
      },
    ],
    statusLabels: {
      active: "In review",
      blocked: "Needs decision",
      done: "Ready to hand off",
    },
    newDraft: "New draft",
    refresh: "Refresh",
    refreshing: "Refreshing",
    activeWork: "Reviewable now",
    activeWorkBody: (laneLabel) =>
      `Packets currently moving through the ${laneLabel.toLowerCase()} lane.`,
    blocked: "Needs a decision",
    blockedBody:
      "These items are waiting on a blocker call before the lane can move.",
    completed: "Ready to hand off",
    completedBody:
      "Recently finished results that a reviewer or operator can reuse downstream.",
    commandBarTitle: "Command bar",
    commandBarBody:
      "Search the queue, isolate the next decision, and jump back into the next reviewable packet without losing the proof story.",
    previewRecovery: "Preview recovery",
    reset: "Reset",
    searchLabel: "Search",
    searchPlaceholder: "Search briefs, owners or review notes",
    clearSearch: "Clear search query",
    filterLabel: "Filter",
    filterOptions: [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "blocked", label: "Blocked" },
      { value: "done", label: "Done" },
    ],
    resultsAnnouncement: (count, laneLabel) =>
      `${count} results in the ${laneLabel.toLowerCase()} lane.`,
    laneVisible: (count) => `${count} visible`,
    ownerLabel: "Owner",
    stageLabel: "Stage",
    artifactBriefSuffix:
      "Build the next reviewable artifact with explicit QA, acceptance, and release criteria.",
    promoteTopPriority: "Promote next operator packet",
    promoteTopPriorityFiltered: "Promote next visible packet",
    priorityDraftPrompt:
      "Promote the current top-priority task into a review-ready packet.",
    priorityDraftPromptFiltered:
      "Promote the current top-priority task from the filtered results into a review-ready packet.",
    promoteDescription:
      "Promote the highest-priority item into the next reviewable artifact bundle for the team.",
    promoteDescriptionFiltered:
      "Filters are active. Promotion uses the top-priority task in the current visible results.",
    refreshSuccess: (laneLabel) =>
      `Proof and review signals refreshed for the ${laneLabel.toLowerCase()} lane.`,
    dialogPromptError: (minLength) =>
      `Prompt must include at least ${minLength} characters.`,
    draftQueued: (label) => `Packet queued: ${label}.`,
    emptyTitle: "No work items match this view.",
    emptyBodyFiltered:
      "Try a broader search or reset the status filter to bring the full review queue back.",
    emptyBodyLane: (laneLabel) =>
      `The ${laneLabel.toLowerCase()} lane is clear right now. Open the next packet when a new brief is ready.`,
    workItemStableIdentifiers: "Stable identifiers:",
    launchControlsTitle: "Operator control rail",
    launchControlsBody:
      "Use the checkpoint strip first, then use this rail to promote the right packet, refresh signals, and keep repo-local readiness separate from Git landing.",
    currentFocusTitle: "Current focus",
    currentFocusMeta: (statusLabel, owner, stage) =>
      `Status: ${statusLabel}. Owner: ${owner}. Stage: ${stage}.`,
    currentFocusEmpty:
      "No visible packet is ready for operator follow-up in this lane right now.",
    nextBestAction: "Next operator move",
    nextActionGuidance: {
      active:
        "Open the current focus, run Check signals, then promote only when the fresh proof and review story still agrees. That is repo-local ready, not Git landed.",
      blocked:
        "Do not promote this lane yet. Clear the decision blocker or escalate to a human reviewer before moving the packet forward.",
      done: "Reuse the completed packet, hand it downstream, or move to release only if adjacent gates and proof signals are already green. Treat commit, push, and PR as a separate landing step.",
      empty:
        "Reset filters or queue a new brief instead of guessing the next move from stale board state.",
    },
    proofSignal: "Why this lane is trustworthy",
    proofSignalBody:
      "Keyboard paths, state coverage, and CTA labels are in repo-owned proof now. Use the pause card when the packet still needs a human release call.",
    checkSignals: "Check signals",
    reviewDeskTitle: "Review desk",
    reviewDeskBody:
      "Use this lane to separate repo-owned signal from the reviewer-owned call before trust goes up, and keep repo-local readiness distinct from Git landing.",
    reviewDeskCards: [
      {
        title: "Inspect the changed surface",
        body: "Look for which page, component, or shared path is actually moving before you trust the item label.",
      },
      {
        title: "Check copy, accessibility, and state risk",
        body: "A packet is not ready just because it renders. It should still survive microcopy, keyboard, and state-edge review.",
      },
      {
        title: "Escalate when the evidence disagrees",
        body: "If the brief, proof signal, lane status, and landing state point in different directions, stop and hand the item back for manual review.",
      },
    ],
    decisionSplitTitle:
      "What this lane already proves vs what still needs your call",
    decisionSplitBody:
      "Read this split before you promote the next packet so the operator desk stays honest about evidence, repo-local completion, and Git landing.",
    decisionSplitCards: [
      {
        title: "Already repo-proved in this lane",
        body: "The packet summary, lane status, proof signal, and most recent refresh state are already visible here without leaving the repo-owned surface.",
      },
      {
        title: "Still needs a human release, review, or landing decision",
        body: "Shared-surface polish, ship confidence, cross-lane tradeoffs, and the final commit/push/PR move still belong to a person even when the local packet looks green.",
      },
    ],
    laneContractTitle: "Lane contract and honesty notes",
    laneContractBody:
      "The workbench is a repo-local simulated operator desk. Treat each lane like a different queue at the same counter, and use the proof desk when you need the meaning before the action.",
    laneContracts: [
      {
        title: "Pipeline lane",
        body: "Best for locking prompt scope, target surfaces, and packet shape before generation or review starts. Not for claiming the packet is already approved.",
      },
      {
        title: "Review lane",
        body: "Best for copy, accessibility, state-edge, and shared-surface judgment. Not for skipping the human call just because a local packet looks green.",
      },
      {
        title: "Release lane",
        body: "Best for repo-local gate checks, handoff readiness, and pause rules. Not for pretending this desk is a live ops console or that Git landing already happened.",
      },
    ],
    operatorGuideTitle: "Operator guide",
    operatorGuideBody:
      "This workbench is for routing the next decision with evidence, not for making the board feel busier.",
    operatorGuideSteps: [
      {
        title: "Move only the packet that is reviewable now",
        body: "Open the top visible item only when the lane already has enough evidence to review, not because it happens to be first on the board.",
      },
      {
        title: "Refresh proof before you escalate or land the lane",
        body: "Run Check signals before a review, release-facing handoff, or Git landing step so the next operator inherits fresh proof instead of stale assumptions.",
      },
      {
        title: "Reset the board before you guess from stale state",
        body: "If the lane looks empty or oddly filtered, widen the search or reset the lane first instead of inventing the next move from memory.",
      },
    ],
    pauseTitle: "Pause and escalate when",
    pauseBody:
      "Stop here when repo-owned proof is stale, the item summary disagrees with the current lane, or the packet still needs a human release or landing decision before promotion.",
    proofDeskShortcutTitle: "Need the proof meaning first?",
    proofDeskShortcutBody:
      "Open the proof desk when you need to decide what the current signals actually prove before you move this packet forward.",
    proofDeskShortcutCta: "Open the proof desk",
    successToastTitle: "Proof signal updated",
    dismissSuccessLabel: "Dismiss success message",
    loadingAnnouncement: "Loading work items for the active lane.",
    errorTitle: "The workspace lost its latest sync.",
    errorBody:
      "We could not refresh the selected lane. Retry the request or reset the command bar.",
    retryRefresh: "Retry refresh",
    resetState: "Reset state",
    dialogPromptLabel: "Prompt",
    dialogPromptPlaceholder: "Describe the UI goal",
    dialogPromptHint: (count, minLength) =>
      `${count}/${minLength} minimum characters with the target user flow.`,
    dialogSurfaceLabel: "Surface",
    dialogCancel: "Cancel",
    dialogQueue: "Queue packet",
    scrollableTabListLabel: "Scrollable workbench tab list",
    scrollTabsLeft: "Scroll tabs left",
    scrollTabsRight: "Scroll tabs right",
    tabsAriaLabel: "Workbench lanes",
    tabItemsUnit: "items",
    workItemsAriaLabel: (laneLabel) => `${laneLabel} work items`,
    draftOptions: [
      {
        value: "landing",
        label: "Landing page",
        hint: "Hero, proof, CTA and narrative flow.",
      },
      {
        value: "dashboard",
        label: "Dashboard",
        hint: "Metrics, tables, states and power-user controls.",
      },
      {
        value: "checkout",
        label: "Checkout",
        hint: "High-trust payment, validation and success flows.",
      },
    ],
    dialogCopy: {
      draft: {
        title: "Create a launch-ready UI brief",
        description:
          "Package a new request with a clear surface area so review and release can start faster.",
        prompt:
          "Build an executive workbench with search, tabs, dialog and complete state coverage.",
        kind: "dashboard",
      },
      pipeline: {
        title: "Create a pipeline brief",
        description:
          "Turn the current pipeline lane into a structured generation brief with clear deliverables.",
        prompt:
          "Draft a production-ready pipeline brief with prompt goals, state coverage and ship criteria.",
        kind: "dashboard",
      },
      review: {
        title: "Start a review audit",
        description:
          "Launch a focused audit plan for copy, accessibility and interaction polish in the current lane.",
        prompt:
          "Create a review audit checklist covering accessibility, copy and interaction edge cases.",
        kind: "dashboard",
      },
      release: {
        title: "Run release gate prep",
        description:
          "Prepare a release-oriented brief that validates smoke, visual QA and rollout readiness.",
        prompt:
          "Build a release gate brief with smoke coverage, rollback notes and final visual checks.",
        kind: "checkout",
      },
      priority: {
        title: "Promote the top-priority task",
        description:
          "Convert the current highest-priority item into a polished launch brief without losing context.",
        prompt:
          "Promote the current top-priority task into a launch-ready brief.",
        kind: "dashboard",
      },
    },
    tabCopy: {
      pipeline: {
        label: "Pipeline",
        subtitle:
          "Lock the scope, target surfaces, and delivery shape before generation starts.",
        cta: "Open scope brief",
      },
      review: {
        label: "Review",
        subtitle:
          "Inspect copy, accessibility, state edges, and shared-surface risk before you let the packet move.",
        cta: "Open review packet",
      },
      release: {
        label: "Release",
        subtitle:
          "Confirm gates, proof, and handoff conditions before you let the release packet go.",
        cta: "Check release packet",
      },
    },
    workItems: WORK_ITEMS_EN,
  };
}

function buildChineseCopy(): WorkbenchCopy {
  return {
    localeLabel: "语言",
    localeNames: {
      "en-US": "EN",
      "zh-CN": "中文",
    },
    badge: "操盘工作台",
    workspaceHealthy: "信号已同步，下一份可审查包已经可以进入人工判断。",
    pageTitle: "带着证据推进下一次 UI/UX 交付判断。",
    pageDescription:
      "这是一个 repo-local simulated operator desk，把仓库已经证明的部分、仍要评审者拍板的部分，以及发布下一步放到同一处，而且不会把它们误说成已经通过 Git 落袋。",
    exampleQueueLabel: "仓库内语境示例队列",
    statusStripTitle: "工作台状态带",
    statusStripBody:
      "把这条状态带理解成柜台上方的指示灯：它先告诉你哪条泳道在动、哪里被卡住，以及你现在看的仍然只是 repo-local 的模拟操盘台。",
    laneSignal: "3 条实时决策泳道",
    primitiveSignal: "仓库内证据始终保持可见",
    proofDeskLink: "打开证据台",
    stanceTitle: "15 秒读懂这块工作台",
    stanceBody:
      "把它当成决策与执行台来看：先分清证据，再区分人工拍板，最后只推动真正该动的那一份包。",
    stanceCards: [
      {
        title: "这里已经证明的部分",
        body: "当前焦点、泳道状态，以及最近一次证据信号，都已经能在这块仓库自有界面上直接看清。",
      },
      {
        title: "仍然要人拍板的部分",
        body: "共享面打磨、发布信心，以及 Git 落袋动作，仍然应该交给评审者或操作者，而不是交给看板颜色。",
      },
      {
        title: "下一步动作",
        body: "先刷新证据，再只推进一份包；只有当泳道信号和证据仍然一致时，才继续往前推。",
      },
    ],
    statusLabels: {
      active: "进行中",
      blocked: "阻塞",
      done: "已完成",
    },
    newDraft: "新建草稿",
    refresh: "刷新",
    refreshing: "刷新中",
    activeWork: "当前可推进",
    activeWorkBody: (laneLabel) => `当前正在 ${laneLabel} 泳道里推进的评审包。`,
    blocked: "需要决策",
    blockedBody: "这些事项还缺一条明确决策，当前泳道才能继续前进。",
    completed: "可交接",
    completedBody: "最近完成、已经可以复用或向下游交接的结果。",
    commandBarTitle: "命令栏",
    commandBarBody:
      "搜索队列、隔离下一条关键判断，并且带着最新证据回到下一份可审查包。",
    previewRecovery: "预览恢复态",
    reset: "重置",
    searchLabel: "搜索",
    searchPlaceholder: "搜索需求包、负责人或评审备注",
    clearSearch: "清空搜索",
    filterLabel: "筛选",
    filterOptions: [
      { value: "all", label: "全部" },
      { value: "active", label: "进行中" },
      { value: "blocked", label: "阻塞" },
      { value: "done", label: "已完成" },
    ],
    resultsAnnouncement: (count, laneLabel) =>
      `${laneLabel} 当前有 ${count} 个可见事项。`,
    laneVisible: (count) => `可见 ${count} 条`,
    ownerLabel: "负责人",
    stageLabel: "阶段",
    artifactBriefSuffix: "为下一份产出补齐一套带明确 QA 与发布门槛的交付说明。",
    promoteTopPriority: "提升下一份操作包",
    promoteTopPriorityFiltered: "提升当前可见操作包",
    priorityDraftPrompt: "把当前最高优先级任务推进成一份可审查的操作包。",
    priorityDraftPromptFiltered:
      "把当前筛选结果里的最高优先级任务推进成一份可审查的操作包。",
    promoteDescription:
      "把当前最高优先级项目提升成一份可审查、可继续推进的操作包。",
    promoteDescriptionFiltered:
      "当前过滤器已生效。提升动作会使用当前可见结果里的最高优先级任务。",
    refreshSuccess: (laneLabel) =>
      `${laneLabel} 泳道的证据与评审信号已经刷新。`,
    dialogPromptError: (minLength) =>
      `输入内容至少要包含 ${minLength} 个字符。`,
    draftQueued: (label) => `操作包已排队：${label}。`,
    emptyTitle: "当前视图没有匹配的工作项。",
    emptyBodyFiltered:
      "可以扩大搜索范围，或者重置状态筛选，让完整评审队列回来。",
    emptyBodyLane: (laneLabel) =>
      `${laneLabel} 泳道目前是空的。等新的 brief 或评审包进来后再继续。`,
    workItemStableIdentifiers: "稳定标识：",
    launchControlsTitle: "操盘控制栏",
    launchControlsBody:
      "先看上面的判断检查带，再用这里推进正确的包、刷新信号，并把 repo-local 已就绪和 Git 已落袋继续分开。",
    currentFocusTitle: "当前焦点",
    currentFocusMeta: (statusLabel, owner, stage) =>
      `状态：${statusLabel}。负责人：${owner}。阶段：${stage}。`,
    currentFocusEmpty: "当前这条泳道里还没有需要操作者继续跟进的可见包。",
    nextBestAction: "下一步最佳动作",
    nextActionGuidance: {
      active:
        "先打开当前焦点，再点一次“检查信号”；只有当新的证据和评审结论仍然一致时，才继续提升这份包。这叫仓库本地侧已就绪，不等于已经通过 Git 落袋。",
      blocked:
        "先别提升当前泳道。先清掉阻塞决策，或者直接升级给人工评审者，再决定这份包要不要往前推。",
      done: "把这份已完成包交给下游复用，或者只在相邻门禁和证据信号都还是绿的时候继续推进到发布。commit、push 和 PR 仍然是独立的落袋动作。",
      empty: "先重置筛选或新建需求包，不要根据旧看板状态脑补下一步。",
    },
    proofSignal: "这条泳道为什么值得信任",
    proofSignalBody:
      "键盘路径、状态覆盖和 CTA 标签，已经进入仓库可证明的那一层；如果还要人来拍板，就去看下面的暂停条件。",
    checkSignals: "检查信号",
    reviewDeskTitle: "评审台",
    reviewDeskBody:
      "这里要回答的是：仓库已经证明了什么、评审者现在还要检查什么，以及“本地已闭环”和“Git 已落袋”不能混成一件事。",
    reviewDeskCards: [
      {
        title: "先看变更落点",
        body: "先确认这份包到底动了哪一页、哪一块共享面，再决定风险是不是已经扩大。",
      },
      {
        title: "再看文案、可访问性与状态风险",
        body: "只要 copy、键盘路径或边界状态还有疑点，这份包就还不该被当成“已可放行”。",
      },
      {
        title: "证据互相打架时立刻回退到人工判断",
        body: "如果需求包、状态标签、证据信号和落袋状态说出的结论不一致，就先停下来交给人工评审。",
      },
    ],
    decisionSplitTitle: "先分清这条泳道已经证明了什么，还有什么必须你来拍板",
    decisionSplitBody:
      "先看这层分账，再决定要不要提升下一份操作包，避免把“看起来很绿”误当成“已经可以放行”，也避免把“本地已完成”误写成“已经落袋”。",
    decisionSplitCards: [
      {
        title: "这条泳道已经在仓库里证明的部分",
        body: "需求包摘要、泳道状态、证据信号和最近一次刷新结果，都已经能在这块仓库自有界面上看清楚。",
      },
      {
        title: "仍然需要人工评审、放行或落袋判断的部分",
        body: "共享面打磨、最终上线信心、跨泳道取舍，以及最后的 commit/push/PR 动作，仍然应该由人来拍板，就算本地包已经显示为绿色。",
      },
    ],
    laneContractTitle: "泳道合同与诚实说明",
    laneContractBody:
      "这块工作台是 repo-local 的模拟操盘台，不是 live ops console。把三条泳道理解成同一柜台上的不同队列；如果你先要确认“这些证据到底算什么”，就回证据台。",
    laneContracts: [
      {
        title: "Pipeline 泳道",
        body: "最适合先锁定提示词范围、目标界面和交付包形状。它不负责替你宣布这份包已经批准通过。",
      },
      {
        title: "Review 泳道",
        body: "最适合看文案、可访问性、状态边缘和共享面风险。它不该因为本地结果偏绿，就跳过人的拍板。",
      },
      {
        title: "Release 泳道",
        body: "最适合看 repo-local 门禁、交接条件和暂停规则。它不该被包装成 live ops console，也不等于 Git 已经落袋。",
      },
    ],
    operatorGuideTitle: "操盘指引",
    operatorGuideBody:
      "这块工作台的价值在于带着证据推进判断，而不是收集一堆看起来很忙的卡片。",
    operatorGuideSteps: [
      {
        title: "只推进已经可审查的事项",
        body: "只有当前可见事项已经具备评审条件时才打开第一条，不要为了看起来在推进就随手点击。",
      },
      {
        title: "先刷新证据，再升级或落袋",
        body: "在把事项推向评审、发布动作或 Git 落袋之前，先点一次“检查信号”，让下一次交接背后有新鲜证据。",
      },
      {
        title: "先重置看板，再决定下一步",
        body: "看板为空或筛选过窄时，先扩大搜索或重置泳道，不要根据旧状态脑补接下来的动作。",
      },
    ],
    pauseTitle: "遇到这些情况先暂停",
    pauseBody:
      "如果仓库可证明的信号已经过期、事项摘要和当前泳道对不上，或这份包还需要人工发布或落袋判断，就先停在这里，不要直接提升。",
    proofDeskShortcutTitle: "先确认这些证据到底说明了什么？",
    proofDeskShortcutBody:
      "如果你还拿不准当前信号到底证明了什么，就先回证据台把证明边界看清，再决定这份包要不要继续推进。",
    proofDeskShortcutCta: "打开证据台",
    successToastTitle: "证据信号已刷新",
    dismissSuccessLabel: "关闭成功提示",
    loadingAnnouncement: "正在加载当前泳道的工作项。",
    errorTitle: "工作区丢失了最新同步。",
    errorBody: "当前泳道刷新失败。请重试，或者先重置命令栏状态。",
    retryRefresh: "重新刷新",
    resetState: "重置状态",
    dialogPromptLabel: "提示词",
    dialogPromptPlaceholder: "描述这次 UI 目标",
    dialogPromptHint: (count, minLength) =>
      `${count}/${minLength} 个最少字符，并说明目标用户流程。`,
    dialogSurfaceLabel: "目标界面",
    dialogCancel: "取消",
    dialogQueue: "加入操作包队列",
    scrollableTabListLabel: "可横向滚动的工作台标签列表",
    scrollTabsLeft: "向左滚动标签",
    scrollTabsRight: "向右滚动标签",
    tabsAriaLabel: "工作台泳道",
    tabItemsUnit: "项",
    workItemsAriaLabel: (laneLabel) => `${laneLabel} 工作项`,
    draftOptions: [
      {
        value: "landing",
        label: "落地页",
        hint: "首屏、证据块、CTA 和叙事流。",
      },
      {
        value: "dashboard",
        label: "工作台",
        hint: "指标、表格、状态与高频操作控件。",
      },
      {
        value: "checkout",
        label: "结账流程",
        hint: "高信任支付、校验与成功回执流程。",
      },
    ],
    dialogCopy: {
      draft: {
        title: "创建可上线的界面说明包",
        description:
          "把新需求整理成边界明确的界面说明包，这样评审和发布可以更快开始。",
        prompt:
          "构建一个面向管理者的工作台，包含搜索、标签切换、对话框与完整状态覆盖。",
        kind: "dashboard",
      },
      pipeline: {
        title: "创建流水线需求包",
        description: "把当前起稿泳道整理成结构化需求包，并明确交付物。",
        prompt: "起草一个可上线的起稿需求包，覆盖目标、状态覆盖与交付门槛。",
        kind: "dashboard",
      },
      review: {
        title: "启动评审检查",
        description: "为当前泳道发起一个聚焦文案、无障碍和交互细节的审查计划。",
        prompt:
          "创建一份 review audit 清单，覆盖可访问性、文案与交互边界场景。",
        kind: "dashboard",
      },
      release: {
        title: "准备发布门禁",
        description:
          "整理一个以发布为中心的需求包，覆盖 smoke、visual QA 和 rollout readiness。",
        prompt:
          "构建一个发布门禁需求包，包含 smoke 覆盖、回滚说明与最终视觉检查。",
        kind: "checkout",
      },
      priority: {
        title: "提升最高优先级事项",
        description:
          "把当前最高优先级项目转成一份完整的上线说明包，同时保留上下文。",
        prompt: "把当前最高优先级任务提升成一个可上线的说明包。",
        kind: "dashboard",
      },
    },
    tabCopy: {
      pipeline: {
        label: "起稿",
        subtitle: "在生成开始前，先锁清范围、目标界面和交付形态。",
        cta: "打开范围需求包",
      },
      review: {
        label: "评审",
        subtitle:
          "先检查文案、可访问性、状态边界和共享面风险，再决定是否放行。",
        cta: "打开评审包",
      },
      release: {
        label: "发布",
        subtitle: "先确认 gates、proof 和交接条件，再让发布动作继续向前。",
        cta: "检查发布包",
      },
    },
    workItems: WORK_ITEMS_ZH,
  };
}

export function getWorkbenchContent(locale: AppLocale): WorkbenchCopy {
  if (locale === "zh-CN") {
    return buildChineseCopy();
  }

  return buildEnglishCopy();
}

export function getStatusVariant(
  status: WorkItem["status"],
): "default" | "secondary" | "success" | "destructive" | "outline" {
  if (status === "blocked") {
    return "destructive";
  }

  if (status === "done") {
    return "success";
  }

  return "default";
}
