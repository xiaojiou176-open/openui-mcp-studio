import {
  AI_CAPABILITY_LANES,
  AUDIENCE_PRIORITY,
  BUILDER_ENTRY_POINTS,
  COMPARE_POINTS,
  DIFFERENTIATORS,
  ECOSYSTEM_BINDINGS,
  FRONTDOOR_LINKS,
  HERO_SIGNALS,
  MACHINE_READABLE_SURFACES,
  PROOF_STEPS,
  SITE_BRAND,
} from "../frontdoor-content";
import { DEFAULT_LOCALE, type AppLocale } from "./config";

type FrontdoorProofStep = {
  eyebrow: string;
  title: string;
  body: string;
  snippet: string;
};
type FrontdoorDifferentiator = {
  title: string;
  body: string;
};
type FrontdoorBinding = {
  name: string;
  classification: string;
  body: string;
};
type FrontdoorAiLane = {
  title: string;
  body: string;
};
type FrontdoorAudienceCard = {
  title: string;
  body: string;
};
type FrontdoorComparePoint = {
  tool: string;
  officialUrl: string;
  officialPositioning: string;
  bestFor: string;
  openUiEdge: string;
  notFor: string;
};
type FrontdoorBuilderEntry = {
  step: string;
  title: string;
  audience: string;
  bestFor: string;
  readWhen: string;
  notFor: string;
  body: string;
  cta: string;
  href: string;
};
type FrontdoorMachineSurface = {
  title: string;
  label: string;
  cta: string;
  href: string;
  audience: string;
  bestFor: string;
  readWhen: string;
  notFor: string;
  body: string;
};
type FrontdoorLink = {
  href: string;
  label: string;
};
type FrontdoorRouteCard = {
  badge: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};
type WalkthroughStep = {
  step: string;
  title: string;
  body: string;
  href: string;
  cta: string;
};

type FrontdoorMessages = {
  localeLabel: string;
  localeNames: Record<AppLocale, string>;
  shell: {
    navigationLabel: string;
    quickNavigationLabel: string;
    routeGuideBadge: string;
    routeGuideBody: string;
    githubLabel: string;
    productLine: string;
    navLinks: {
      home: string;
      proof: string;
      docs: string;
      compare: string;
      walkthrough: string;
      workbench: string;
    };
    footerBadge: string;
    footerTitle: string;
    footerBody: string;
    footerLinks: {
      readme: string;
      docs: string;
      proofFaq: string;
      walkthrough: string;
    };
  };
  home: {
    heroTitle: string;
    heroBody: string;
    heroCtas: {
      proof: string;
      walkthrough: string;
      workbench: string;
    };
    heroSignals: string[];
    guidedPathsBadge: string;
    guidedPathsTitle: string;
    guidedPathsBody: string;
    guidedPaths: FrontdoorRouteCard[];
    valueCheckBadge: string;
    valueCheckTitle: string;
    valueCheckBody: string;
    valueCheckPoints: string[];
    proofSectionBadge: string;
    proofSectionTitle: string;
    proofSectionBody: string;
    proofSteps: FrontdoorProofStep[];
    differentiators: FrontdoorDifferentiator[];
    ecosystemBadge: string;
    ecosystemTitle: string;
    ecosystemBody: string;
    ecosystemBindings: FrontdoorBinding[];
    aiBadge: string;
    aiTitle: string;
    aiCapabilityLanes: FrontdoorAiLane[];
    audienceBadge: string;
    audienceTitle: string;
    audienceCards: FrontdoorAudienceCard[];
    compareBadge: string;
    compareTitle: string;
    compareBody: string;
    compareCta: string;
    comparePoints: FrontdoorComparePoint[];
    builderBadge: string;
    builderTitle: string;
    builderBody: string;
    surfaceMetaLabels: {
      audience: string;
      bestFor: string;
      readWhen: string;
      notFor: string;
    };
    builderEntryPoints: FrontdoorBuilderEntry[];
    machineReadableTitle: string;
    machineReadableNotes: string[];
    machineReadableSurfaces: FrontdoorMachineSurface[];
    nextStepBadge: string;
    nextStepTitle: string;
    nextStepBody: string;
    nextStepLinks: FrontdoorLink[];
    refusalTitle: string;
    refusalPoints: string[];
  };
  compare: {
    heroBadge: string;
    heroTitle: string;
    heroBody: string;
    ecosystemTitle: string;
    ecosystemBody: string;
    ecosystemBindings: FrontdoorBinding[];
    honestSplitTitle: string;
    decisionCardsTitle: string;
    decisionCardsBody: string;
    decisionCards: FrontdoorRouteCard[];
    honestSplitLabels: {
      goThereFirst: string;
      startHereInstead: string;
    };
    goThereFirst: string;
    startHereInstead: string;
    comparePoints: FrontdoorComparePoint[];
    cardLabels: {
      alternativeSuffix: string;
      betterFitThere: string;
      whyOpenUiDiffers: string;
      notBestFitHereIf: string;
      openOfficialSite: string;
    };
    refusalTitle: string;
    refusalPoints: string[];
    followUpTitle: string;
    followUpBody: string;
    followUpLinks: FrontdoorRouteCard[];
  };
  proof: {
    heroBadge: string;
    heroTitle: string;
    heroBody: string;
    heroCtas: {
      workbench: string;
      proofFaq: string;
    };
    contractTitle: string;
    contractBody: string;
    contractCards: Array<{ title: string; body: string }>;
    packetAnatomyTitle: string;
    packetAnatomyBody: string;
    proofSteps: FrontdoorProofStep[];
    featureTitle: string;
    featureBody: string;
    acceptanceTitle: string;
    acceptancePoints: string[];
    triageTitle: string;
    triageBody: string;
    triageCards: Array<{ title: string; body: string }>;
    reviewDeskTitle: string;
    reviewDeskBody: string;
    reviewDeskTags: [string, string, string];
    reviewDeskCards: Array<{ title: string; body: string }>;
    operatorGuideTitle: string;
    operatorGuideBody: string;
    operatorGuideSteps: Array<{ title: string; body: string }>;
    nextRoutesTitle: string;
    nextRoutesBody: string;
    nextRoutes: FrontdoorRouteCard[];
    notProvedTitle: string;
    notProvedBody: string;
    notProvedPoints: string[];
  };
  walkthrough: {
    heroBadge: string;
    heroTitle: string;
    heroBody: string;
    heroCtas: {
      proof: string;
      workbench: string;
    };
    steps: WalkthroughStep[];
    commandsTitle: string;
  };
  workbench: {
    badge: string;
    title: string;
    body: string;
    laneCount: string;
    primitives: string;
    newDraft: string;
    refresh: string;
    refreshing: string;
    activeWork: string;
    activeWorkBody: string;
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
    tabPipeline: string;
    tabReview: string;
    tabRelease: string;
    visibleSuffix: string;
    emptyTitle: string;
    emptyFilteredBody: string;
    emptyClearBody: string;
    nextBestAction: string;
    qualitySignal: string;
    qualitySignalBody: string;
    promoteVisible: string;
    promoteDefault: string;
    checkSignals: string;
    dialogPromptLabel: string;
    dialogPromptHint: string;
    dialogSurfaceLabel: string;
    dialogCancel: string;
    dialogSubmit: string;
    filterOptions: Array<{
      value: "all" | "active" | "blocked" | "done";
      label: string;
    }>;
    tabCopy: Record<
      "pipeline" | "review" | "release",
      { label: string; subtitle: string; cta: string }
    >;
    draftOptions: Array<{
      value: "landing" | "dashboard" | "checkout";
      label: string;
      hint: string;
    }>;
    dialogCopy: Record<
      "draft" | "pipeline" | "review" | "release" | "priority",
      {
        title: string;
        description: string;
        prompt: string;
        kind: "landing" | "dashboard" | "checkout";
      }
    >;
  };
};

const FRONTDOOR_MESSAGES: Record<AppLocale, FrontdoorMessages> = {
  "en-US": {
    localeLabel: "Language",
    localeNames: {
      "en-US": "EN",
      "zh-CN": "中文",
    },
    shell: {
      navigationLabel: "Front door navigation",
      quickNavigationLabel: "Front door quick navigation",
      routeGuideBadge: "Recommended order",
      routeGuideBody:
        "Start with the walkthrough, confirm trust in the proof desk, then open the operator desk only when you need the repo-local decision surface. Docs and compare stay one click away, but they are secondary to that first-screen path.",
      githubLabel: "GitHub",
      productLine:
        "UI/UX delivery companion with plugin-grade package surfaces for Codex and Claude Code, plus OpenClaw-side packaging work.",
      navLinks: {
        home: "Home",
        proof: "Proof",
        docs: "Docs",
        compare: "Compare",
        walkthrough: "Walkthrough",
        workbench: "Workbench",
      },
      footerBadge: "Brand layer",
      footerTitle:
        "OneClickUI.ai is the front door. OpenUI MCP Studio is the technical product.",
      footerBody:
        "The front door is allowed to be shorter and clearer. The technical name stays visible because the repo, MCP surface, proof story, and workspace workflow still belong to OpenUI MCP Studio.",
      footerLinks: {
        readme: "README",
        docs: "Docs hub",
        proofFaq: "Proof FAQ",
        walkthrough: "Walkthrough doc",
      },
    },
    home: {
      heroTitle: "Ship React UI into your workspace, with proof and review.",
      heroBody:
        "OneClickUI.ai is the front door for OpenUI MCP Studio: an MCP-native UI/UX delivery and review workflow that plans the change, writes real files, and now carries a plugin-grade starter/config/proof package for Codex, Claude Code, and OpenClaw-side packaging work. It still stays narrower and more honest than a generic coding-agent shell.",
      heroCtas: {
        walkthrough: "Take the first-minute walkthrough",
        proof: "See the 30-second proof",
        workbench: "Open the operator desk",
      },
      heroSignals: [...HERO_SIGNALS],
      guidedPathsBadge: "Start here",
      guidedPathsTitle:
        "Choose the route that matches how you are evaluating the product.",
      guidedPathsBody:
        "The front door should feel like a guide, not a brochure. Most newcomers should take the walkthrough first, confirm trust in the proof desk second, and only then drop into the operator desk.",
      guidedPaths: [
        {
          badge: "Recommended first stop",
          title:
            "Take the walkthrough when you want the shortest newcomer path through the product story.",
          body: "Go to /walkthrough if you want the recommended order from storefront to proof, docs, and the operator desk without deciding the route yourself.",
          href: "/walkthrough",
          cta: "Open the walkthrough",
        },
        {
          badge: "Need proof first",
          title: "Open the evidence desk when trust is your first question.",
          body: "Go to /proof if you want the shortest route through prompt, changed files, review bundle, acceptance, and operator meaning before you touch the interactive desk.",
          href: "/proof",
          cta: "Open the proof desk",
        },
        {
          badge: "Already in Codex or Claude Code",
          title:
            "Open the operator desk when you already think in packets, reviews, and next moves.",
          body: "Go to /workbench if you want the repo-owned decision surface that separates what the repo proves, what still needs a human call, and what should happen next.",
          href: "/workbench",
          cta: "Open the operator desk",
        },
        {
          badge: "Still deciding between tools",
          title:
            "Open the compare surface when you need the sharpest honest split.",
          body: "Go to /compare if you are sorting OpenUI against hosted builders and broader coding-agent traffic without pretending they all optimize for the same job.",
          href: "/compare",
          cta: "Open the compare surface",
        },
      ],
      valueCheckBadge: "30-second value check",
      valueCheckTitle: "Why this lands faster for Codex and Claude Code teams",
      valueCheckBody:
        "The front door stays intentionally narrow: generated UI should end in inspectable repo state and a real starter/config/proof package, not only model output.",
      valueCheckPoints: [
        "Prompt in, React + shadcn files out.",
        "Changed paths, review bundle, acceptance, and starter bundles stay visible.",
        "The strongest story is not autonomy. It is reviewer-ready delivery plus plug-and-play package surfaces.",
      ],
      proofSectionBadge: "30-second proof",
      proofSectionTitle: "Prompt, output, changed files, review bundle, proof.",
      proofSectionBody:
        "The front door should let a stranger understand the workflow in one screen. These are the five beats that make the product feel more trustworthy than a screenshot-only generator.",
      proofSteps: [...PROOF_STEPS],
      differentiators: [...DIFFERENTIATORS],
      ecosystemBadge: "Ecosystem fit",
      ecosystemTitle:
        "Built for MCP, Codex, and Claude Code first. Compared to broader coding-agent traffic second.",
      ecosystemBody:
        "This is where the AI heat has to stay honest. The product earns the MCP, Codex, and Claude Code language because the repo already ships a local stdio MCP tool surface and a plugin-grade package bundle around it. OpenClaw is now public-ready at the repo-owned artifact layer, but not a front-door category claim.",
      ecosystemBindings: [...ECOSYSTEM_BINDINGS],
      aiBadge: "AI that stays inside the workflow",
      aiTitle:
        "The useful AI story here is workflow copilot, risk explanation, and next-step guidance.",
      aiCapabilityLanes: [...AI_CAPABILITY_LANES],
      audienceBadge: "Best-fit audience",
      audienceTitle:
        "Built first for technical evaluators and React + shadcn teams.",
      audienceCards: Object.values(AUDIENCE_PRIORITY),
      compareBadge: "Honest compare",
      compareTitle:
        "Comparing against Bolt, Lovable, and v0 without pretending to be the same thing.",
      compareBody:
        "If you mainly want a hosted builder, their official products may fit better. If you want workspace-integrated UI shipping with review and proof, this is where OpenUI is narrower and more honest.",
      compareCta: "Open the compare surface",
      comparePoints: [...COMPARE_POINTS],
      builderBadge: "Builder entry path",
      builderTitle:
        "The current builder-facing order is fixed: local stdio MCP first, compatibility bridge second, repo-local workflow readiness third, with plugin-grade package surfaces layered on top.",
      builderBody:
        "Builder-facing traffic should be able to answer how to plug in, inspect the compatibility bridge, read the readiness packet, and adapt a starter bundle without mistaking any of them for publication or a hosted-platform promise.",
      surfaceMetaLabels: {
        audience: "Audience",
        bestFor: "Best for",
        readWhen: "Read when",
        notFor: "Not for",
      },
      builderEntryPoints: [...BUILDER_ENTRY_POINTS],
      machineReadableTitle: "Machine-readable discovery and SEO guardrails",
      machineReadableNotes: [
        "Public pages stay English-first, with en-US metadata and one canonical language path instead of scattered mixed-language literals.",
        "When the app is running, `/llms.txt`, `/api/frontdoor`, `/manifest.webmanifest`, `/sitemap.xml`, and `/robots.txt` should be read as one discovery chain instead of isolated routes.",
        "Homepage, Social Preview, published release assets, and Discussions seeding still remain operator-managed public surfaces.",
        "The repo still refuses fake hosted, write-anywhere API, or generic assistant claims. That honesty is part of the discoverability story, not a weakness.",
      ],
      machineReadableSurfaces: [...MACHINE_READABLE_SURFACES],
      nextStepBadge: "Next step",
      nextStepTitle: "Pick the path that matches how deep you want to go.",
      nextStepBody:
        "The front door should not force one journey. It should route a newcomer to the right depth quickly.",
      nextStepLinks: [...FRONTDOOR_LINKS],
      refusalTitle: "What the front door will not pretend",
      refusalPoints: [
        "It will not call this a generic AI agent, a no-code builder, or a fully autonomous software engineer.",
        "It will keep OpenUI MCP Studio as the technical main name, while treating OneClickUI.ai as the shorter front-door brand expression.",
        "It will keep docs, proof, and the interactive workbench one click away instead of hiding them behind marketing fog.",
        "It will not pretend that Homepage, Social Preview, or a published release bundle are already live unless remote settings prove it.",
      ],
    },
    compare: {
      heroBadge: "Honest compare",
      heroTitle:
        "Compare OpenUI with Bolt, Lovable, and v0 without pretending they solve the same job.",
      heroBody:
        "The official builder products lead with hosted speed and quick app creation. OpenUI MCP Studio should only claim a different lane: prompt-to-workspace UI shipping with proof, review, and acceptance.",
      ecosystemTitle:
        "How Codex, Claude Code, OpenHands, and OpenCode fit this story",
      ecosystemBody:
        "These names matter for discovery, but they do not all belong in the same semantic bucket.",
      ecosystemBindings: [...ECOSYSTEM_BINDINGS],
      honestSplitTitle: "The honest split",
      decisionCardsTitle: "Choose the lane before you choose the tool",
      decisionCardsBody:
        "This page works best as a traffic split: hosted-builder speed belongs there, repo-aware UI/UX delivery with proof and review belongs here.",
      decisionCards: [
        {
          badge: "Hosted-builder strength",
          title:
            "Use Bolt, Lovable, or v0 when hosted speed is the whole point.",
          body: "They are stronger when you mainly want fast prototype velocity and broad builder language without repo-aware review or acceptance as the main differentiator.",
          href: "https://bolt.new/",
          cta: "See hosted-builder context",
        },
        {
          badge: "OpenUI strength",
          title:
            "Use OpenUI when repo-aware proof and review are the real job.",
          body: "This repo becomes clearer when the team cares about changed files, review bundles, acceptance, proof, and a workspace-integrated path instead of a generic app-builder promise.",
          href: "/proof",
          cta: "See the proof path",
        },
        {
          badge: "Codex / Claude Code fit",
          title:
            "Use OpenUI when the team already lives inside Codex or Claude Code UI work.",
          body: "The MCP-native operator surface matters most when the team already thinks in repo packets, reviewer handoff, and staged UI delivery rather than one-shot generation.",
          href: "/workbench",
          cta: "Open the operator desk",
        },
      ],
      honestSplitLabels: {
        goThereFirst: "Go there first if",
        startHereInstead: "Start here instead if",
      },
      goThereFirst:
        "Go there first if you want the smoothest hosted builder experience and do not need workspace-integrated review artifacts yet.",
      startHereInstead:
        "Start here instead if you care about writing into the repo, seeing changed files, review bundle, acceptance, and proof before trust goes up.",
      comparePoints: [...COMPARE_POINTS],
      cardLabels: {
        alternativeSuffix: "alternative",
        betterFitThere: "Better fit there",
        whyOpenUiDiffers: "Why OpenUI differs",
        notBestFitHereIf: "Not the best fit here if",
        openOfficialSite: "Open official site",
      },
      refusalTitle: "What this compare page refuses to do",
      refusalPoints: [
        "It does not invent weaknesses for other products.",
        "It does not claim OpenUI is a better generic AI agent.",
        "It only points to the lane where OpenUI already has real evidence: workspace integration, review bundle, acceptance, proof, and feature-level delivery packaging.",
      ],
      followUpTitle: "What to open next after the compare page",
      followUpBody:
        "A compare page should route you into the right proof depth instead of ending as a dead-end opinion sheet.",
      followUpLinks: [
        {
          badge: "Trust",
          title: "Open the proof desk",
          body: "Use this when you want the shortest honest explanation of what the repo already proves and what still belongs to a human reviewer.",
          href: "/proof",
          cta: "Go to proof",
        },
        {
          badge: "Hands-on",
          title: "Open the operator desk",
          body: "Use this when you already accept the category split and want to feel the decision-and-execution surface directly.",
          href: "/workbench",
          cta: "Go to workbench",
        },
        {
          badge: "Orientation",
          title: "Open the walkthrough",
          body: "Use this when you need the four-stop guided route from front door to proof, workbench, and docs.",
          href: "/walkthrough",
          cta: "Go to walkthrough",
        },
      ],
    },
    proof: {
      heroBadge: "30-second proof",
      heroTitle: "Read the proof split before you trust the packet",
      heroBody:
        "This is the evidence desk. It separates what the repo already proves, what still needs human judgment, and which route the operator should take next.",
      heroCtas: {
        workbench: "Open the operator desk",
        proofFaq: "Open the proof FAQ",
      },
      contractTitle: "Proof contract",
      contractBody:
        "Use this desk when you want the shortest honest answer to three questions: what this route proves, what it does not prove, and which route you should open next.",
      contractCards: [
        {
          title: "Best for",
          body: "Evaluators and builders who need to sort repo-owned evidence before they touch the operator desk or talk about release readiness.",
        },
        {
          title: "What it proves here",
          body: "Prompt, changed files, review bundle, acceptance, feature packet structure, and the default proof target can be traced on repo-owned surfaces.",
        },
        {
          title: "What it does not prove",
          body: "It does not turn repo-local readiness into Git landing, remote deployment, or final design sign-off. Those still need a human decision.",
        },
      ],
      packetAnatomyTitle: "Proof packet anatomy",
      packetAnatomyBody:
        "The point is not only to say that a packet exists. The point is to show which evidence layers the packet leaves behind and how a reviewer can inspect them.",
      proofSteps: [...PROOF_STEPS],
      featureTitle: "What feature-level delivery now leaves behind",
      featureBody:
        "The product difference is not only that it runs. It is that reviewers can inspect both the feature package and each route’s local evidence.",
      acceptanceTitle: "What acceptance really means here",
      acceptancePoints: [
        "Automatic checks stay automatic. Human judgement stays human.",
        "A feature package can still end in manual_review_required when cross-route consistency or shared-surface review still needs a human.",
        "That is a trust signal, not a weakness. It means the workflow is refusing to pretend certainty it does not have.",
      ],
      triageTitle: "Sort the proof into three buckets before you move.",
      triageBody:
        "A proof desk should separate repo-proved evidence, reviewer-owned judgment, and the next operator move instead of leaving them mixed inside one story.",
      triageCards: [
        {
          title: "Repo-proved now",
          body: "Prompt, changed files, review bundle, acceptance output, and the default proof target are already visible on repo-owned surfaces.",
        },
        {
          title: "Still needs human judgment",
          body: "Shared-surface polish, design quality, and final ship confidence still belong to a reviewer even when the packet looks green.",
        },
        {
          title: "What the operator should do next",
          body: "Continue to the workbench when the evidence agrees. Mark the slice repo-local ready only when the packet, proof signal, and acceptance story still agree. Commit, push, and PR landing remain a separate operator step.",
        },
      ],
      reviewDeskTitle:
        "What the repo already proves and what still needs a reviewer",
      reviewDeskBody:
        "Use this surface to separate repo-owned proof from reviewer-owned judgment before you decide whether to continue, stop, or escalate.",
      reviewDeskTags: [
        "Already proved",
        "Still needs a human",
        "Next operator move",
      ],
      reviewDeskCards: [
        {
          title: "Already evidenced",
          body: "You can trace the brief, changed files, review bundle, acceptance result, and proof target without leaving the repo-owned surface.",
        },
        {
          title: "Human judgment still required",
          body: "Shared-surface consistency, design polish, and release confidence still belong to a reviewer even when the artifact packet is green.",
        },
        {
          title: "Use this to choose the next move",
          body: "If the evidence is coherent, continue into the workbench and record the slice as repo-local ready. If the packet disagrees with itself, stop here and escalate to manual review before any Git landing step.",
        },
      ],
      operatorGuideTitle: "Turn the proof split into the next move",
      operatorGuideBody:
        "This page should help an evaluator decide whether to continue, review, or stop instead of hiding that choice inside prose.",
      operatorGuideSteps: [
        {
          title: "Continue to the workbench",
          body: "Do this when the evidence is coherent and you want to move the next reviewable packet through review or release. Repo-local completion comes first; Git landing comes second.",
        },
        {
          title: "Return to the proof FAQ",
          body: "Do this when you need the command-level meaning of a proof lane before making a call.",
        },
        {
          title: "Escalate to manual review",
          body: "Do this when acceptance is partial, shared-surface risk is visible, or the artifacts disagree on readiness.",
        },
      ],
      nextRoutesTitle: "Choose the next route with the same honesty boundary",
      nextRoutesBody:
        "The proof desk should hand you to the next surface deliberately: operate, compare, or read deeper docs without blurring those jobs together.",
      nextRoutes: [
        {
          badge: "Operate",
          title: "Open the operator desk",
          body: "Go here when the evidence agrees and you want the next repo-owned move, pause rule, and promotion action in one place.",
          href: "/workbench",
          cta: "Open the operator desk",
        },
        {
          badge: "Re-check category fit",
          title: "Open the compare page",
          body: "Go here when you still need to decide whether OpenUI's repo-aware proof lane is the right fit compared to hosted builders or broader agent traffic.",
          href: "/compare",
          cta: "Open compare",
        },
        {
          badge: "Read deeper docs",
          title: "Open the proof FAQ",
          body: "Go here when you want command-level proof semantics and repository-level boundaries before making a human review call.",
          href: SITE_BRAND.docs.proofFaq,
          cta: "Open the proof FAQ",
        },
      ],
      notProvedTitle: "Not proved here",
      notProvedBody:
        "Think of this strip like the small print on a contract. It is the part that stops the proof desk from over-claiming.",
      notProvedPoints: [
        "No live hosted builder, live ops console, or deployed canonical site truth is being claimed here.",
        "Repo-local ready is not the same thing as committed, pushed, merged, or GitHub-verified landed.",
        "Final UX polish, cross-surface sign-off, and release confidence still need a reviewer or operator call.",
      ],
    },
    walkthrough: {
      heroBadge: "First-minute walkthrough",
      heroTitle:
        "Take the guided route from first impression to proof, then the operator desk.",
      heroBody:
        "This page is not a docs fragment. It is the shortest guided tour from the front door, to proof, to the workbench, and then to one real repo-owned command.",
      heroCtas: {
        proof: "Open the proof desk",
        workbench: "Open the operator desk",
      },
      steps: [
        {
          step: "Step 1",
          title: "Read the front door like a product evaluator",
          body: "Start on the homepage, then jump into proof or compare depending on whether you are validating trust or market fit.",
          href: "/",
          cta: "Open the front door",
        },
        {
          step: "Step 2",
          title: "See the proof desk first",
          body: "The proof desk explains what the repo has already proved, what still needs a human call, and why the operator desk comes later.",
          href: "/proof",
          cta: "Open the proof desk",
        },
        {
          step: "Step 3",
          title: "Open the operator desk once the proof meaning is clear",
          body: "The workbench is the repo-local simulated operator desk inside apps/web. It is where smoke, e2e, visual QA, and UI/UX audits land after the proof contract is clear.",
          href: "/workbench",
          cta: "Open the operator desk",
        },
        {
          step: "Step 4",
          title: "Read the longer walkthrough notes and run one real command",
          body: "The app front door and the repo docs should tell the same truth. Use the longer walkthrough notes, then run a real repo-owned command before you treat the story as proven.",
          href: SITE_BRAND.docs.walkthrough,
          cta: "Open the long-form walkthrough",
        },
      ],
      commandsTitle: "Run one real command before you decide how deep to go",
    },
    workbench: {
      badge: "Product workbench",
      title: "Operate, review, and prepare the next UI packet in one place.",
      body: "A repo-local operator desk for briefs, QA, and readiness signals with complete interaction state coverage.",
      laneCount: "3 active lanes",
      primitives: "Stable UI primitives only",
      newDraft: "New draft",
      refresh: "Refresh",
      refreshing: "Refreshing",
      activeWork: "Active work",
      activeWorkBody: "Tasks currently moving through the active lane.",
      blocked: "Blocked",
      blockedBody:
        "Dependencies that need decisions before this lane can move forward.",
      completed: "Completed",
      completedBody:
        "Recently finished items ready to reuse or hand off downstream.",
      commandBarTitle: "Command bar",
      commandBarBody:
        "Search work items, focus a status lane and reset back to the full board instantly.",
      previewRecovery: "Preview recovery",
      reset: "Reset",
      searchLabel: "Search",
      searchPlaceholder: "Search briefs, owners or review notes",
      clearSearch: "Clear search query",
      filterLabel: "Filter",
      tabPipeline: "Pipeline",
      tabReview: "Review",
      tabRelease: "Release",
      visibleSuffix: "visible",
      emptyTitle: "No work items match this view.",
      emptyFilteredBody:
        "Try a broader search or reset the status filter to bring the full queue back.",
      emptyClearBody:
        "The current lane is clear right now. Start a new task to populate it.",
      nextBestAction: "Next best action",
      qualitySignal: "Quality signal",
      qualitySignalBody:
        "Keyboard paths, state coverage and CTA labels are ready for regression checks.",
      promoteVisible: "Promote top visible priority",
      promoteDefault: "Promote top priority",
      checkSignals: "Check signals",
      dialogPromptLabel: "Prompt",
      dialogPromptHint:
        "{count}/16 minimum characters with the target user flow.",
      dialogSurfaceLabel: "Surface",
      dialogCancel: "Cancel",
      dialogSubmit: "Queue draft",
      filterOptions: [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "blocked", label: "Blocked" },
        { value: "done", label: "Done" },
      ],
      tabCopy: {
        pipeline: {
          label: "Pipeline",
          subtitle:
            "Shape prompts, briefs and generation scopes before they hit review.",
          cta: "Create brief",
        },
        review: {
          label: "Review",
          subtitle:
            "Keep QA, microcopy and interaction polish moving in one visible lane.",
          cta: "Start audit",
        },
        release: {
          label: "Release",
          subtitle:
            "Track gates, readiness, and launch follow-ups without pretending the packet is already Git-landed.",
          cta: "Review readiness",
        },
      },
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
          title: "Create a review-ready UI brief",
          description:
            "Package a new request with a clear surface area so review and readiness checks can start faster.",
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
          title: "Prepare readiness checks",
          description:
            "Prepare a readiness-oriented brief that validates smoke, visual QA, and rollout signals.",
          prompt:
            "Build a readiness brief with smoke coverage, rollback notes and final visual checks.",
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
    },
  },
  "zh-CN": {
    localeLabel: "语言",
    localeNames: {
      "en-US": "EN",
      "zh-CN": "中文",
    },
    shell: {
      navigationLabel: "前门导航",
      quickNavigationLabel: "前门快捷导航",
      routeGuideBadge: "推荐顺序",
      routeGuideBody:
        "默认先走上手路径，再到证据台确认可信度，最后在真正需要做 repo-local 判断时才进入工作台。Docs 和对比页保留一跳可达，但不是第一屏的主路线。",
      githubLabel: "GitHub",
      productLine: "面向 Codex 与 Claude Code 团队的 UI/UX 交付伙伴。",
      navLinks: {
        home: "首页",
        proof: "证据",
        docs: "文档",
        compare: "对比",
        walkthrough: "上手路径",
        workbench: "工作台",
      },
      footerBadge: "品牌层次",
      footerTitle: "OneClickUI.ai 是前门表达，OpenUI MCP Studio 是技术主产品。",
      footerBody:
        "前门可以更短、更易传播，但技术名必须持续可见，因为仓库、MCP surface、proof 叙事和 workspace workflow 仍然属于 OpenUI MCP Studio。",
      footerLinks: {
        readme: "README",
        docs: "文档总览",
        proofFaq: "证据 FAQ",
        walkthrough: "上手路径文档",
      },
    },
    home: {
      heroTitle: "把 React UI 写进你的工作区，并把证据与评审保留在流程里。",
      heroBody:
        "OneClickUI.ai 是 OpenUI MCP Studio 的前门：它不是泛化开发代理外壳，而是一条 MCP-native 的 UI/UX 交付与评审工作流，会先规划变更、再写入真实文件，并在你信任结果之前把变更文件、评审结论和验收状态摆在台面上。现在它还带着一套可直接拿来用的 starter bundle、proof loop 和故障排查入口，最适合已经在 Codex 或 Claude Code 里推进仓库工作的团队，以及需要评估 OpenClaw public-ready 包装的人。",
      heroCtas: {
        walkthrough: "按上手路径走一遍",
        proof: "查看 30 秒证据链",
        workbench: "打开工作台",
      },
      heroSignals: [
        "把改动写进真实工作区",
        "把评审与验收留在流程里",
        "适配 React + shadcn + MCP 工作流",
        "附带 starter bundle、proof loop 和故障排查",
        "更像 UI/UX 交付伙伴，而不是通用代理外壳",
        "可通过 stdio MCP 接入 Codex 与 Claude Code",
      ],
      guidedPathsBadge: "先从这里开始",
      guidedPathsTitle: "按你当前最在意的问题，选一条最短路线。",
      guidedPathsBody:
        "前门应该像导览，不该像说明书。大多数新访客先走上手路径，再去证据台，最后才在真正需要做 repo-local 判断时进入工作台，会更不容易迷路。",
      guidedPaths: [
        {
          badge: "推荐第一站",
          title: "如果你想按最省脑力的顺序理解产品，就先走上手路径。",
          body: "去 `/walkthrough`，按 storefront → proof → docs → operator desk 的顺序看，不必自己先猜应该点哪一个入口。",
          href: "/walkthrough",
          cta: "打开上手路径",
        },
        {
          badge: "先看可信度",
          title: "如果你第一反应是“凭什么信它”，先打开证据台。",
          body: "去 `/proof`，先看提示词、变更文件、评审包、验收和操作者含义是怎么串成一条证据链的。",
          href: "/proof",
          cta: "打开证据台",
        },
        {
          badge: "已经在用 Codex / Claude Code",
          title: "如果你已经习惯在仓库里推进包、评审和下一步，就直接进工作台。",
          body: "去 `/workbench`，感受这块把“仓库已经证明什么”“还要人拍板什么”“下一步该做什么”分开的决策台。",
          href: "/workbench",
          cta: "打开工作台",
        },
        {
          badge: "还在选型",
          title: "如果你在比较路线，而不是立刻上手，就先看对比页。",
          body: "去 `/compare`，快速判断 OpenUI 和 hosted builder、以及更宽泛的 coding-agent 流量，到底是不是同一类东西。",
          href: "/compare",
          cta: "打开对比页",
        },
      ],
      valueCheckBadge: "30 秒价值检查",
      valueCheckTitle: "为什么 Codex / Claude Code 团队会更快感到它的价值",
      valueCheckBody:
        "前门故意只做一个窄而真的承诺：生成出的 UI 必须落到可检查的仓库状态里，并且附带真实 starter/config/proof 包，而不是只剩模型输出。",
      valueCheckPoints: [
        "输入需求，输出 React + shadcn 文件。",
        "变更路径、评审包、验收状态和 starter bundle 始终可见。",
        "这里最强的故事不是自治，而是可交给评审者接手的交付链加上即插即用的分发包。",
      ],
      proofSectionBadge: "30 秒证据链",
      proofSectionTitle: "提示词、产出、变更文件、评审包、证据链。",
      proofSectionBody:
        "前门应该让陌生人一屏就看懂这条工作流。下面这五步就是它为什么比“只给截图”的生成器更值得信任。",
      proofSteps: [
        {
          eyebrow: "1. 提示词",
          title: "从明确需求简报开始，而不是只求一张好看的截图。",
          body: "前门展示的是仓库已经真实支持的路径：一个界面需求进入一个理解工作区上下文的交付流程。",
          snippet:
            "Build a pricing surface with a stronger hero, trust row, feature comparison, and review-ready acceptance notes.",
        },
        {
          eyebrow: "2. 输出",
          title: "生成的是准备落盘的 React + shadcn 输出。",
          body: "这里不是把自己包装成纯 hosted builder。真正承诺的是：为你已经拥有的仓库生成可被接入的 UI。",
          snippet:
            "apps/web/app/pricing/page.tsx\napps/web/components/generated/PricingCards.tsx\napps/web/components/generated/FeatureComparison.tsx",
        },
        {
          eyebrow: "3. 工作区状态",
          title: "在信任上升之前，先把改动路径亮出来。",
          body: "评审者能先看到哪些路径被动过，哪些共享组件或布局开始受到影响。",
          snippet:
            "workspace-profile.json\nchange-plan.json\nfeature-flow-plan.json",
        },
        {
          eyebrow: "4. 评审与证明",
          title: "最后落在 review bundle、acceptance 和 proof 上。",
          body: "它和普通生成器最根本的差异，是 proof、review、acceptance 一直留在流程里，而不是事后猜。",
          snippet:
            "feature-flow-review-bundle.md\nfeature-flow-acceptance-result.json\nsmoke:e2e / visual:qa / repo:doctor",
        },
      ],
      differentiators: [
        {
          title: "先接工作区，再谈自动化",
          body: "产品最诚实的说法，是它会把改动写进真实工作区，而不是假装替代整套工程体系。",
        },
        {
          title: "先给证据，再谈信任",
          body: "Smoke、review、acceptance、proof 都保持可见，这样首页和产品真实工作方式不会打架。",
        },
        {
          title: "MCP-native 工作流",
          body: "它围绕 MCP server 和 repo-integrated delivery path 构建，所以对 builder 和评估者比纯聊天 demo 更有意义。",
        },
        {
          title: "Feature-level delivery 正在变厚",
          body: "feature flow 现在会保留 route-level artifact 和 feature-level review package，这比“一键页面魔法”更诚实。",
        },
        {
          title: "UI/UX vertical companion",
          body: "它补的是 Codex / Claude Code 在 UI/UX 交付、评审和 proof 语境下的可见工作流，而不是去扮演无边界的万能 agent。",
        },
      ],
      ecosystemBadge: "生态位",
      ecosystemTitle:
        "先服务 MCP、Codex、Claude Code，再拿来和更宽泛的 coding-agent 流量做比较。",
      ecosystemBody:
        "AI 热度词在这里必须老实使用。仓库现在已经有 local stdio MCP surface 和围绕它的插件级分发包，所以可以讲 MCP、Codex、Claude Code；OpenClaw 现在是 repo-owned public-ready 包装，但还不是 front-door 主类目；更宽泛的 coding-agent 语言仍然只能作为 comparison-only 语境。",
      ecosystemBindings: [
        {
          name: "MCP",
          classification: "当前主绑定",
          body: "这里说 MCP 不是装饰词。仓库真实交付的是本地 stdio MCP server，而且它仍然是主要工具入口。",
        },
        {
          name: "Codex",
          classification: "当前主绑定",
          body: "当目标是 prompt-to-workspace 的 React UI 交付，并且希望 proof、review、acceptance 始终可见时，Codex 是自然客户端。",
        },
        {
          name: "Claude Code",
          classification: "当前主绑定",
          body: "Claude Code 走的是同一条 stdio MCP 路径，适合想用模型辅助 UI 发货，但又不愿把流程压扁成通用助手故事的团队。",
        },
        {
          name: "OpenHands",
          classification: "次级对比语境",
          body: "它适合作为更广义 coding-agent 生态对照，但仍然次于这里更窄、更专注的 UI-delivery + proof 故事。",
        },
        {
          name: "OpenCode",
          classification: "次级对比语境",
          body: "它与开源 coding-agent 流量有关，但不是这个仓库当前最应该占据的主类目。",
        },
        {
          name: "OpenClaw",
          classification: "不要作为前门绑定",
          body: "除非未来仓库证据发生实质变化，否则“assistant”这条语义车道仍然不是它的正确 frontdoor 类别。",
        },
      ],
      aiBadge: "留在工作流里的 AI",
      aiTitle:
        "这里最有用的 AI 不是“万能代理”，而是 workflow copilot、风险解释器和 next-step 指南。",
      aiCapabilityLanes: [
        {
          title: "Workflow copilot",
          body: "AI 在这里最有价值的工作，是先帮你看工作区、计划改动、把路由级 blast radius 说清，而不是装成万能聊天框。",
        },
        {
          title: "风险与审批解释器",
          body: "Acceptance pack 和 review bundle 会说明哪些检查真自动、哪些还需要人，为什么流程拒绝假确定性。",
        },
        {
          title: "维护者下一步助手",
          body: "Repo workflow summary 和 readiness packet 会把本地与 GitHub 状态翻译成“下一步该做什么”，而不是把维护者丢进原始 CLI 噪音里。",
        },
      ],
      audienceBadge: "最适合的人群",
      audienceTitle: "第一优先是技术评估者，以及 React + shadcn 团队。",
      audienceCards: [
        {
          title: "技术评估者和 React + shadcn 前端团队",
          body: "他们最关心的是：流程是否真的写进 repo、是否有可审查 artifact、是否能经得起 smoke 和 proof gate。",
        },
        {
          title: "MCP builder 与在 Bolt / Lovable / v0 之外找替代方案的团队",
          body: "他们更可能在意工作区现实、review surface，以及比 hosted generation 更可检查的交付路径。",
        },
        {
          title: "并不以“帮我随便做个 app”为首要流量目标",
          body: "当前产品不是 no-code builder，不是通用 coding agent，也不是 one-click hosted SaaS shell。",
        },
      ],
      compareBadge: "诚实对比",
      compareTitle:
        "和 Bolt、Lovable、v0 对比，但不假装大家在解决完全同一个问题。",
      compareBody:
        "如果你主要想要托管式 builder，它们可能更合适；如果你要的是把 UI 需求写回工作区，并让评审与证据始终留在流程里，那 OpenUI 的定位会更窄也更诚实。",
      compareCta: "打开对比页",
      comparePoints: [
        {
          tool: "Bolt",
          officialUrl: "https://bolt.new/",
          officialPositioning:
            "Chat-to-app builder for websites, apps, and prototypes.",
          bestFor: "更适合追求 hosted builder 速度和广义建站叙事",
          openUiEdge:
            "更适合需要工作区写入、proof、review、repo-aware delivery surface 的团队",
          notFor:
            "如果你真正想要的是最顺滑的 hosted app-builder 体验，这里不是最优解",
        },
        {
          tool: "Lovable",
          officialUrl: "https://lovable.dev/",
          officialPositioning:
            "AI app builder focused on fast app and website creation.",
          bestFor: "更适合快速生成 app/site、工程仪式感更轻的场景",
          openUiEdge:
            "更适合重视 review bundle、acceptance 思维和 MCP-native workflow 语义的团队",
          notFor:
            "如果你更想要 no-code-first 的速度，而不是可审查交付证据，这里不是最佳入口",
        },
        {
          tool: "v0",
          officialUrl: "https://v0.app/",
          officialPositioning:
            "AI build surface for agents, apps, and websites.",
          bestFor: "更适合极速 web UI 灵感探索和模板势能",
          openUiEdge:
            "更适合需要 prompt-to-workspace delivery、proof 和 feature-level package structure 的团队",
          notFor:
            "如果你只想做设计探索，不关心 workspace write path 或 acceptance surface，这里不是最优",
        },
      ],
      builderBadge: "Builder 接入口",
      builderTitle:
        "当前 builder-facing 顺序已经锁定：先本地 stdio MCP，再 compatibility bridge，第三才是 repo-local workflow readiness。",
      builderBody:
        "builder-facing 流量应该能快速回答“我怎么接进去、怎么查兼容桥、怎么读 readiness 包”，而不是把这些 current surface 误读成 hosted 平台承诺。",
      surfaceMetaLabels: {
        audience: "适合谁",
        bestFor: "最适合做什么",
        readWhen: "何时阅读",
        notFor: "不适合拿来当什么",
      },
      builderEntryPoints: [
        {
          step: "第 1 步",
          title: "从 Codex 或 Claude Code 连接",
          audience: "已经通过 MCP-aware 编码客户端工作的 builder 团队",
          bestFor: "用最短路径接入 prompt-to-workspace 交付、证据台和评审面",
          readWhen:
            "当你的第一个问题是“怎么把 OpenUI 接到 Codex 或 Claude Code 上”时，先从这里开始。",
          notFor:
            "把它误解成 hosted builder 接入页，或通用 agent marketplace 入口",
          body: "当前最真实的集成故事从 stdio MCP server 开始，而不是 hosted API 承诺。想要真实 prompt-to-workspace delivery，就先走 MCP client setup。",
          cta: "打开 MCP 接入指南",
          href: "https://github.com/xiaojiou176-open/openui-mcp-studio/blob/main/docs/discovery-surfaces.md",
        },
        {
          step: "第 2 步",
          title: "查看兼容 API 契约",
          audience: "bridge consumer、审查者，以及做契约核对的集成方",
          bestFor:
            "read-only HTTP projection、兼容桥审查和 consumer-side 契约检查",
          readWhen:
            "当 MCP 主入口已经清楚，而你需要看 schema / adapter / compatibility shape 时，再读这一层。",
          notFor: "把 compatibility bridge 误说成正式 hosted API 或 SDK 承诺",
          body: "当你需要 read-only HTTP projection 做 review、contract check 或 bridge consumer 时，再看 OpenAPI compatibility document。",
          cta: "打开 OpenAPI 契约",
          href: "https://github.com/xiaojiou176-open/openui-mcp-studio/blob/main/docs/contracts/openui-mcp.openapi.json",
        },
        {
          step: "第 3 步",
          title: "使用 repo workflow bridge",
          audience: "维护者，以及要读 repo-local readiness 信号的评估者",
          bestFor:
            "读取本地加 GitHub readiness 的证据包，同时保持 read-only operator 语义",
          readWhen:
            "当问题从“怎么执行”变成“当前 readiness / handoff / checks 状态如何”时，再打开这条面。",
          notFor: "假装仓库会自己改远端状态、自动落 PR，或替代 GitHub 运维动作",
          body: "当你需要本地 + GitHub readiness 的证据包，但又不想假装仓库会自行修改远端状态时，就用 raw summary 和 maintainer-ready packet。",
          cta: "打开 readiness 文档",
          href: "https://github.com/xiaojiou176-open/openui-mcp-studio/blob/main/docs/index.md",
        },
      ],
      machineReadableTitle: "机读发现面与 SEO 护栏",
      machineReadableNotes: [
        "公开面继续 English-first：默认 `en-US`，但现在已经有真实的中英切换，不再只能把双语要求写在政策里。",
        "当 app 正在运行时，`/llms.txt`、`/api/frontdoor`、`/manifest.webmanifest`、`/sitemap.xml` 和 `/robots.txt` 应该被当成同一条发现链，而不是彼此孤立的路线。",
        "Homepage、Social Preview、已发布 release 资产，以及 Discussions 首批 thread 仍然是 operator-managed 的公开面。",
        "仓库仍然拒绝假 hosted、假 write-anywhere API、假通用助手故事。这份诚实本身就是 discoverability 的一部分。",
      ],
      machineReadableSurfaces: [
        {
          title: "LLM 与 agent 摘要",
          label: "llms.txt",
          cta: "打开 llms.txt",
          href: "/llms.txt",
          audience: "LLM client、索引系统，以及只想先看最短真相层的 builder",
          bestFor:
            "用 English-first 方式读取 route 角色、builder 顺序和当前边界",
          readWhen:
            "当 agent、搜索系统，或 builder 只想先看最短产品摘要时，先读这层。",
          notFor: "互动式 proof、operator 操作，或长文档命令语义",
          body: "给 Codex、Claude Code、MCP client 和 AI 索引器看的最短 English-first 前门摘要。",
        },
        {
          title: "Builder JSON 快照",
          label: "frontdoor JSON",
          cta: "打开 frontdoor JSON",
          href: "/api/frontdoor",
          audience: "builder tooling、agent 和关心契约的集成方",
          bestFor:
            "一次读到 routes、bindings、audience fit、i18n posture 和 boundary metadata",
          readWhen:
            "当产品句子已经清楚，而你需要结构化 discovery contract 来接工具或做集成时，再读这层。",
          notFor:
            "发明新 runtime，或把仓库说成已经有 hosted builder control plane",
          body: "机器可读的 routes、bindings、AI capability lanes、i18n posture 和 builder-facing boundary 快照。",
        },
        {
          title: "Web manifest",
          label: "manifest.webmanifest",
          cta: "打开 web manifest",
          href: "/manifest.webmanifest",
          audience: "浏览器、安装入口，以及 crawler-adjacent 的发现面消费者",
          bestFor:
            "查看 route shortcut 和 install/discovery metadata 是否仍然遵守同一份产品角色",
          readWhen:
            "当你需要浏览器安装 metadata 和 route shortcut，而不是完整 builder/proof 解释时，再读这层。",
          notFor: "把 app 说成已部署 canonical hosted truth，或拿它替代证据台",
          body: "给浏览器、评估者和安装流看的发现元数据，无需抓整仓库。",
        },
        {
          title: "Sitemap",
          label: "sitemap.xml",
          cta: "打开 sitemap",
          href: "/sitemap.xml",
          audience: "crawler 和在意 canonical route 暴露范围的维护者",
          bestFor: "查看人类前门 routes 的 crawl map",
          readWhen:
            "当你只想看 crawl map 和 canonical route 暴露范围时，再读这层。",
          notFor: "详细表达产品边界，或代替 route-role metadata",
          body: "当 NEXT_PUBLIC_SITE_URL 配置好后，给人类前门 routes 提供规范 crawl map。",
        },
        {
          title: "Robots policy",
          label: "robots.txt",
          cta: "打开 robots policy",
          href: "/robots.txt",
          audience: "crawler 和检查当前是否允许索引的维护者",
          bestFor: "查看与 sitemap 和 canonical gating 配套的 crawl policy",
          readWhen:
            "当你要确认当前是否应该允许抓取，而不是继续读长版产品叙事时，再读这层。",
          notFor: "解释 route 角色、builder 顺序，或替代 proof/docs",
          body: "与 sitemap 暴露和 NEXT_PUBLIC_SITE_URL 索引开关保持一致的 crawl policy。",
        },
      ],
      nextStepBadge: "下一步",
      nextStepTitle: "按你想看的深度选择入口。",
      nextStepBody:
        "前门不该逼所有人走同一条路线，而是要把陌生访客尽快送到最合适的深度。",
      nextStepLinks: [
        { href: "/proof", label: "30 秒证据链" },
        { href: "/compare", label: "替代方案与对比" },
        { href: "/walkthrough", label: "第一分钟上手" },
        { href: "/workbench", label: "打开操作者工作台" },
      ],
      refusalTitle: "前门不会假装自己已经是这些东西",
      refusalPoints: [
        "它不会把自己叫成 generic AI agent、no-code builder 或 fully autonomous software engineer。",
        "它会继续把 OpenUI MCP Studio 作为技术主名，而把 OneClickUI.ai 当作更短的前门表达。",
        "它会把 docs、proof 和 interactive workbench 保持在一跳可达的位置，而不是藏在营销雾里。",
        "除非 remote settings 真正证明已经 live，否则它不会假装 Homepage、Social Preview 或公开 release bundle 已经全部上线。",
      ],
    },
    compare: {
      heroBadge: "诚实对比",
      heroTitle:
        "把 OpenUI 和 Bolt、Lovable、v0 放在一起看，但不假装它们在做同一份工作。",
      heroBody:
        "这些官方 builder 产品主打 hosted speed 与快速成型。OpenUI MCP Studio 这轮只能诚实地主张另一条赛道：prompt-to-workspace UI shipping，以及 proof、review、acceptance 持续在场。",
      ecosystemTitle:
        "Codex、Claude Code、OpenHands、OpenCode 在这条叙事里各自扮演什么角色",
      ecosystemBody:
        "这些名字对发现路径很重要，但它们不该被塞进同一个语义桶里。",
      ecosystemBindings: [
        {
          name: "MCP",
          classification: "当前主绑定",
          body: "这里说 MCP 不是装饰词。仓库真实交付的是本地 stdio MCP server，而且它仍然是主要工具入口。",
        },
        {
          name: "Codex",
          classification: "当前主绑定",
          body: "当目标是 prompt-to-workspace 的 React UI 交付，并且希望 proof、review、acceptance 始终可见时，Codex 是自然客户端。",
        },
        {
          name: "Claude Code",
          classification: "当前主绑定",
          body: "Claude Code 走的是同一条 stdio MCP 路径，适合想用模型辅助 UI 发货，但又不愿把流程压扁成通用助手故事的团队。",
        },
        {
          name: "OpenHands",
          classification: "次级对比语境",
          body: "它适合作为更广义 coding-agent 生态对照，但仍然次于这里更窄、更专注的 UI-delivery + proof 故事。",
        },
        {
          name: "OpenCode",
          classification: "次级对比语境",
          body: "它与开源 coding-agent 流量有关，但不是这个仓库当前最应该占据的主类目。",
        },
        {
          name: "OpenClaw",
          classification: "不要作为前门绑定",
          body: "除非未来仓库证据发生实质变化，否则“assistant”这条语义车道仍然不是它的正确 frontdoor 类别。",
        },
      ],
      honestSplitTitle: "诚实的边界线",
      decisionCardsTitle: "先选车道，再选工具",
      decisionCardsBody:
        "这页最有价值的时候，不是在赢所有类目，而是在你点错入口之前就把分流边界说清：托管式速度归那边，repo-aware 的 UI/UX 交付与证据链归这边。",
      decisionCards: [
        {
          badge: "托管式 builder 强项",
          title: "如果你要的就是托管速度，那就优先看 Bolt、Lovable、v0。",
          body: "当目标只是尽快做出原型，并不把仓库内评审、验收和可追溯交付当成主卖点时，它们更强。",
          href: "https://bolt.new/",
          cta: "查看托管式 builder 语境",
        },
        {
          badge: "OpenUI 强项",
          title: "如果你在意仓库内证据链与评审链，OpenUI 才开始变得更有意义。",
          body: "这个仓库最清楚的价值，不是“更会生成”，而是把变更文件、评审包、验收和证据链一起保留在工作流里。",
          href: "/proof",
          cta: "查看证据路径",
        },
        {
          badge: "Codex / Claude Code 贴合点",
          title:
            "如果团队已经在 Codex 或 Claude Code 里做 UI 交付，OpenUI 的感觉会更明显。",
          body: "MCP-native 的操作者工作台，只有在你本来就用包、评审和下一步动作来组织仓库工作时，才会显得真正有产品感。",
          href: "/workbench",
          cta: "打开工作台",
        },
      ],
      honestSplitLabels: {
        goThereFirst: "先去它们那里，如果",
        startHereInstead: "改从这里开始，如果",
      },
      goThereFirst:
        "如果你更在意最顺滑的托管式 builder 体验，且暂时不关心工作区里的评审 artifact，可以先去看它们。",
      startHereInstead:
        "如果你在意写回仓库、看见 changed files、review bundle、acceptance 和 proof，再从这里开始会更合适。",
      comparePoints: [
        {
          tool: "Bolt",
          officialUrl: "https://bolt.new/",
          officialPositioning:
            "Chat-to-app builder for websites, apps, and prototypes.",
          bestFor: "更适合追求 hosted builder 速度和广义建站叙事",
          openUiEdge:
            "更适合需要工作区写入、proof、review、repo-aware delivery surface 的团队",
          notFor:
            "如果你真正想要的是最顺滑的 hosted app-builder 体验，这里不是最优解",
        },
        {
          tool: "Lovable",
          officialUrl: "https://lovable.dev/",
          officialPositioning:
            "AI app builder focused on fast app and website creation.",
          bestFor: "更适合快速生成 app/site、工程仪式感更轻的场景",
          openUiEdge:
            "更适合重视 review bundle、acceptance 思维和 MCP-native workflow 语义的团队",
          notFor:
            "如果你更想要 no-code-first 的速度，而不是可审查交付证据，这里不是最佳入口",
        },
        {
          tool: "v0",
          officialUrl: "https://v0.app/",
          officialPositioning:
            "AI build surface for agents, apps, and websites.",
          bestFor: "更适合极速 web UI 灵感探索和模板势能",
          openUiEdge:
            "更适合需要 prompt-to-workspace delivery、proof 和 feature-level package structure 的团队",
          notFor:
            "如果你只想做设计探索，不关心 workspace write path 或 acceptance surface，这里不是最优",
        },
      ],
      cardLabels: {
        alternativeSuffix: "替代方案",
        betterFitThere: "它们更适合的场景",
        whyOpenUiDiffers: "OpenUI 的差异点",
        notBestFitHereIf: "如果你主要要这个，这里可能不适合",
        openOfficialSite: "打开官方站",
      },
      refusalTitle: "这个对比页拒绝做的事",
      refusalPoints: [
        "不凭空捏造别家产品的弱点。",
        "不声称 OpenUI 是更好的 generic AI agent。",
        "只强调 OpenUI 当前已经有真实证据的那条线：workspace integration、review bundle、acceptance、proof，以及 feature-level delivery packaging。",
      ],
      followUpTitle: "看完对比页之后，下一步该去哪",
      followUpBody: "对比页不该停在观点上，而应该把你送进正确的下一层深度。",
      followUpLinks: [
        {
          badge: "看可信度",
          title: "去证据台",
          body: "当你要先弄清仓库已经证明了什么、还有什么必须由人工评审补完时，先去 `/proof`。",
          href: "/proof",
          cta: "去证据台",
        },
        {
          badge: "看操作感",
          title: "去工作台",
          body: "当你已经接受这个产品类别，想直接感受它的决策与执行台，就去 `/workbench`。",
          href: "/workbench",
          cta: "去工作台",
        },
        {
          badge: "看导览",
          title: "去上手路径",
          body: "当你还需要一条从首页、证据台、工作台到文档的四站式导览，就去 `/walkthrough`。",
          href: "/walkthrough",
          cta: "去上手路径",
        },
      ],
    },
    proof: {
      heroBadge: "30 秒证据链",
      heroTitle: "先看清证明边界，再决定要不要信这份包。",
      heroBody:
        "这页是证据台，不是说明书。它的作用是先分清仓库已经证明了什么、哪些仍然要人拍板，以及操作者下一步应该走去哪里。",
      heroCtas: {
        workbench: "打开操作者工作台",
        proofFaq: "打开证据 FAQ",
      },
      contractTitle: "证据台合同",
      contractBody:
        "把这块台面理解成一张说明卡：它先回答“这页最适合谁、这里到底证明什么、这里明确不证明什么”，再把你送去下一站。",
      contractCards: [
        {
          title: "最适合谁",
          body: "最适合先确认仓库证据层的评估者和 builder，而不是直接把当前状态讲成已经发布的人。",
        },
        {
          title: "这里能证明什么",
          body: "提示词、变更文件、评审包、验收结果、feature packet 结构，以及默认证据目标，都能在仓库自有表面上串起来。",
        },
        {
          title: "这里明确不证明什么",
          body: "它不会把 repo-local 已就绪说成 Git 已落袋，也不会替代最终设计签字、远端部署或发布判断。",
        },
      ],
      packetAnatomyTitle: "证据包剖面图",
      packetAnatomyBody:
        "关键不是“有一份包”，而是这份包到底留下哪些可检查层。下面这块就像拆包图，告诉评审者该看哪些证据。",
      proofSteps: [
        {
          eyebrow: "1. 提示词",
          title: "从明确需求简报开始，而不是只求一张好看的截图。",
          body: "前门展示的是仓库已经真实支持的路径：一个界面需求进入一个理解工作区上下文的交付流程。",
          snippet:
            "Build a pricing surface with a stronger hero, trust row, feature comparison, and review-ready acceptance notes.",
        },
        {
          eyebrow: "2. 输出",
          title: "生成的是准备落盘的 React + shadcn 输出。",
          body: "这里不是把自己包装成纯 hosted builder。真正承诺的是：为你已经拥有的仓库生成可被接入的 UI。",
          snippet:
            "apps/web/app/pricing/page.tsx\napps/web/components/generated/PricingCards.tsx\napps/web/components/generated/FeatureComparison.tsx",
        },
        {
          eyebrow: "3. 工作区状态",
          title: "在信任上升之前，先把改动路径亮出来。",
          body: "评审者能先看到哪些路径被动过，哪些共享组件或布局开始受到影响。",
          snippet:
            "workspace-profile.json\nchange-plan.json\nfeature-flow-plan.json",
        },
        {
          eyebrow: "4. 评审与证明",
          title: "最后落在评审包、验收结论和证据链上。",
          body: "它和普通生成器最根本的差异，是证据、评审和验收一直留在流程里，而不是事后猜。",
          snippet:
            "feature-flow-review-bundle.md\nfeature-flow-acceptance-result.json\nsmoke:e2e / visual:qa / repo:doctor",
        },
      ],
      featureTitle: "feature 级交付现在会留下什么",
      featureBody:
        "产品差异不只是“它能跑”。更关键的是 reviewer 能同时检查整个 feature package 和每条 route 的本地证据。",
      acceptanceTitle: "这里的验收到底在说明什么",
      acceptancePoints: [
        "自动检查保持自动，人的判断仍然归人来做。",
        "一个 feature package 仍可能停在 manual_review_required，因为跨 route 一致性或 shared surface 还需要人工确认。",
        "这不是弱点，而是信号：工作流拒绝假装自己拥有并不存在的确定性。",
      ],
      triageTitle: "先把证据分成三层，再决定要不要继续。",
      triageBody:
        "证据台的价值不是把所有东西堆在一起，而是先分清：仓库已经证明了什么、哪些还要人来拍板、操作者下一步该走哪条路。",
      triageCards: [
        {
          title: "仓库已经证明的部分",
          body: "提示词、变更文件、评审包、验收结果和默认证据目标，都已经能在仓库自有表面上串起来。",
        },
        {
          title: "仍然需要人工判断的部分",
          body: "共享面打磨、设计质量和最终放行信心，仍然要交给评审者，而不是被一份绿色结果代替。",
        },
        {
          title: "操作者现在该做什么",
          body: "当证据彼此一致时，就去工作台推进下一份包，并把它记成 repo-local 已就绪；commit、push 和 PR 落袋仍然是后续动作。当验收结论、证据信号和状态标签互相打架时，就先停下来转人工评审。",
        },
      ],
      reviewDeskTitle: "先分清仓库已经证明了什么，哪些还要评审者拍板",
      reviewDeskBody:
        "这里要回答的不是故事讲得好不好，而是：哪些证据已经齐了、哪些仍要人来判断、下一步该往哪走。",
      reviewDeskTags: ["已证实", "仍需人工", "下一步"],
      reviewDeskCards: [
        {
          title: "已经有的证据",
          body: "你可以在这页直接串起 brief、变更文件、评审包、验收结果和默认证据目标，而不用离开仓库表面。",
        },
        {
          title: "仍然需要人工判断的部分",
          body: "共享面一致性、设计打磨和发布信心，仍然应该由评审者来拍板，就算 artifact packet 看起来是绿的。",
        },
        {
          title: "用它来决定下一步",
          body: "如果证据互相一致，就继续去工作台推进下一份评审包，并把“本地已完成”与“已经落袋”分开记录；如果证据互相打架，就停在这里转人工评审。",
        },
      ],
      operatorGuideTitle: "把这层证明边界转成下一步动作",
      operatorGuideBody:
        "这页应该帮助评估者判断“继续 / 审查 / 暂停”，而不是把决定埋在长段说明里。",
      operatorGuideSteps: [
        {
          title: "继续进入工作台",
          body: "当证据链已经连起来，而且你准备把下一份可审查包推进到 review 或 release 时，去工作台继续。先完成 repo-local 判断，再决定 Git 落袋动作。",
        },
        {
          title: "回到证据 FAQ",
          body: "如果你还需要先弄清某条 proof lane 到底证明什么、不证明什么，就先回 FAQ 再做判断。",
        },
        {
          title: "升级到人工 review",
          body: "如果验收仍不完整、共享面风险已经可见，或 artifact 之间对 readiness 的结论不一致，就先转人工评审，不要提前把这份包说成已经落袋。",
        },
      ],
      nextRoutesTitle: "沿着同一条诚实边界，继续走下一站",
      nextRoutesBody:
        "证据台不该把所有工作混成一件事。它应该把你明确送去操作、重做类别判断，或继续读深一层文档。",
      nextRoutes: [
        {
          badge: "继续操作",
          title: "打开工作台",
          body: "当证据已经对齐，且你想把下一份包的推进、暂停规则和提升动作放在一个地方处理时，就去 `/workbench`。",
          href: "/workbench",
          cta: "打开工作台",
        },
        {
          badge: "重新判断产品贴合度",
          title: "打开对比页",
          body: "当你还在判断 OpenUI 的仓库内证据链路线，和 hosted builder 或更宽泛 agent 流量到底是不是同一类东西时，就去 `/compare`。",
          href: "/compare",
          cta: "打开对比页",
        },
        {
          badge: "继续看文档",
          title: "打开证据 FAQ",
          body: "当你需要命令级别的证明语义和仓库级边界，再决定是否交给人工评审时，就去长文档。",
          href: SITE_BRAND.docs.proofFaq,
          cta: "打开证据 FAQ",
        },
      ],
      notProvedTitle: "这里不证明这些事",
      notProvedBody:
        "把它理解成合同里的小字部分。正是这些边界，保证证据台不会把自己吹成比现状更大的承诺。",
      notProvedPoints: [
        "这里没有把产品说成 live hosted builder、live ops console 或已经验证上线的 canonical site truth。",
        "repo-local 已就绪，不等于已经 commit、push、merge，也不等于远端 GitHub 状态已经闭环。",
        "最终 UX 打磨、跨页面统一性和放行信心，仍然要交给评审者或操作者来拍板。",
      ],
    },
    walkthrough: {
      heroBadge: "一分钟上手",
      heroTitle: "从第一眼理解，到先看证据台、再进操盘台的最短导览路线。",
      heroBody:
        "这页不是文档切片，而是一条带路路线：从 front door、到 proof、到 workbench、再到一条真实命令，让人尽快感到这是一款产品而不是一堆说明。",
      heroCtas: {
        proof: "打开证据台",
        workbench: "打开操作者工作台",
      },
      steps: [
        {
          step: "第 1 步",
          title: "先把首页当成产品评估入口看",
          body: "从首页开始，再根据你在验证“可信度”还是“市场定位”，跳去 proof 或 compare。",
          href: "/",
          cta: "打开首页",
        },
        {
          step: "第 2 步",
          title: "先看证据台",
          body: "证据台先解释仓库已经证明了什么、还要人来拍板什么，以及为什么操作者工作台应该排在后面。",
          href: "/proof",
          cta: "打开证据台",
        },
        {
          step: "第 3 步",
          title: "等证据意义清楚后，再打开操作者工作台",
          body: "workbench 是 apps/web 里的 repo-local 模拟操作者工作台；smoke、e2e、visual QA、UI/UX audit 都是在你先看懂 proof 以后，才该在这里汇总。",
          href: "/workbench",
          cta: "打开工作台",
        },
        {
          step: "第 4 步",
          title: "读长版上手说明，再跑一条真实命令",
          body: "app front door 和 repo docs 应该说同一套真相。先读长版上手说明，再跑一条真实命令，别只凭文案就当成已经证实。",
          href: SITE_BRAND.docs.walkthrough,
          cta: "打开长版上手说明",
        },
      ],
      commandsTitle: "先跑一条真实命令，再决定要不要继续深入",
    },
    workbench: {
      badge: "产品工作台",
      title: "在同一个界面里整理、评审并准备下一份 UI 包。",
      body: "这是一个 repo-local 的操作者工作台，用来放 briefs、QA 和 readiness signals，并覆盖完整交互状态。",
      laneCount: "3 条活跃泳道",
      primitives: "仅使用稳定 UI primitives",
      newDraft: "新建草稿",
      refresh: "刷新",
      refreshing: "刷新中",
      activeWork: "进行中",
      activeWorkBody: "当前泳道里正在推进的事项。",
      blocked: "阻塞中",
      blockedBody: "这些依赖还需要先做决策，泳道才能继续推进。",
      completed: "已完成",
      completedBody: "最近完成、可以复用或继续交接的事项。",
      commandBarTitle: "命令栏",
      commandBarBody: "搜索 work items、聚焦状态泳道、或一键恢复完整看板。",
      previewRecovery: "预览恢复态",
      reset: "重置",
      searchLabel: "搜索",
      searchPlaceholder: "搜索 brief、负责人或评审备注",
      clearSearch: "清空搜索",
      filterLabel: "筛选",
      tabPipeline: "管线",
      tabReview: "评审",
      tabRelease: "发布",
      visibleSuffix: "可见",
      emptyTitle: "当前视图没有匹配的工作项。",
      emptyFilteredBody: "扩大搜索范围，或重置状态筛选，把完整队列带回来。",
      emptyClearBody: "当前泳道已经清空。新建一条任务即可重新填充它。",
      nextBestAction: "下一步最优动作",
      qualitySignal: "质量信号",
      qualitySignalBody:
        "键盘路径、状态覆盖和 CTA 标签已经准备好进入回归检查。",
      promoteVisible: "提升当前可见最高优先级",
      promoteDefault: "提升最高优先级",
      checkSignals: "检查信号",
      dialogPromptLabel: "提示词",
      dialogPromptHint: "{count}/16 个字符，且要包含目标用户流程。",
      dialogSurfaceLabel: "目标界面",
      dialogCancel: "取消",
      dialogSubmit: "加入草稿队列",
      filterOptions: [
        { value: "all", label: "全部" },
        { value: "active", label: "进行中" },
        { value: "blocked", label: "阻塞中" },
        { value: "done", label: "已完成" },
      ],
      tabCopy: {
        pipeline: {
          label: "管线",
          subtitle: "在任务进入评审前，先把 prompt、brief 和生成范围捏清楚。",
          cta: "创建 brief",
        },
        review: {
          label: "评审",
          subtitle: "让 QA、微文案和交互打磨始终停留在同一个可见泳道里。",
          cta: "开始审查",
        },
        release: {
          label: "发布",
          subtitle:
            "跟踪 gates、就绪信号和后续动作，但不把这份包提前说成已经发布或 Git 落袋。",
          cta: "检查就绪状态",
        },
      },
      draftOptions: [
        {
          value: "landing",
          label: "Landing 页面",
          hint: "Hero、proof、CTA 和 narrative flow。",
        },
        {
          value: "dashboard",
          label: "Dashboard",
          hint: "指标、表格、状态和 power-user controls。",
        },
        {
          value: "checkout",
          label: "Checkout",
          hint: "高信任支付、校验与成功态流程。",
        },
      ],
      dialogCopy: {
        draft: {
          title: "创建一个可评审的 UI brief",
          description:
            "把新需求包成一个边界清楚的 brief，让 review 和 readiness 检查能更快开始。",
          prompt:
            "Build an executive workbench with search, tabs, dialog and complete state coverage.",
          kind: "dashboard",
        },
        pipeline: {
          title: "创建管线 brief",
          description: "把当前管线泳道整理成一个交付边界明确的生成 brief。",
          prompt:
            "Draft a production-ready pipeline brief with prompt goals, state coverage and ship criteria.",
          kind: "dashboard",
        },
        review: {
          title: "启动评审审查",
          description:
            "为当前泳道创建一个聚焦 copy、可访问性和交互边界的审查计划。",
          prompt:
            "Create a review audit checklist covering accessibility, copy and interaction edge cases.",
          kind: "dashboard",
        },
        release: {
          title: "准备就绪检查",
          description:
            "准备一个面向 readiness 的 brief，涵盖 smoke、visual QA 和 rollout signals。",
          prompt:
            "Build a readiness brief with smoke coverage, rollback notes and final visual checks.",
          kind: "checkout",
        },
        priority: {
          title: "提升最高优先级任务",
          description:
            "把当前最高优先级事项整理成一个不丢上下文的 polished launch brief。",
          prompt:
            "Promote the current top-priority task into a launch-ready brief.",
          kind: "dashboard",
        },
      },
    },
  },
};

export function getFrontdoorMessages(
  locale: AppLocale = DEFAULT_LOCALE,
): FrontdoorMessages {
  return FRONTDOOR_MESSAGES[locale] ?? FRONTDOOR_MESSAGES[DEFAULT_LOCALE];
}
