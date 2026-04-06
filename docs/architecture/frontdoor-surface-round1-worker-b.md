# Frontdoor Surface Round 1 Worker B

## Scope

This note records the Round 1 / Worker B surface push only.
It does not reopen Prompt 1-4 truth, later ecosystem lanes, or Worker A / Worker C ownership.

## Product Surface Gap Ledger

| Surface                    | Before this round                                                                                   | Reinforced in this round                                                                                                                                                                                      | Still partial                                                                                                             | Owner next                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/` home front door        | Already truthful, but the route hierarchy still felt flat and section-heavy                         | Added guided entry cards so newcomers can choose proof, compare, or workbench without guessing; strengthened the “why Codex / Claude Code users feel this faster” framing through the localized message layer | Machine-readable surfaces still do not mirror these richer route hints by design                                          | Worker B / Round 2 only if more public-surface guidance is needed         |
| `/compare`                 | Honest, but still read more like a static explanation page than a decision aid                      | Added a high-signal decision-card band and next-route follow-up cards so the compare page can route people into proof, workbench, or walkthrough                                                              | The page still does not own benchmark-style feature matrices, which would risk drifting into broader productization lanes | Worker B if a later surface pass is explicitly requested                  |
| `/proof`                   | Clearer than before, but still closer to a long explanation page than an evidence desk              | Reordered the page so the triage split lands earlier and added a next-route band that points operators toward workbench, compare, or deeper proof docs                                                        | Proof still depends on repo-owned docs for long-form command semantics                                                    | Worker B / Round 2 only if more proof-specific UI is requested            |
| `/walkthrough`             | Had the right four stops, but behaved like a doc slice                                              | Turned each stop into a navigable route card with explicit CTA actions                                                                                                                                        | Still intentionally lightweight; it is a route guide, not a full tutorial center                                          | Worker B if future guided onboarding expands                              |
| `/workbench`               | Already strong, but the top of the page still felt closer to a generic dashboard shell              | Added an explicit “read this desk in 15 seconds” posture strip, a direct proof-desk shortcut in the header, and cleaner bilingual operator copy in high-signal action paths                                   | Workbench still uses mocked operator data and remains a repo-local product surface rather than a live ops console         | Worker B / Worker C only if builder-facing execution surfaces widen later |
| Bilingual high-signal copy | The system existed, but some high-signal Chinese strings still mixed English nouns too aggressively | Cleaned the most visible cross-page copy in home guidance, compare routing, and workbench operator language                                                                                                   | Long-tail descriptive fragments still contain intentional English-first terms where product vocabulary remains technical  | Worker B later; not a blocker now                                         |

## Highest-Signal Bilingual Holes Closed

- Home route guidance now has localized entry-card copy instead of leaving the “where should I go next?” layer mostly English-shaped.
- Compare routing now has Chinese decision cards and follow-up CTAs that feel like product navigation, not translated commentary.
- Workbench Chinese copy now reads more naturally in the operator decision split, next-step guidance, and top posture strip.
- High-signal duplicate product nouns such as “generic agent shell”, “review bundle”, and “brief” were reduced on the public/product surface where they most harmed first impression.

## What Was Intentionally Left Out

- No changes to `/api/frontdoor`, `/llms.txt`, `manifest`, OpenAPI, CLI, Skills, SDK, plugin, or hosted API surfaces.
- No changes to Worker A's UI/UX review engine or style-rubric code.
- No expansion into builder-surface productization or remote write-capable MCP promises.
- No shared truth-doc rewrite in `README.md`, `docs/index.md`, or `docs/strategy/openui-uiux-truth-ledger.md`.

## Shared Change Proposals

### 1. Docs registry sync for scoped docs

- Why it matters:
  `npm run docs:check` currently fails because first-party docs under `docs/architecture/` are missing from `tooling/contracts/docs-registry.json`.
- Minimum shared fix:
  register both this Worker B note and the concurrent `docs/architecture/uiux-engine-round1.md` artifact in `tooling/contracts/docs-registry.json`.
- Why I did not apply it here:
  the registry is a shared cross-worker file outside Worker B's allowed write domain.

### 2. Visual baseline refresh for the new front door

- Why it matters:
  `npm run visual:qa` now reports large diffs on all three homepage baselines because the front door hierarchy materially changed.
- Minimum shared fix:
  approve the new homepage layout, then update the three visual goldens in `tests/visual-golden/` from the latest artifact packet.
- Why I did not apply it here:
  visual goldens were explicitly outside Worker B's write domain for this round.

## Current Judgment

- Worker B round objective: materially advanced.
- Product-feel delta: real.
- Truth drift risk: controlled.
- Remaining blockers inside Worker B write domain: none found after the current implementation pass.
- Remaining blockers outside Worker B write domain:
  docs-registry sync, unrelated typecheck drift in Worker A files, unrelated full-test timeout in `tests/ship-delivery-intelligence.test.ts`, and homepage visual-baseline refresh.
