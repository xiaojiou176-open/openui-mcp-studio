export const SITE_BRAND = {
  technicalName: "OpenUI MCP Studio",
  frontdoorName: "OneClickUI.ai",
  frontdoorLabel: "OneClickUI.ai front door",
  poweredBy: "Powered by OpenUI MCP Studio",
  repoUrl: "https://github.com/xiaojiou176-open/openui-mcp-studio",
  docs: {
    readme: "https://github.com/xiaojiou176-open/openui-mcp-studio#readme",
    docsHub: "/docs",
    proofFaq: "/docs#proof-faq",
    walkthrough: "/docs#first-minute-walkthrough",
    apiContract:
      "https://github.com/xiaojiou176-open/openui-mcp-studio/blob/main/docs/contracts/openui-mcp.openapi.json",
    ecosystemContract:
      "https://github.com/xiaojiou176-open/openui-mcp-studio/blob/main/docs/contracts/openui-ecosystem-productization.json",
    docsIndex: "/docs#docs-index",
    discoveryGuide: "/docs#discovery-chain",
    evaluatorChecklist: "/docs#evaluator-checklist",
    publicSurfaceGuide: "/docs#public-surface",
    releaseTemplate: "/docs#release-proof-shelf",
    externalActivationLedger: "/docs#external-activation-ledger",
    ecosystemLedger: "/docs#ecosystem-ledger",
    publicSkillsLedger: "/docs#public-skills-ledger",
    sdkHostedLedger: "/docs#sdk-hosted-ledger",
    publicDistributionBundle:
      "https://github.com/xiaojiou176-open/openui-mcp-studio/blob/main/examples/public-distribution/README.md",
  },
} as const;

export const BRAND_SPLIT = {
  frontdoorLabel: "OneClickUI.ai is the front door label.",
  technicalTruth:
    "OpenUI MCP Studio remains the technical product, runtime, and release truth.",
  canonicalRuntime: "local stdio MCP",
  notTruth:
    "Do not treat OneClickUI.ai as an already-verified live canonical deployment unless remote evidence says so.",
} as const;

export const PRODUCT_POSITIONING = {
  category: "MCP-native UI/UX delivery and review workflow",
  secondaryCategory: "spec-driven UI/UX delivery workbench",
  summary:
    "Turn UI/UX briefs into React + shadcn delivery with proof, review, acceptance, and next-step guidance.",
  companionLine:
    "A stronger UI/UX execution, proof, and review companion for Codex and Claude Code workflows, without pretending to be a generic coding agent or hosted builder platform.",
} as const;

export const CURRENT_BUILDER_SURFACE_ORDER = [
  {
    id: "mcp",
    step: "Step 1",
    title: "stdio MCP server",
    audience: "Codex, Claude Code, and other MCP-native builder clients",
    bestFor:
      "the primary prompt-to-workspace integration path when the team wants real React UI delivery with proof and review still attached",
    readWhen:
      "Read this first when you need the canonical execution path for Codex, Claude Code, or another MCP client.",
    notFor:
      "people looking for a hosted builder, SDK, plugin runtime, or remote write-capable control plane",
    body: "Current primary integration surface for Codex, Claude Code, and other MCP clients.",
  },
  {
    id: "openapi",
    step: "Step 2",
    title: "compatibility OpenAPI",
    audience:
      "bridge consumers, contract reviewers, and builder teams auditing shape",
    bestFor:
      "reviewing route contracts and compatibility semantics without treating the repo like a hosted API product",
    readWhen:
      "Read this second when the MCP entry order is already clear and you need a schema-oriented compatibility view.",
    notFor:
      "claiming the repo already exposes a public hosted API or a write-anywhere runtime",
    body: "Current builder-facing bridge surface for review, contract checks, and compatibility consumers; not a hosted API promise.",
  },
  {
    id: "repo-workflow-cli",
    step: "Step 3",
    title: "repo-local workflow CLI",
    audience: "maintainers and reviewers reading repo-local readiness packets",
    bestFor:
      "operator-facing readiness summaries and repo-local workflow evidence that stays read-only by default",
    readWhen:
      "Read this third when the question becomes readiness, handoff, or check-review state instead of raw execution.",
    notFor:
      "pretending the repo will mutate remote state, land a PR, or replace GitHub operations by itself",
    body: "Current maintainer-facing product surface for read-only workflow packets and release-readiness summaries.",
  },
] as const;

export const LATER_BUILDER_SURFACE_LANES = [
  "official catalog or marketplace listing",
  "registry publication for supporting package surfaces",
  "managed hosted deployment",
  "remote write-capable MCP",
] as const;

export const PRIMARY_KEYWORDS = [
  "AI UI generator for React",
  "prompt to React UI",
  "shadcn UI generator",
  "AI UI review",
  "React UI shipping",
  "UI UX companion for Codex",
  "MCP frontend workflow",
  "Codex MCP UI workflow",
  "Claude Code UI workflow",
  "MCP server for React UI delivery",
  "UI operator desk",
];

export const SUPPORTING_KEYWORDS = [
  "workspace integrated UI generator",
  "feature level UI delivery",
  "review bundle for UI changes",
  "acceptance workflow for generated UI",
  "proof driven UI workflow",
  "React UI workflow for Codex",
  "React UI workflow for Claude Code",
  "UI shipping API compatibility",
  "reviewable MCP UI tools",
];

export const COMPARE_KEYWORDS = [
  "Bolt alternative",
  "Lovable alternative",
  "v0 alternative",
  "OpenHands comparison",
  "OpenCode comparison",
  "Codex MCP workflow",
  "Claude Code MCP workflow",
];

export const AVOID_KEYWORDS = [
  "AI coding agent",
  "AI software engineer",
  "browser agent",
  "no-code app builder",
  "fully autonomous app builder",
];

export const HERO_SIGNALS = [
  "Writes into your workspace",
  "Keeps review and acceptance in the loop",
  "Works with React + shadcn + MCP workflows",
  "Ships starter bundles, proof loops, and troubleshooting",
  "Acts as a UI/UX companion instead of a generic agent shell",
  "Connects to Codex and Claude Code through stdio MCP",
];

export const PROOF_STEPS = [
  {
    eyebrow: "1. Prompt",
    title: "Start from a brief, not a screenshot wish.",
    body: "The front door shows the same story the repo actually supports: a UI brief goes into a real workspace-aware delivery flow.",
    snippet:
      "Build a pricing surface with a stronger hero, trust row, feature comparison, and review-ready acceptance notes.",
  },
  {
    eyebrow: "2. Output",
    title: "Generate React + shadcn output that is meant to be applied.",
    body: "This is not positioned as a pure hosted builder. The real promise is generated UI that can be shaped for the repo you already own.",
    snippet:
      "apps/web/app/pricing/page.tsx\napps/web/components/generated/PricingCards.tsx\napps/web/components/generated/FeatureComparison.tsx",
  },
  {
    eyebrow: "3. Workspace state",
    title: "Keep changed files visible before trust goes up.",
    body: "A reviewer can see which paths changed and where shared components or layout impact starts to matter.",
    snippet: "workspace-profile.json\nchange-plan.json\nfeature-flow-plan.json",
  },
  {
    eyebrow: "4. Review and proof",
    title: "End with review bundle, acceptance, and proof.",
    body: "The strongest difference from a plain generator is that proof, review, and acceptance stay in the loop instead of being post-hoc guesswork.",
    snippet:
      "feature-flow-review-bundle.md\nfeature-flow-acceptance-result.json\nsmoke:e2e / visual:qa / repo:doctor",
  },
];

export const DIFFERENTIATORS = [
  {
    title: "Workspace integration first",
    body: "The product is most honest when it talks about writing into a real workspace, not about replacing your entire engineering stack.",
  },
  {
    title: "Proof before trust",
    body: "Smoke, review, acceptance, and proof language stay visible so the homepage matches the product's actual operating model.",
  },
  {
    title: "MCP-native workflow",
    body: "This is built around an MCP server and repo-integrated delivery path, which makes it more relevant for builders and evaluators than a pure chat demo.",
  },
  {
    title: "Feature-level delivery is getting thicker",
    body: "Feature flow now keeps route-level artifacts and a feature-level review package, which is a more honest story than 'one-click page magic'.",
  },
  {
    title: "Builder-ready compatibility layer",
    body: "The repo already exposes a primary MCP tool surface, a compatibility OpenAPI bridge, and a repo-local workflow CLI for builder-facing review, without pretending that a hosted platform or write-anywhere API already exists.",
  },
];

export const AUDIENCE_PRIORITY = {
  primary: {
    title: "Technical evaluators and React + shadcn frontend teams",
    body: "These users care whether a workflow writes into the repo, exposes reviewable artifacts, and can survive smoke and proof gates.",
  },
  secondary: {
    title: "MCP builders and teams looking beyond Bolt / Lovable / v0 demos",
    body: "They are likely to care about workspace reality, review surfaces, and a more inspectable path than a hosted generation-only story.",
  },
  notPrimary: {
    title: "Not the best fit for generic 'just make me an app' traffic",
    body: "The current product is not a no-code builder, not a generic coding agent, and not a one-click hosted SaaS shell.",
  },
} as const;

export const COMPARE_POINTS = [
  {
    tool: "Bolt",
    officialUrl: "https://bolt.new/",
    officialPositioning:
      "Chat-to-app builder for websites, apps, and prototypes.",
    bestFor: "fast hosted prototypes and broad builder language",
    openUiEdge:
      "better when the team needs workspace-integrated proof, review, and repo-aware delivery surfaces",
    notFor:
      "people who mainly want the smoothest hosted app-builder experience",
  },
  {
    tool: "Lovable",
    officialUrl: "https://lovable.dev/",
    officialPositioning:
      "AI app builder focused on fast app and website creation.",
    bestFor: "speedy app/site generation with lighter engineering ceremony",
    openUiEdge:
      "better when the team values review bundle, acceptance thinking, and MCP-native workflow semantics",
    notFor:
      "people who want no-code-first velocity more than inspectable delivery evidence",
  },
  {
    tool: "v0",
    officialUrl: "https://v0.app/",
    officialPositioning: "AI build surface for agents, apps, and websites.",
    bestFor: "rapid web UI ideation with strong template momentum",
    openUiEdge:
      "better when the team wants prompt-to-workspace delivery with proof and feature-level package structure",
    notFor:
      "people who only need design iteration and do not care about workspace write paths or acceptance surfaces",
  },
];

export const ECOSYSTEM_BINDINGS = [
  {
    name: "MCP",
    classification: "Primary binding",
    body: "MCP is not decorative wording here. The repository ships a local stdio MCP server and keeps that protocol as the real tool surface.",
  },
  {
    name: "Codex",
    classification: "Primary binding",
    body: "Codex is a natural client fit when the goal is prompt-to-workspace React UI delivery with proof, review, and acceptance kept visible.",
  },
  {
    name: "Claude Code",
    classification: "Primary binding",
    body: "Claude Code fits the same stdio MCP path for teams that want model-assisted UI shipping without flattening the workflow into a generic assistant story.",
  },
  {
    name: "OpenHands",
    classification: "Secondary comparison",
    body: "Useful as broader coding-agent context, but still secondary to the narrower UI-delivery and proof-workbench story here.",
  },
  {
    name: "OpenCode",
    classification: "Secondary comparison",
    body: "Relevant as open coding-agent ecosystem traffic, but not the primary category claim for this repository.",
  },
  {
    name: "OpenClaw",
    classification: "Secondary package-ready binding",
    body: "OpenClaw is still not the front-door category claim, but the repo now ships a public-ready starter bundle and proof path instead of leaving the lane at bridge-materials-only.",
  },
] as const;

export const AI_CAPABILITY_LANES = [
  {
    title: "Workflow copilot",
    body: "AI helps scan the workspace, plan the change, and keep the route-level blast radius legible before trust goes up.",
  },
  {
    title: "Risk and approval explainer",
    body: "Acceptance packs and review bundles summarize what passed automatically, what still needs a human, and why the workflow is refusing fake certainty.",
  },
  {
    title: "Operator next-step assistant",
    body: "Repo workflow summary and readiness packets turn local plus GitHub state into the next recommended action instead of leaving maintainers to infer it from raw CLI noise.",
  },
] as const;

export const BUILDER_ENTRY_POINTS = [
  {
    step: "Step 1",
    title: "Connect from Codex or Claude Code with the starter bundle",
    audience:
      "builder teams already operating through MCP-aware coding clients",
    bestFor:
      "the shortest honest path from prompt to workspace writes, proof desks, and reviewable React delivery",
    readWhen:
      "Open this when your first question is how to add OpenUI to Codex or Claude Code through the current MCP-native runtime path.",
    notFor: "a hosted builder setup story or a generic agent marketplace pitch",
    body: "The current integration story starts with the stdio MCP server plus the repo-owned starter bundles, not a hosted API claim. Use the MCP client setup path when you want real prompt-to-workspace delivery.",
    cta: "Open MCP install guide",
    href: SITE_BRAND.docs.discoveryGuide,
  },
  {
    step: "Step 2",
    title: "Inspect the compatibility API contract",
    audience: "bridge consumers, reviewers, and contract-minded integrators",
    bestFor:
      "read-only HTTP projection, compatibility review, and consumer-side contract checks",
    readWhen:
      "Open this after the MCP path is clear and the next question becomes adapter shape, compatibility review, or breaking-change inspection.",
    notFor:
      "treating the compatibility bridge like a canonical hosted API or SDK promise",
    body: "Use the OpenAPI compatibility document when you need a read-only HTTP projection of the MCP tool surface for review, contract checks, or bridge consumers.",
    cta: "Open OpenAPI contract",
    href: SITE_BRAND.docs.apiContract,
  },
  {
    step: "Step 3",
    title: "Prove the package before you widen the claim",
    audience: "maintainers and evaluators reading repo-local readiness signals",
    bestFor:
      "workflow packets, proof loops, and troubleshooting that explain repo-local plus GitHub-connected readiness without mutating remote state",
    readWhen:
      "Open this after execution is already clear and you need a read-only maintainer/operator view of readiness, proof, and handoff state.",
    notFor:
      "pretending the repo can push, approve, or land release traffic by itself",
    body: "Use the raw repo workflow summary, starter proof loop, and the maintainer-ready packet when you need proof of local plus GitHub readiness through repo-local CLI surfaces, without pretending the repo can mutate remote state by itself.",
    cta: "Open proof and readiness docs",
    href: SITE_BRAND.docs.docsIndex,
  },
] as const;

export const MACHINE_READABLE_SURFACES = [
  {
    title: "LLM and agent summary",
    label: "llms.txt",
    cta: "Open llms.txt",
    href: "/llms.txt",
    audience:
      "LLM clients, search/index systems, and builders needing the shortest truth layer",
    bestFor:
      "the English-first snapshot of route roles, builder order, and current boundaries",
    readWhen:
      "Open this when an agent or search/index system needs the shortest product and route summary before reading deeper docs.",
    notFor: "interactive proof, operator work, or long-form command semantics",
    body: "The shortest English-first front-door summary for Codex, Claude Code, MCP clients, and AI search or index consumers.",
  },
  {
    title: "Builder JSON snapshot",
    label: "frontdoor JSON",
    cta: "Open frontdoor JSON",
    href: "/api/frontdoor",
    audience: "builder tooling, agents, and contract-aware integrators",
    bestFor:
      "routes, bindings, audience fit, i18n posture, and boundary metadata in one machine-readable payload",
    readWhen:
      "Open this after the product sentence is clear and you need a structured discovery contract for tooling or integration work.",
    notFor:
      "inventing a new runtime or claiming the repo already exposes a hosted builder control plane",
    body: "Machine-readable routes, bindings, AI capability lanes, i18n posture, and honest product boundaries for builder-facing consumers.",
  },
  {
    title: "Web manifest",
    label: "manifest.webmanifest",
    cta: "Open web manifest",
    href: "/manifest.webmanifest",
    audience:
      "browsers, install surfaces, and crawler-adjacent discovery consumers",
    bestFor:
      "front-door route shortcuts and install/discovery metadata that point to the same honest product roles",
    readWhen:
      "Open this when you need browser-facing install metadata and route shortcuts, not the full builder or proof explanation.",
    notFor:
      "turning the app into a deployed canonical hosted truth or replacing the proof desk",
    body: "Install and discovery metadata that helps browsers and evaluators understand the public front door without scraping the whole repo.",
  },
  {
    title: "Sitemap",
    label: "sitemap.xml",
    cta: "Open sitemap",
    href: "/sitemap.xml",
    audience: "crawlers and maintainers checking canonical route exposure",
    bestFor:
      "the canonical crawl map for the public front-door routes when NEXT_PUBLIC_SITE_URL is configured",
    readWhen:
      "Open this when you need the crawl map and canonical route exposure, not the longer product narrative.",
    notFor:
      "expressing product boundaries in detail or replacing route-role metadata",
    body: "Canonical crawl map for the human-facing front-door routes when NEXT_PUBLIC_SITE_URL is configured.",
  },
  {
    title: "Robots policy",
    label: "robots.txt",
    cta: "Open robots policy",
    href: "/robots.txt",
    audience:
      "crawlers and maintainers checking whether indexing should be enabled",
    bestFor:
      "the explicit crawl policy that pairs with sitemap exposure and canonical site gating",
    readWhen:
      "Open this when you need to confirm whether the front door is currently indexable, not when you need the longer product narrative.",
    notFor:
      "explaining route roles, builder order, or replacing the proof and docs surfaces",
    body: "Crawl policy that stays aligned with sitemap exposure and NEXT_PUBLIC_SITE_URL-driven indexability.",
  },
] as const;

export const FRONTDOOR_LINKS = [
  { href: "/walkthrough", label: "First-minute walkthrough" },
  { href: "/proof", label: "30-second proof" },
  { href: "/workbench", label: "Open the operator desk" },
  { href: "/docs", label: "Discovery docs hub" },
  { href: "/compare", label: "Alternatives and compare" },
];

export const FRONTDOOR_ROUTE_CONTRACTS = [
  {
    id: "home",
    href: "/",
    label: "Front door",
    role: "front door",
    audience:
      "first-time evaluators, builder traffic, and product-positioning readers",
    bestFor:
      "understanding the product sentence, the integration entry order, and where to route next without guessing",
    notFor:
      "deep proof semantics, interactive operator work, or claiming hosted-deployment truth",
    boundary:
      "Acts as the orientation surface only. It does not replace the proof desk, operator desk, or runtime protocol entrypoint.",
  },
  {
    id: "proof",
    href: "/proof",
    label: "30-second proof",
    role: "proof desk",
    audience: "evaluators, reviewers, and first-time builders checking trust",
    bestFor:
      "sorting what the repo already proves, what still needs human judgment, and which route to open next",
    notFor:
      "claiming Git landing, remote deployment, or final design sign-off already happened",
    boundary:
      "Shows repo-owned proof tiers and next-step routing only; remote, live, and final release truth stay outside this desk.",
  },
  {
    id: "compare",
    href: "/compare",
    label: "Alternatives and compare",
    role: "decision surface",
    audience:
      "teams comparing OpenUI against hosted builders and broader coding-agent traffic",
    bestFor:
      "deciding whether repo-aware UI delivery with proof and review is the right job to optimize for",
    notFor:
      "pretending all builder products belong in one category or benchmark matrix",
    boundary:
      "Explains category fit only; it does not replace the proof desk or operator desk.",
  },
  {
    id: "walkthrough",
    href: "/walkthrough",
    label: "First-minute walkthrough",
    role: "guided route",
    audience:
      "newcomers who want a short guided order before reading deeper docs",
    bestFor:
      "moving from front door to proof, workbench, and one real repo-owned command in a deliberate sequence",
    notFor: "acting like a full tutorial center or a separate launch page",
    boundary:
      "Keeps onboarding lightweight and route-aware; long-form explanation still belongs in docs.",
  },
  {
    id: "workbench",
    href: "/workbench",
    label: "Open the operator desk",
    role: "operator desk",
    audience:
      "operators, maintainers, and active reviewers working the next repo-local packet",
    bestFor:
      "repo-local packet decisions, pause rules, and next-step guidance when proof still needs to stay attached",
    notFor:
      "a live ops console, remote mutation surface, or source of deployed production truth",
    boundary:
      "This is a repo-local simulated operator surface. It helps route decisions and evidence, but it is not a live operations console.",
  },
] as const;

export const DISCOVERY_CHAIN = [
  {
    step: "Step 1",
    title: "README storefront",
    href: SITE_BRAND.docs.readme,
    role: "first GitHub impression",
    body: "Explain what the product is, who it is for, and where to go next without dropping visitors into source files.",
  },
  {
    step: "Step 2",
    title: "Front door",
    href: "/",
    role: "orientation surface",
    body: "Introduce the product sentence, guided paths, builder order, and the shortest trust ladder.",
  },
  {
    step: "Step 3",
    title: "First-minute walkthrough",
    href: "/walkthrough",
    role: "guided route",
    body: "Give newcomers the shortest recommended route from front door to proof, workbench, and one real repo-owned command.",
  },
  {
    step: "Step 4",
    title: "Proof desk",
    href: "/proof",
    role: "trust surface",
    body: "Show what the repo already proves, what still needs human judgment, and which next route makes sense.",
  },
  {
    step: "Step 5",
    title: "Operator desk",
    href: "/workbench",
    role: "repo-local operator surface",
    body: "Help an operator decide the next move once the proof meaning is already clear, without pretending to be a live control plane.",
  },
  {
    step: "Step 6",
    title: "Docs discovery route",
    href: SITE_BRAND.docs.docsHub,
    role: "human-readable docs hub",
    body: "Keep README, proof FAQ, evaluator guidance, release shelf, and ecosystem ledgers inside one in-app discovery route instead of dumping visitors into GitHub blob pages.",
  },
  {
    step: "Step 7",
    title: "Compare",
    href: "/compare",
    role: "decision surface",
    body: "Explain why OpenUI fits repo-aware UI shipping better than hosted builders or generic coding-agent traffic when category fit is still the open question.",
  },
  {
    step: "Step 8",
    title: "Machine-readable discovery",
    href: "/llms.txt",
    role: "short LLM summary",
    body: "Expose the shortest English-first route, builder, and boundary summary for LLM, search, and tooling consumers.",
  },
  {
    step: "Step 9",
    title: "Frontdoor JSON",
    href: "/api/frontdoor",
    role: "structured discovery contract",
    body: "Expose routes, bindings, builder order, public bundle pointers, and operator-only follow-through in one JSON surface.",
  },
  {
    step: "Step 10",
    title: "Manifest and crawl metadata",
    href: "/manifest.webmanifest",
    role: "browser and crawler metadata",
    body: "Expose install metadata plus manifest, sitemap, and robots hints for browsers and crawler-adjacent tooling.",
  },
] as const;

export const PUBLIC_BUNDLE = [
  {
    title: "Visual proof assets",
    items: [
      "openui-mcp-studio-demo.gif",
      "openui-mcp-studio-workbench.png",
      "openui-mcp-studio-comparison.png",
      "openui-mcp-studio-trust-stack.png",
      "openui-mcp-studio-use-cases.png",
      "openui-mcp-studio-visitor-paths.png",
      "openui-mcp-studio-social-preview.png",
    ],
  },
  {
    title: "Narrative docs",
    items: [
      "README.md",
      "docs/discovery-surfaces.md",
      "docs/proof-and-faq.md",
      "docs/evaluator-checklist.md",
      "docs/public-surface-guide.md",
      "docs/release-template.md",
      "examples/public-distribution/README.md",
    ],
  },
  {
    title: "Plugin-grade bundles",
    items: [
      ".claude-plugin/marketplace.json",
      "examples/codex/marketplace.sample.json",
      "plugins/openui-workspace-delivery/.claude-plugin/plugin.json",
      "plugins/openui-codex-delivery/.codex-plugin/plugin.json",
    ],
  },
  {
    title: "Machine-readable discovery",
    items: [
      "/llms.txt",
      "/api/frontdoor",
      "/manifest.webmanifest",
      "/sitemap.xml",
      "/robots.txt",
    ],
  },
] as const;

export const PUBLIC_PRODUCT_LINES = [
  {
    id: "codex-claude-public-package",
    title: "Codex and Claude public package",
    status: "official-surface-ready",
    body: "Plugin-grade public distribution package for Codex and Claude Code: starter bundles, proof loop, troubleshooting, a repo-scoped Codex Plugin Directory sample, and a marketplace-compatible Claude bundle.",
  },
  {
    id: "public-skills-starter",
    title: "Public Skills starter pack",
    status: "current-packaging",
    body: "Installable starter-pack packaging through @openui/skills-kit, while marketplace/runtime claims remain out of scope.",
  },
  {
    id: "openclaw-public-ready",
    title: "OpenClaw public-ready bundle",
    status: "clawhub-ready",
    body: "Repo-owned starter bundle, proof loop, and discoverable artifacts for OpenClaw-style hosts; the official public surface exists as ClawHub, but no listing is claimed.",
  },
] as const;

export const OPERATOR_ONLY_PUBLIC_SURFACES = [
  {
    title: "GitHub Homepage",
    body: "Attach a real landing page or docs site only when that URL is verified live. Leaving Homepage blank is more honest than pointing at an unverified or misleading site.",
  },
  {
    title: "GitHub Social Preview",
    body: "Uploading or selecting the social preview image remains a GitHub settings action. Repo assets can prepare the image, but they cannot prove the setting is live by themselves.",
  },
  {
    title: "Published release proof bundle",
    body: "Draft releases and local assets can prepare the bundle, but publishing the release and refreshing attached assets is still a remote mutation step.",
  },
  {
    title: "Discussion seeding and curation",
    body: "Enabling Discussions is only the start. Keeping starter threads visible and current remains a GitHub/operator task.",
  },
  {
    title: "Domain, DNS, and TLS for OneClickUI.ai",
    body: "The repo can prepare the front-door story, but a real domain cutover still depends on external deployment, DNS, and certificate ownership.",
  },
] as const;

export const ECOSYSTEM_PRODUCTIZATION_STATUS = [
  {
    id: "formal-skills",
    title: "Public Skills starter kit",
    status: "current-packaging",
    audience:
      "maintainers and builders drafting future skill-shaped integrations",
    bestFor:
      "installable starter contracts, manifests, and examples that stay honest about the current builder surface",
    readWhen:
      "Open this after the main MCP, OpenAPI, and workflow surfaces are clear and you need a formal public starter contract.",
    notFor:
      "claiming a marketplace listing, hosted Skills runtime, or vendor-approved plugin catalog",
    body: "Current truth now includes an installable public starter package while staying explicitly short of a marketplace or hosted Skills runtime.",
  },
  {
    id: "plugin-like-install-packaging",
    title: "Codex and Claude plugin-grade public package",
    status: "official-surface-ready",
    audience: "Codex and Claude Code users who install local MCP servers",
    bestFor:
      "configuration snippets, starter bundles, proof loop, and discovery metadata that make local MCP installation feel productized",
    readWhen:
      "Open this when the next question is how to add OpenUI to Codex or Claude Code without inventing an official plugin marketplace story.",
    notFor:
      "claiming a Codex marketplace item or a published Claude Code plugin before those artifacts exist",
    body: "The strongest current packaging is a repo-owned official-surface-ready package; official directory or marketplace publication is still a separate claim.",
  },
  {
    id: "openclaw-public-ready",
    title: "OpenClaw public-ready bundle",
    status: "clawhub-ready",
    audience:
      "OpenClaw-side builders and operators who need a discoverable repo-owned install and proof path",
    bestFor:
      "starter config, proof loop, and machine-readable discovery artifacts before any official listing exists",
    readWhen:
      "Open this when the next question is how to present OpenUI honestly to OpenClaw-side users without pretending a catalog approval exists.",
    notFor:
      "claiming an official OpenClaw runtime, ClawHub listing, or vendor approval",
    body: "The repo now ships a ClawHub-ready OpenClaw bundle at the artifact layer, but not an official listing.",
  },
  {
    id: "public-sdk",
    title: "Hosted client SDK",
    status: "supporting-parked",
    audience: "developers evaluating future thin-client or package surfaces",
    bestFor:
      "installing a thin HTTP client for the self-hosted OpenUI Hosted API with explicit auth and boundary semantics",
    readWhen:
      "Open this when the question becomes how to call the self-hosted HTTP surface from code.",
    notFor:
      "claiming registry publication, front-door primary status, or replacing the local stdio MCP runtime",
    body: "Current truth still includes a real @openui/sdk package with install, import, and proof paths, but it is now a supporting or parked lane.",
  },
  {
    id: "hosted-api",
    title: "Self-hosted OpenUI Hosted API",
    status: "supporting-parked",
    audience: "adapter authors and future hosted-surface planners",
    bestFor:
      "running an authenticated HTTP surface with discovery, workflow, and tool endpoints around the current repo-owned runtime",
    readWhen:
      "Open this after the compatibility bridge semantics are clear and you need a real self-hosted service/runtime surface.",
    notFor:
      "claiming a managed SaaS deployment, front-door primary status, control plane, or remote write surface",
    body: "Current truth still includes a self-hosted OpenUI Hosted API runtime with auth, rate limiting, observability, and proof paths, but it is now a supporting or parked lane.",
  },
] as const;
