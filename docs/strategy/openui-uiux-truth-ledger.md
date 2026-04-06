# OpenUI UI/UX Truth Ledger

> Canonical shared truth ledger for Round 2 convergence.
> This document reconciles the current dirty worktree with the completed
> Round 1 Worker A / B / C slices.
> It does not promote later lanes into current truth, and it does not treat
> repo-local completion as delivery landed.

Current wave follow-through now lives in:

- [`docs/strategy/openui-uiux-vertical-gap-ledger.md`](./openui-uiux-vertical-gap-ledger.md)
- [`docs/strategy/openui-builder-surface-formalization-ledger.md`](./openui-builder-surface-formalization-ledger.md)
- [`docs/strategy/openui-external-activation-ledger.md`](./openui-external-activation-ledger.md)
- [`docs/strategy/openui-ecosystem-productization-ledger.md`](./openui-ecosystem-productization-ledger.md)

## 1. Why This Exists

Three things are true at the same time:

1. the current dirty worktree already contains real Round 1 progress
2. the worker-scoped notes describe that progress in narrower slices
3. the shared truth docs must now describe the same repo-local reality in one
   consistent voice

This ledger is the shared wording layer for that convergence.

## 2. Truth Split

Use this split before reading any claim:

| Layer | What it means now | What it does not mean |
| --- | --- | --- |
| Repo-local truth | the current dirty worktree contains the described surface | not yet staged, committed, pushed, merged, or reflected on GitHub |
| Shared docs truth | `README.md`, `docs/index.md`, this ledger, and the coordination docs describe the same current repo-local slice | not a substitute for machine-readable registries or remote settings |
| Machine-readable or governance mirrors | OpenAPI, frontdoor JSON, manifest, docs registry, and public-surface governance encode support truth | not automatically the canonical product story if they lag the current dirty slice |
| Delivery landed | branch / PR / remote state reflects the approved slice | not implied by local files or local docs alone |
| Later lanes | ideas that remain intentionally deferred | not current promises |

## 3. Current Product Sentence

The shortest honest product sentence is still:

> OpenUI MCP Studio is a local MCP-first UI delivery and review workbench for
> turning UI briefs into React and shadcn changes, then keeping proof, review,
> and acceptance visible before a human decides to land them.

The current product surface in `apps/web` is:

- `/` for the front door
- `/compare` for positioning and decision routing
- `/proof` for the proof desk
- `/walkthrough` for the first-minute route
- `/workbench` for the operator and review surface

This is a stronger repo-local product surface than the older "prompt to files"
story, but it is still not a hosted builder, generic coding-agent platform,
plugin marketplace, SDK product, or write-capable remote MCP system.

## 4. Round 1 Writeback

### 4.1 Worker A — UI/UX audit and style-rubric truth

What is current in the dirty worktree:

- the repo already had real UI/UX review capability before this wave
- Round 1 / Worker A hardened that review layer with:
  - a shared style-pack and rubric contract under
    `services/mcp-server/src/uiux/audit-foundation.ts`
  - structured `audit` framing in
    `services/mcp-server/src/tools/uiux-review.ts`
  - workspace hotspots, category rollups, and next-step output in
    `tooling/uiux-ai-audit.ts`
- the current shared category vocabulary is:
  - `hierarchy`
  - `consistency`
  - `design_system`
  - `interaction_clarity`
  - `accessibility`

What this means:

- the audit layer is more product-like and more reusable than before
- style packs are current review inputs, not just implied visual taste
- workspace audit hotspots and next-step hints are current repo-local truth

What still remains separate:

- shared docs-registry closeout is not completed here
- style packs are not being promoted into a runtime theme-switching promise

Scoped evidence anchor:

- [`docs/architecture/uiux-engine-round1.md`](../architecture/uiux-engine-round1.md)

### 4.2 Worker B — front door, proof, workbench, and bilingual truth

What is current in the dirty worktree:

- the product surface across `/`, `/compare`, `/proof`, `/walkthrough`, and
  `/workbench` is materially thicker than the older front-door baseline
- high-signal bilingual product copy is real through centralized message and
  workbench copy sources
- the workbench now reads more like an operator desk, while `/proof` reads more
  like a proof desk and routing surface

What this means:

- the repo-local product surface is now better at explaining:
  - what the repo already proves
  - what still needs a human decision
  - what the next operator move should be
- the repo can honestly speak as a UI/UX vertical companion for Codex,
  Claude Code, and other MCP-first workflows

What still remains separate:

- machine-readable mirrors may still need follow-through if shared wording moved
  faster than the mirror layer
- this is not a claim that every public-support surface is already fully synced
  or that the slice has landed remotely

Scoped evidence anchor:

- [`docs/architecture/frontdoor-surface-round1-worker-b.md`](../architecture/frontdoor-surface-round1-worker-b.md)

### 4.3 Worker C — builder-facing CLI, public export, OpenAPI, and skills starter truth

What is current in the dirty worktree:

- local stdio MCP remains the primary builder surface
- the compatibility OpenAPI bridge remains current
- the repo-local workflow packet remains current through
  `openui_repo_workflow_summary` and `npm run repo:workflow:ready`
- the dirty slice also contains:
  - a root repo-local CLI entrypoint
  - a curated public export layer under `services/mcp-server/src/public/`
  - a repo-side skills starter under `examples/skills/`

What this means:

- the builder surface is easier to inspect and explain from the repo itself
- the root CLI, public export allowlist, and starter examples are current
  repo-local truth
- those surfaces are still framed as repo-side builder support, not as shipped
  marketplace, SDK, or hosted API product lanes

What still remains separate:

- public-surfaces governance and docs-registry follow-through are shared
  closeout work, not done here
- the repo-side skills starter is not being promoted into a current public
  product contract yet

Scoped evidence anchor:

- [`docs/architecture/builder-surface-round1-worker-c.md`](../architecture/builder-surface-round1-worker-c.md)

## 5. Repo-Local Complete Vs Delivery Landed

This ledger must keep these two judgments separate:

- `repo-local complete`
  - the current dirty slice, shared wording, and local verification story agree
    on the same surface
- `delivery landed`
  - the approved slice has been staged, committed, pushed, and represented in
    branch or PR state

This convergence wave only writes the first judgment into shared truth.
It does not claim the second.

## 6. Evidence Anchors

### Worker archive anchors

- `.agents/Conversations/📷-UI生成器（结束）-thread-Worker-A-019d524a-part-01-rounds-1-1-2026-04-03_01-38-43.md`
- `.agents/Conversations/📷-UI生成器（结束）-thread-Worker-B-019d524a-part-01-rounds-1-1-2026-04-03_01-39-00.md`
- `.agents/Conversations/📷-UI生成器（结束）-thread-Worker-C-019d524a-part-01-rounds-1-1-2026-04-03_01-38-53.md`

### Current dirty-slice anchors

- `services/mcp-server/src/tools/uiux-review.ts`
- `services/mcp-server/src/uiux/audit-foundation.ts`
- `tooling/uiux-ai-audit.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/compare/page.tsx`
- `apps/web/app/proof/page.tsx`
- `apps/web/app/walkthrough/page.tsx`
- `apps/web/app/workbench/page.tsx`
- `apps/web/app/workbench-data.ts`
- `apps/web/lib/i18n/messages.ts`
- `services/mcp-server/src/public/index.ts`
- `services/mcp-server/src/public/builder-surface.ts`
- `services/mcp-server/src/public/server.ts`
- `services/mcp-server/src/public/workflow-summary.ts`
- `tooling/cli/openui.mjs`
- `package.json`

## 7. Shared Governance Gaps Still Outside This Ledger

These are honest follow-through items, not current claims:

- the scoped Round 1 docs still need shared registration in
  `tooling/contracts/docs-registry.json`
- the current builder-facing public layer still needs shared registration in
  `contracts/governance/public-surfaces.json`
- machine-readable mirrors remain support truth and may still need a parity
  sweep if wording and structured mirrors diverge
- delivery landed still requires a separate Git / PR / remote-state action

## 8. Later Lanes Still Not Current

The following remain later lanes, not current truth:

- formal public skills productization
- plugin or marketplace packaging
- SDK packaging
- hosted API packaging
- write-capable remote MCP
- any claim that remote Git landing is already done

## 9. Reading Rule After This Sync

After this Round 2 convergence:

- use this ledger for the shared wording
- use the worker-scoped docs for slice-level detail
- use machine-readable registries for support truth
- use local Git plus GitHub state for landed truth

Do not flatten those layers back into one sentence.
