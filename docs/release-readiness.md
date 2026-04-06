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

- GitHub Homepage
- GitHub Social Preview
- publishing draft releases
- refreshing attached release assets
- Discussions seeding and curation

Those are operator-managed public surfaces.
The repo can prepare their wording, assets, and contracts, but it cannot prove
the settings are live by itself.

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
  `apps/web` `next build --webpack` reruns pass, and the official
  `smoke:e2e` / `visual:qa` chain is green
- keep the old direct-build failure only as a regression pattern to watch,
  not as a current release-readiness blocker
- current high-signal coverage includes the proof desk plus workbench
  next-action, pause, dialog, and state guidance

## Diagnostic Build Boundary

Treat `apps/web` direct `next build --webpack` as a diagnostic reliability path,
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

## Historical Endgame Update (2026-04-01 PDT)

This section is historical context from the 2026-04-01 endgame wave.
Do not treat it as the current GitHub or release-readiness truth.

- latest fully completed repo-local hard-gate packet in this turn:
  `ci-gate-1775040222373-67326`
  - security audit = pass
  - repo governance hard gate = pass
  - fast quality gates = pass
  - deep coverage run completes, but `coreCoverageGate` still fails on
    `global branches 94.97% < 95.00%`
  - `quality score 49.33 < 85` remains downstream of that one remaining
    branch-coverage miss
- latest repo-local full test baseline after the newest branch-only test
  additions:
  - `npm run test` = pass
  - `183` test files passed
  - `1044` tests passed
  - `7` skipped
- stale blocker stories invalidated in this turn:
  - the older Prompt 10 `coverage-*.json ENOENT` crash story is no longer the
    best current explanation for repo-local red state
  - the transient `.serena` root-governance drift was session-local and was
    cleared locally
- latest read-only GitHub workflow truth remains:
  - open PRs = `1`
  - open issues = `0`
  - open CodeQL alerts = `2`
  - open secret-scanning alerts = `0`
  - open dependabot alerts = `0`
  - homepage still points at the blob URL for
    `docs/first-minute-walkthrough.md`
  - recent failing GitHub workflow runs remain visible remotely
- current honest boundary:
  - repo-local is **not** yet complete because the latest completed full packet
    still stops at `94.97%`
  - remote/operator blockers remain separate and unchanged
  - a subsequent clean rerun after additional tiny branch-only tests was
    started, but it did not yield a fresh completed authoritative `summary.json`
    packet within this turn, so repo-side completion cannot be claimed from
    that attempt

## Current Closeout Snapshot

Fresh 2026-04-06 evidence keeps the release-readiness story split into four
different layers:

- repo-local engineering
  - the current worktree is intentionally carrying a closeout diff, not a clean
    tree yet
  - the tracked supplemental workflow now exists for:
    - pull-request Dependency Review
    - Zizmor
    - Trivy filesystem scanning
  - `npm run public:assets:render` and `npm run visual:qa:update` now both end
    with repo-owned `oxipng` normalization instead of leaving PNG compression
    to CI discovery
- repo-local verification
  - `npm run precommit:gate` = pass
  - `npm run prepush:gate` = pass
  - `npm run lint` = pass
  - `npm run typecheck` = pass
  - `npm run -s public:assets:check` = pass
  - `npm run test` is **not** green in this execution wave:
    - `tests/space-governance-report.test.ts`
      `ignores an empty legacy .runtime-cache/temp directory when collecting drift`
      timed out
    - `tests/hosted-api-service.test.ts`
      `serves public discovery plus auth-protected workflow and tool routes`
      timed out, and its `afterEach` hook also timed out
- GitHub live truth
  - open PRs = `0`
  - open issues = `0`
  - open CodeQL alerts = `0`
  - open secret-scanning alerts = `0`
  - latest `main` CodeQL run = success
  - latest `main` CI run is **not** fully green because `Pre-commit Gate`
    failed after `oxipng` rewrote tracked PNG assets on the runner
  - the current GitHub homepage field is intentionally empty
  - local `origin/codex/*` refs were stale tracking refs, not live GitHub
    branches
- public/operator truth
  - Git tags exist, but the GitHub Releases page currently has no published
    release
  - release notes, release assets, and release-page closure therefore remain
    operator-owned follow-through rather than current public truth

Use `npm run repo:workflow:summary` and `npm run repo:workflow:ready` for the
latest read-only readiness packet, but do not treat those commands as proof
that the repo-local full-gate story is fully closed until:

- the current repo-local test failures are resolved
- the current closeout diff is landed and re-run through fresh GitHub checks
- the remaining operator-owned public surfaces are either completed or
  explicitly kept out of the verdict

## Historical Closure Snapshot (2026-04-01 PDT)

This section is historical context from the 2026-04-01 closure wave.
Do not treat it as the current plan-of-record or current GitHub truth.

- latest authoritative completed repo-local hard-gate packet:
  `ci-gate-1775043022067-46611`
  - `stage0` through `stage4` all passed
  - `quality score 100 >= 85`
- canonical coverage summary now reports:
  - `global branches = 95.11%`
- repo-local release/readiness judgment:
  - repo-side hard gates are green in the current worktree
  - repo-local blockers are cleared
- remote/live judgment:
  - GitHub homepage blob drift is resolved by unsetting the homepage field
  - open PR `#28` remains
  - open CodeQL alerts remain until a maintainer pushes the current worktree
    and GitHub re-analyzes the repository
  - recent remote failed workflow history may remain visible until remote state
    refreshes

Current honest split:

- repo-side complete = yes
- remote/git complete = not yet
- live/public sync complete = not yet
- remaining work = push current worktree, let GitHub rerun checks and CodeQL,
  then re-review remote state before claiming full public closure

## Historical Remote Follow-Through Snapshot (2026-04-01 PDT)

This section is historical context from the 2026-04-01 remote follow-through wave.
Do not treat it as the current remote truth.

- pushed branch: `codex/ultimate-unified-endgame`
- open closure PR: `#29 feat: close repo-local endgame lanes`
- GitHub homepage blob drift is resolved by leaving homepage unset
- remaining remote/public closure now depends on:
  - PR `#29` checks and required review
  - PR `#28` review / merge handling
  - GitHub CodeQL re-analysis on the newly pushed branch

## Historical Maximum-Pressure Snapshot (2026-04-01 PDT)

This section is historical context from the 2026-04-01 maximum-pressure wave.
Do not treat it as the current remote or release-readiness truth.

- latest authoritative completed repo-local hard-gate packet is now:
  - `ci-gate-1775057297007-61245`
  - `ok = true`
  - `warningCount = 0`
  - `quality score 100 >= 85`
- the repo-local front-door closure is deeper than the earlier final packet:
  - `/api/frontdoor` now exposes builder-facing JSON truth
  - `/manifest.webmanifest` now exists as a real discovery surface
  - `/llms.txt`, the JSON front-door, and homepage discovery content now align
  - front-door visual goldens were intentionally refreshed and then re-run
    through `oxipng` plus `npm run visual:qa`
- stale remote failure explicitly invalidated:
  - the old PR `#29` failure on `ea2d5c6` came from remote `oxipng`
    optimization of the updated visual goldens
  - that root cause is fixed locally and pushed on:
    - `d0b4269 chore: optimize visual golden assets`
- current remote judgment from the latest refresh:
  - PR `#29` head = `d0b4269`
  - required review is still pending
  - latest CI / CodeQL checks on `d0b4269` were still queued or running at the
    time of the last refresh
  - GitHub description is aligned
  - homepage remains intentionally unset
  - open CodeQL alerts on `main` remain `2`

Current honest split after this update:

- repo-side complete = yes
- remote/git complete = not yet
- live/public sync complete = partial
- remaining remote/public closure = wait for latest `d0b4269` checks to finish,
  then review/merge PR `#29`, then re-check the `2` existing CodeQL alerts on
  `main`
