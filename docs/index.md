# Documentation Index

This page is the shared routing layer for the current repository truth.

English is the canonical source of truth for repository governance and
maintenance.

## Round 2 Reading Rule

Read the current repository through four layers:

1. repo-local product and builder truth
2. shared docs wording
3. machine-readable or governance mirrors
4. delivery landed / remote state

Those layers are related, but they are not the same thing.

This index is about the first three layers.
It does not claim that the current repo-local slice has already been committed,
pushed, merged, or reflected in remote GitHub state.

## For First-Time Visitors

Start here if your question is "what does this project do for me right now?"

- [`README.md`](../README.md)
- product routes inside `apps/web`
  - `/` = product front door
  - `/compare` = decision and positioning surface
  - `/proof` = proof desk
  - `/walkthrough` = first-minute route
  - `/workbench` = operator and review surface
- [`docs/first-minute-walkthrough.md`](./first-minute-walkthrough.md)
- [`docs/discovery-surfaces.md`](./discovery-surfaces.md)
- [`docs/proof-and-faq.md`](./proof-and-faq.md)
- [`docs/evaluator-checklist.md`](./evaluator-checklist.md)
- [`docs/architecture.md`](./architecture.md)

Quick routing map:

- if you need the product sentence first, start with [`README.md`](../README.md)
- if you need the proof story, open [`docs/proof-and-faq.md`](./proof-and-faq.md)
  or `/proof`
- if you need the operator desk, open `/workbench`
- if you need the fastest guided route, open
  [`docs/first-minute-walkthrough.md`](./first-minute-walkthrough.md)
- if you need the discovery and machine-readable route map first, open
  [`docs/discovery-surfaces.md`](./discovery-surfaces.md)

## For Evaluators

Start here if you want to judge whether the current repo-local slice is honest
and usable.

- proof semantics and evidence tiers:
  [`docs/proof-and-faq.md`](./proof-and-faq.md)
- testing and quality gates:
  [`docs/testing.md`](./testing.md)
- environment and runtime rules:
  [`docs/environment-governance.md`](./environment-governance.md)
- release and public-safe rules:
  [`docs/release-readiness.md`](./release-readiness.md)
- repo-local workflow bridge:
  - `openui_repo_workflow_summary`
  - `npm run repo:workflow:ready`
- historical or strategy reference:
  - use the historical/reference appendix below when you need older
    activation, packaging, or product-line decision ledgers

Evaluator note:

- the current repo-local slice already contains thicker UI/UX audit surfaces, a
  stronger front door / proof / workbench product line, and a clearer
  builder-facing repo-local CLI and export layer
- Codex / Claude starter bundles and the OpenClaw public-ready bundle are now
  part of the repo-owned discovery story, while SDK / hosted stay supporting
  rather than front-stage
- shared docs are now aligned to those repo-local facts in this wave
- delivery landed remains a separate Git / PR / remote-state question

## For Builder Integrators

Start here if your question is "what builder surface is actually current?"

- [`README.md`](../README.md)
- [`docs/discovery-surfaces.md`](./discovery-surfaces.md)
- [`docs/contracts/openui-mcp.openapi.json`](./contracts/openui-mcp.openapi.json)
- [`docs/contracts/openui-ecosystem-productization.json`](./contracts/openui-ecosystem-productization.json)
- `openui-mcp-studio surface-guide`
- `openui-mcp-studio ecosystem-guide`
- `openui-mcp-studio skills starter --json`
- `openui_repo_workflow_summary`
- `npm run repo:workflow:ready`
- historical/reference appendix below for archived strategy ledgers and
  round-scoped architecture notes

The honest integration order is:

1. local stdio MCP
2. compatibility OpenAPI bridge
3. repo-local workflow packet
4. plugin-grade starter bundles and repo-side skills starter examples

Current boundary:

- the root CLI and curated public export layer exist in the current repo-local slice
- the root CLI now includes a repo-local `surface-guide` readout for zero-context builders
- the root CLI now also includes an `ecosystem-guide` readout for the current
  plugin-package/OpenClaw/supporting-lanes boundary
- the root CLI also exposes `skills starter --json` so builders can inspect the
  public starter-pack surface, install path, use path, and verification path
  without browsing repo internals first
- the repo-owned starter bundle files now make Codex / Claude Code install
  packaging and the OpenClaw public-ready bundle inspectable without copying
  commands out of prose first
- the public starter pack now exists through `@openui/skills-kit` with the
  repo mirror under `examples/skills/`
- the public SDK still exists through `@openui/sdk`, but it is now a
  supporting / parked lane
- the self-hosted OpenUI Hosted API still exists through
  `openui-mcp-studio hosted ...`, but it is now a supporting / parked lane
- marketplace listing, registry publication, managed deployment, and
  write-capable remote MCP remain later/operator-owned lanes
- the round-scoped architecture notes above are useful for repo-local truth, but
  they still do not replace fresh gates or Git landing evidence

## i18n Contract

The public and product surfaces now follow a simple split:

- public-facing docs and metadata stay English-first
- default locale is `en-US`
- product UI supports `zh-CN` on the current high-signal routes
- new bilingual copy should stay behind centralized message sources

Current repo-local coverage includes the front door plus the compare, proof,
walkthrough, and workbench surfaces.

## Shared Truth Anchors

Use these files when you need the current shared wording rather than a single
worker-scoped note:

- [`README.md`](../README.md)
- [`docs/discovery-surfaces.md`](./discovery-surfaces.md)
- [`docs/public-surface-guide.md`](./public-surface-guide.md)
- [`docs/testing.md`](./testing.md)
- [`docs/governance-runbook.md`](./governance-runbook.md)
- [`docs/release-readiness.md`](./release-readiness.md)
- [`docs/contracts/openui-ecosystem-productization.json`](./contracts/openui-ecosystem-productization.json)
- [`docs/contracts/openui-public-skills-starter.json`](./contracts/openui-public-skills-starter.json)
- coordination-only task boards under `.agents/Tasks/` stay outside public docs
  routing
- coordination-only master plans under `.agents/Plans/` stay outside public
  docs routing

## Historical And Reference Appendix

Use these files when you need decision history, strategy ledgers, or narrower
worker-scoped evidence rather than the current shared front door:

- [`docs/strategy/openui-external-activation-ledger.md`](./strategy/openui-external-activation-ledger.md)
- [`docs/strategy/openui-ecosystem-productization-ledger.md`](./strategy/openui-ecosystem-productization-ledger.md)
- [`docs/strategy/openui-public-skills-plugin-ledger.md`](./strategy/openui-public-skills-plugin-ledger.md)
- [`docs/strategy/openui-sdk-hosted-api-ledger.md`](./strategy/openui-sdk-hosted-api-ledger.md)
- [`docs/strategy/openui-uiux-truth-ledger.md`](./strategy/openui-uiux-truth-ledger.md)
- [`docs/strategy/openui-uiux-vertical-gap-ledger.md`](./strategy/openui-uiux-vertical-gap-ledger.md)
- [`docs/strategy/openui-builder-surface-formalization-ledger.md`](./strategy/openui-builder-surface-formalization-ledger.md)
- [`docs/architecture/uiux-engine-round1.md`](./architecture/uiux-engine-round1.md)
- [`docs/architecture/frontdoor-surface-round1-worker-b.md`](./architecture/frontdoor-surface-round1-worker-b.md)
- [`docs/architecture/builder-surface-round1-worker-c.md`](./architecture/builder-surface-round1-worker-c.md)

## For Maintainers

Start here if you are judging governance, release readiness, or shared closure
gaps.

- [`LICENSE`](../LICENSE)
- [`docs/governance-runbook.md`](./governance-runbook.md)
- [`docs/public-surface-guide.md`](./public-surface-guide.md)
- [`docs/discovery-surfaces.md`](./discovery-surfaces.md)
- [`docs/upstream-sync-sop.md`](./upstream-sync-sop.md)
- [`docs/secrets-incident-runbook.md`](./secrets-incident-runbook.md)
- [`docs/release-readiness.md`](./release-readiness.md)
- [`SECURITY.md`](../SECURITY.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- [`CODEOWNERS`](../CODEOWNERS)
- [`SUPPORT.md`](../SUPPORT.md)

Maintainer note:

- `.agents/Tasks/` and `.agents/Plans/` help coordination, but they are not
  release-proof or remote-proof by themselves
- machine-readable mirrors and governance registries are support truth; they
  may need a separate follow-through wave even when repo-local product wording
  is already aligned

## Truth Tiers

| Truth tier | What it is for | Primary sources |
| --- | --- | --- |
| Shared product and builder story | what the current repo-local slice honestly helps people do | `README.md`, `docs/discovery-surfaces.md`, `docs/public-surface-guide.md`, `docs/proof-and-faq.md`, `examples/public-distribution/README.md` |
| Governance and release rules | what counts as repo-safe, release-safe, or merge-ready | `docs/testing.md`, `docs/release-readiness.md`, `docs/governance-runbook.md` |
| Machine-readable and contract mirrors | structured mirrors, allowlists, and governance registries | `docs/contracts/*`, `contracts/governance/*`, `tooling/contracts/*` |
| Run evidence | what happened in a real execution wave | `.runtime-cache/runs/<run_id>/summary.json`, `.runtime-cache/runs/<run_id>/evidence/index.json` |
| Historical and strategy reference | why a prior wave made a certain packaging or positioning decision | `docs/strategy/*`, round-scoped `docs/architecture/*`, coordination archaeology |
| Delivery landed and remote state | branch, PR, checks, and privileged remote state | local Git history plus GitHub state; never inferred from docs alone |

## Authoritative Contracts

These contracts are part of the repository's authoritative governance layer and
must stay explicitly discoverable from the docs router:

- `contracts/governance/root-allowlist.json`
- `contracts/governance/dependency-boundaries.json`
- `contracts/governance/module-topology.json`
- `contracts/governance/public-surfaces.json`
- `contracts/runtime/path-registry.json`
- `contracts/runtime/run-layout.json`
- `contracts/observability/log-event.schema.json`
- `contracts/upstream/inventory.json`
- `contracts/upstream/pinned-sources.json`
- `contracts/upstream/compatibility-matrix.json`
- `contracts/upstream/patch-registry.json`
- `contracts/upstream/glue-surfaces.json`

## Historical Archive

Archive material is historical only and must not be treated as the current
operating truth.

When you need execution archaeology, read `.agents/Conversations/` and the
coordination-only notes under `.agents/Tasks/` or `.agents/Plans/` as history,
then confirm current truth with fresh code, commands, and GitHub state.

## Fast Validation Commands

```bash
npm run demo:ship
npm run repo:doctor
npm run repo:workflow:summary
npm run repo:workflow:ready
npm run smoke:e2e
npm run visual:qa
npm run release:public-safe:check
```
