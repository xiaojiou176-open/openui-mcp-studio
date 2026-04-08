# Release Readiness

This document explains the repository-side release and public-safe gates.

## Core Commands

```bash
npm run release:readiness:check
npm run release:public-safe:check
npm run security:evidence:final
npm run governance:remote:review
npm run repo:workflow:summary
npm run repo:workflow:ready
npm run governance:remote-evidence:check:strict
npm run governance:history-hygiene:check
npm run security:history:sensitive:audit
npm run security:github:public:audit
```

## Command Boundaries

- `npm run release:readiness:check`
  - checks repository-side release evidence inputs
  - does not prove remote GitHub controls or full Git history hygiene
- `npm run release:public-safe:check`
  - is the canonical repository-side public-safe verdict
  - requires strict authoritative run evidence
  - requires strict remote governance evidence
  - requires zero-findings canonical history hygiene
  - requires zero-findings local heads/tags sensitive-surface history
  - requires a clean GitHub public-surface sensitive review, including open secret-scanning alerts, open code-scanning alerts, and fetchable pull refs
- `npm run security:evidence:final`
  - writes repo-side final evidence summaries for heuristic PII, current sensitive-surface, local history-sensitive, and ScanCode keyfile review
  - does not replace formal DLP, privacy review, or legal sign-off
- `npm run governance:remote:review`
  - writes a remote canonical review summary plus fresh mirror audit outputs
  - does not imply upstream repositories are also history-clean
- `npm run repo:workflow:summary`
  - returns the raw read-only repo-local + GitHub-connected workflow snapshot
  - is the CLI form of the MCP tool `openui_repo_workflow_summary`
- `npm run repo:workflow:ready`
  - writes a non-mutating PR/checks-ready packet that combines repo-local state
    with live GitHub branch-protection / checks / alert truth
  - does not push a branch, create a PR, or mutate remote settings
  - uses the same underlying read-only GitHub summary surface that powers the
    MCP tool `openui_repo_workflow_summary`, then formats it into a
    maintainer-facing packet

## Remote Governance Boundary

Release readiness does not prove remote GitHub controls by itself.

Use:

- `npm run governance:remote-evidence:check:strict`
- `tooling/contracts/remote-governance-evidence.contract.json`

Freshness rule:

- strict remote-governance evidence must be refreshed in the current execution
  wave
- stale snapshots are not enough for a public-safe verdict, even when the
  recorded values still look correct

The canonical public-safe stance for this wave is:

- repository is public
- `main` is protected
- required checks are enforced
- CODEOWNERS review is enforced
- secret scanning is enabled
- push protection is enabled
- private vulnerability reporting is enabled
- live Gemini verification stays manual-only and must pass through the
  protected `live-gemini-manual` environment before repository secrets enter
  the job

## Developer-Flow Boundary

Use this split when deciding whether the next move is a local fix, a GitHub
read, or a remote mutation:

- repo-local:
  validation, review artifacts, feature bundles, docs, and workflow-ready
  packet generation
- GitHub-connected:
  read open PRs, branch protection, required checks, workflow failures, and
  security alerts
- remote mutation:
  push branch, create/update PR, request reviewer approval, or change GitHub
  settings

`npm run repo:workflow:ready` is intentionally limited to the first two layers.
It prepares the packet for a maintainer without pretending to perform the third.

The layering is intentional:

- `openui_repo_workflow_summary` / `npm run repo:workflow:summary`
  - raw MCP/CLI surface for agent or maintainer consumers that need structured
    repo-local plus GitHub-connected truth
- `npm run repo:workflow:ready`
  - maintainer-facing packet that writes JSON and Markdown artifacts under
    `.runtime-cache/reports/release-readiness/`

## Repo-Local Complete Vs Delivery Landed

Keep these two judgments separate:

- `repo-local complete`
  - the current worktree, docs, proof surfaces, and local verification packet
    agree on the same slice of truth
- `delivery landed`
  - the approved slice has been staged, committed, pushed, and represented in
    branch or PR state

`npm run repo:workflow:ready` helps you inspect whether the first layer is
ready. It does not perform the second layer for you.

## Current Product And Surface Boundary

Release-readiness and public-safe checks should now preserve these truths:

- the repo is a UI/UX vertical companion for Codex / Claude Code workflows
- `/proof` remains the proof desk and `/workbench` remains the operator desk
- the primary builder surface is local stdio MCP
- the compatibility OpenAPI document is a bridge/review surface, not proof of a
  hosted API product
- repo workflow readiness is a repo-local CLI/operator surface
- `llms.txt`, `/api/frontdoor`, and the web manifest now encode route-role and
  builder-entry hints as machine-readable support truth
- plugin-grade public distribution package for Codex and Claude Code is a
  current repo-owned product line
- OpenClaw public-ready repo-owned bundle is a current repo-owned product line
- `@openui/skills-kit`, `@openui/sdk`, and the self-hosted OpenUI Hosted API
  remain real, but SDK / hosted are supporting rather than front-stage
- official listing, registry publication, managed deployment, and
  write-capable remote MCP remain later/operator-owned lanes
- `docs/discovery-surfaces.md`,
  `docs/strategy/openui-external-activation-ledger.md`, and
  `docs/strategy/openui-ecosystem-productization-ledger.md` are the current
  human-readable follow-through artifacts for the endgame external-activation
  and ecosystem surfaces

## Public Closure Boundary

Treat these as separate from repo-local readiness:

- future GitHub Homepage override beyond the current Pages front door
- GitHub Social Preview
- publishing future releases
- refreshing attached release assets after future public-story changes
- future Discussions seeding and curation beyond the current live baseline

Those are operator-managed public surfaces.
The repo can prepare their wording, assets, and contracts, but it can only
prove the settings are live when the current execution environment can reach
GitHub's live surfaces.

## i18n Boundary

The current public-safe stance is:

- public pages stay English-first
- default locale is `en-US`
- product UI may expose `zh-CN` through the centralized message layer
- new bilingual copy must not bypass the message layer with scattered literals

## `apps/web` Build Nuance

Current Prompt 4 release-readiness handling should keep one boundary explicit:

- the current product-line authority remains the official front-door checks:
  `npm run smoke:e2e`, `npm run visual:qa`, and real frontdoor/workbench
  validation
- Prompt 4 did reproduce clean direct-build failures earlier in the wave, then
  closed them with a minimal repo-local fix set:
  - add `apps/web/app/not-found.tsx`
  - remove the unsupported `experimental.webpackBuildWorker` drift from
    `apps/web/next.config.mjs`
- in the current final Prompt 4 worktree, clean direct
  `apps/web` `next build` reruns pass, and the official
  `smoke:e2e` / `visual:qa` chain is green
- keep the old direct-build failure only as a regression pattern to watch,
  not as a current release-readiness blocker
- current high-signal coverage includes the proof desk plus workbench
  next-action, pause, dialog, and state guidance

## Diagnostic Build Boundary

Treat `apps/web` direct `next build` as a diagnostic reliability path,
not as a stronger release truth than the repository-owned gates.

- `npm run smoke:e2e` and `npm run visual:qa` remain the current public product
  proof chain for the front door and operator surface
- a direct webpack build flake should only become a repo-local blocker if it is
  fresh, reproducible, and starts blocking those official gates or the manual
  frontdoor validation path
- until then, record it as a residual reliability note instead of widening the
  current product contract or rewriting the build chain speculatively

## GHCR Boundary

`Build CI Image` has one important remote boundary that local workflow fixes do
not erase:

- repo-local workflow code can authenticate with `GITHUB_TOKEN`, set OCI source
  labels, and keep the action inputs valid
- GitHub Container Registry push still depends on remote package linkage and
  package permissions
- a `403 Forbidden` during blob push should be classified as a remote package
  access or repository-linkage blocker unless fresh evidence proves otherwise
- when GHCR push fails, the staged artifact payload under
  `.runtime-cache/ci-image-artifact/` remains the current repo-owned evidence
  surface; inspect `status.json` plus any copied metadata files before widening
  the diagnosis

The raw lower-level snapshot remains available through the MCP tool
`openui_repo_workflow_summary`.

## External Blocker Patterns

Use these patterns to avoid misclassifying operator work as repo-local success:

- GitHub homepage setting drift
  - example: homepage still points at a GitHub blob URL
  - treat as a remote settings/operator action, not a local code fix
- CodeQL alert closure
  - repo-local code can remove the root cause, but GitHub only closes the live
    alert after the change is pushed and re-analyzed
- GHCR push login succeeds but blob upload returns `403`
  - treat as mixed registry/permission/operator territory unless a repo-local
    workflow bug is also proven

## Git History Boundary

Current-tree checks are not a substitute for full-history scanning.

- `npm run governance:history-hygiene:check` refreshes the raw history report
  first when the report artifact is missing
- the default clean repository state is expected to produce zero findings
- temporary upstream tracking refs are outside the canonical release surface and
  must be removed or isolated before claiming the clone is history-clean again
- public visibility does not waive this requirement

## Release Evidence Inputs

These machine-consumed inputs stay under `docs/contracts/`:

- `openui-mcp.openapi.json`
- `performance-budget.json`
- `rum-slo.json`
- `feature-flags.json`
- `canary-policy.json`
- `rollback-policy.json`
- `observability-policy.json`
- `ci-image-supply-chain.json`

These JSON files are intentionally retained even in the minimal docs profile.

## Live Snapshot Rule

Do not use this document as a scoreboard for current GitHub counts.

Use these commands for live truth instead:

- `npm run repo:workflow:summary`
- `npm run repo:workflow:ready`
- `npm run security:github:public:audit`
- `npm run public:remote:check`

That split is intentional:

- this document explains release-readiness rules
- the commands above report current alert counts, branch state, and remote proof
- historical turn-by-turn numbers belong in archive material, not in the SSOT

## Current Closeout Shape

Keep the release-readiness story split into four layers:

- repo-local engineering
  - code, docs, workflow wiring, and public assets agree on the same current
    product story
- repo-local verification
  - the required local gates are re-run in the current wave before any done
    claim
- GitHub live truth
  - branch protection, required checks, PR counts, and security alerts must be
    refreshed from live commands in the same wave
- public/operator truth
  - Social Preview, release-note curation, future discussions seeding, and
    other settings-level surfaces remain operator-owned unless explicitly
    verified live

The release-ready question is like checking both a suitcase and a boarding
screen:
packing the suitcase is repo-local work, but the boarding screen is GitHub live
state.
You need both before calling the trip ready.

## Historical Snapshots

Detailed per-wave closeout snapshots were intentionally removed from this
document so it does not drift into a stale dashboard.

When you need historical archaeology, use:

- `.agents/Conversations/`
- `.agents/Tasks/` and `.agents/Plans/` as coordination history
- archived readiness artifacts under `.runtime-cache/reports/`

Treat those as history, then re-check current truth with fresh commands.
