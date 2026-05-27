# UIUX Engine Round 1

## Why this document exists

This is the scoped artifact for Round 1 / Worker A.
It does not reopen Prompt 1-5 truth layers, and it does not replace the shared
truth ledger.

Its job is narrower:

- record what the current UI/UX audit engine already had
- record what this round actually hardened
- mark what is still partial
- keep later lanes clearly out of scope

## Audit Engine Gap Ledger

### Already existed before this round

- `openui_review_uiux` already provided page/snippet-level HTML review with
  heuristic and model-assisted findings
- `tooling/uiux-ai-audit.ts` already provided repo-local frontend audit with
  Gemini-backed issue extraction and strict-gate semantics
- `tooling/uiux-a11y-engine.ts` already provided deterministic axe-based a11y
  verification
- `tooling/visual-qa.ts` already provided screenshot baseline regression
- `apps/web/app/globals.css` and `apps/web/tailwind.config.ts` already exposed
  a real semantic-token surface for the default app

### Hardened in this round

- UI/UX audit now has a shared style-pack and rubric contract under
  `services/mcp-server/src/uiux/audit-foundation.ts`
- `audit-foundation.ts` is the single source of truth for Round 1 style packs,
  rubric categories, audit frame summaries, and next-step output
- style packs are no longer implied only through `globals.css`; they are now
  explicit review inputs with reusable contract fields
- `openui_review_uiux` now returns a structured `audit` frame in addition to
  the legacy `review` payload
- repo/workspace audit now produces structured category rollups, file hotspots,
  and next-step recommendations instead of only issue counts plus free-form log
  output
- hierarchy / consistency / design-system / interaction-clarity /
  accessibility are now first-class audit categories

### Still partial after this round

- style packs currently steer audit framing and prompt context; they do not yet
  re-theme the app or introduce a runtime design-token switcher
- workspace audit is still review/report oriented, not an auto-remediation
  engine
- `visual-qa` remains a separate visual-baseline lane; it is adjacent to the
  rubric system, not fully fused into one report packet yet
- model-backed UI/UX audit remains advisory relative to deterministic repo
  gates

### Explicitly not done here

- no frontdoor rewrite
- no broad i18n surface rewrite
- no formal Skills productization
- no plugin / marketplace surface
- no SDK packaging
- no hosted API
- no write-capable remote MCP

## Style System / Aesthetic Rubric Summary

### Current style-pack contract

The shared contract intentionally stays small and audit-oriented.

Each style pack now defines:

- `id`, `label`, `summary`
- `emphasis`
- `tokenMode`
- `themeModes`
- `surfaceTokens`
- `focusRingToken`
- `spacingScalePx`
- `radiusTokens`
- `hierarchyRule`
- `primaryActionRule`
- `rubric`

### Current packs

- `openui-studio`
  - balanced, proof-first default for frontdoor / proof / workbench review
- `openui-operator-desk`
  - denser preset for operator/reviewer-heavy surfaces where next-step clarity
    needs stronger emphasis

### Who can consume it now

- `services/mcp-server/src/tools/uiux-review.ts`
  - consumes the style pack as audit context and returns a structured audit
    frame
- `tooling/uiux-ai-audit.ts`
  - consumes the style pack as workspace-audit framing and prints structured
    category / hotspot / next-step output

### What the rubric categories mean

- `hierarchy`
  - can a user tell what matters first
- `consistency`
  - do spacing, states, and responsive behavior feel like one system
- `design_system`
  - are semantic tokens and shared primitives still in control
- `interaction_clarity`
  - does the UI tell the operator what to do now, what is blocked, and what
    can wait
- `accessibility`
  - are semantics, focus, contrast, and target size handled as a first-class
    constraint

## Current Truth After Round 1

- the repository already had real UI/UX review capability before this wave
- this round did not rebuild that capability from zero
- this round made the audit layer more product-like by giving it:
  - a reusable style-pack contract
  - a shared rubric vocabulary
  - structured audit framing for page and workspace scopes
  - explicit next-step output

## Round 2 Handoff Notes

- treat the style-pack/rubric layer as current truth, not as a speculative TODO
- if Round 2 wants broader product-surface reuse, it should consume the current
  category vocabulary instead of inventing a second naming system
- if shared docs or public product truth need updating later, do that in the
  designated closeout wave rather than from this scoped artifact

## Shared Change Proposals

- none required for this round
