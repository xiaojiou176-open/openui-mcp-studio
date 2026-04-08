# Testing Guide

This document is the canonical testing guide for the repository.

English is the canonical source of truth for testing and quality-gate guidance.

## Environment Baseline

- Minimum live runtime secret: `GEMINI_API_KEY` <!-- pragma: allowlist secret -->
- `.env` is the default and only maintained local runtime file.
- `test:live` resolution order is:
  - `process.env`
  - `.env`
  - `zsh` global environment
- Example env files must keep the run-scoped log path:
  - `OPENUI_MCP_LOG_DIR=.runtime-cache/runs/<run_id>/logs/runtime.jsonl`

## Default Validation Sets

| Scenario                                         | Minimum commands                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Normal code change                               | `npm run lint && npm run typecheck && npm run test`                                                                                    |
| UI or interaction change                         | baseline + `npm run test:e2e`                                                                                                          |
| Next startup or routing change                   | baseline + `npm run smoke:e2e`                                                                                                         |
| Visual change                                    | baseline + `npm run visual:qa`                                                                                                         |
| GitHub workflow / release-readiness slice change | baseline + `npm run repo:workflow:ready && npm run governance:history-hygiene:check`                                                   |
| Release or broad governance change               | `npm run repo:verify:full && npm run release:public-safe:check && npm run security:evidence:final && npm run governance:remote:review` |

Current front-door routing note:

- `/` is the product front door inside `apps/web`
- `/workbench` is the interactive proof route that the E2E workbench suite
  targets directly

## CI Lane Truth

Use this table when you want the shortest honest answer to "which lane is the
real gate?"

| Lane type | Default path | Typical entrypoints | What it is for |
| --- | --- | --- | --- |
| Pre-commit lane | yes | `npm run precommit:gate`, `npm run repo:doctor` | fastest local hygiene and structural truth before deeper checks |
| Pre-push lane | yes | `npm run prepush:gate`, `npm run repo:verify:fast` | stricter repo-local confidence before remote mutation |
| Hosted lane | yes | `npm run ci:gate`, docs/workflow governance jobs, `secret_scan` | canonical PR and merge confidence on the hosted GitHub path |
| Nightly lane | no | `nightly_cross_browser`, `nightly_coverage_gate`, `.github/workflows/runtime-cleanup-nightly.yml` | extended deterministic coverage and scheduled cleanup |
| Manual lane | no | `npm run test:live`, `workflow_dispatch` with `run_live_gemini=true`, `mutation-manual.yml`, `quality-trend-manual.yml`, `env-audit-manual.yml` | explicit live-provider verification and maintainer-driven review |

If a lane depends on Gemini, external APIs, or unstable network behavior, keep
it out of the default blocking PR path.

Dependabot is intentionally separate from this table.
It is dependency-inbox automation, not a sixth CI governance lane.
The current final-distribution posture keeps security updates available while
disabling routine version-update PR churn through `open-pull-requests-limit: 0`.

## Delivery Surface Gates

Use these checks when you are changing the spec-driven delivery plane:

- `npm run governance:delivery-surface:check`
  - verifies the required delivery-intelligence tools exist and are registered
  - ensures `services/mcp-server/src/tools/ship.ts` remains a thin facade over
    extracted ship core logic instead of regaining pipeline helper bodies
- `npm run repo:doctor`
  - now includes `deliverySurface` as part of the local structural health lane

Delivery-plane semantics to keep honest:

- acceptance statuses distinguish automatic outcomes from manual follow-up
  rather than collapsing both into a single pass/fail label
- acceptance verdicts should stay explicit about `manual_review_required`
  whenever human confirmation is still needed
- review bundles should prioritize reviewer-facing summary, hotspots,
  auto-checked evidence, and unresolved assumptions over raw object dumping
- feature-flow verification must prove both layers:
  - route-scoped artifact retention
  - feature-level quality / acceptance / review aggregation

When changing `openui_ship_feature_flow`, add targeted evidence on top of the
default baseline:

- feature-flow specific tests
- route-level artifact path verification
- at least one real dry-run when the change materially alters the feature-level
  package shape
- feature-flow validation should confirm both route-scoped artifact retention
  and feature-level aggregate bundle thickness, not only route execution success
- feature-flow verification must prove both levels:
  route-scoped artifacts and feature-level rollups

Recommended targeted evidence when changing `feature_flow`:

```bash
node --env-file-if-exists=.env ./node_modules/vitest/vitest.mjs run \
  tests/ship-feature-flow.test.ts \
  tests/ship-delivery-intelligence.test.ts \
  tests/tools-planning-surfaces.test.ts
```

When changing the GitHub workflow summary or PR-ready packet slice, add these
checks on top of the normal baseline:

```bash
node --env-file-if-exists=.env ./node_modules/vitest/vitest.mjs run \
  tests/repo-workflow-summary.test.ts \
  tests/tools-repo-workflow-summary.test.ts \
  tests/repo-workflow-ready.test.ts \
  tests/repo-governance-entrypoints.test.ts

npm run governance:history-hygiene:check
```

## Default Merge Gate Surface

Use this section when you want the shortest honest answer to "what is merge-ready
on the canonical public branch today?"

The stable required-check target is:

- `Quality (Node 22.22.0)`
- `Workflow Lint`
- `secret_scan`

Everything else in the repository may still matter for release, public-safe
claims, or maintenance review, but it should not be confused with the default
merge gate surface.

Important boundary:

- merge-ready is **not** the same thing as public-safe
- `release:public-safe:check` is still the stricter repo-side verdict
- manual Gemini, mutation, and other high-variance maintenance lanes remain
  outside the default required PR path

## Gate Meaning

- `npm run ci:gate`
  - main repository hard gate
  - starts with a blocking `npm audit --audit-level=high` stage, so lockfile-only
    dependency remediation is a legitimate hot-path fix when CI fails on known
    advisories
  - keeps default blocking scope on deterministic lint, typecheck, test,
    coverage, build, smoke, E2E, and governance checks
- `node tooling/check-host-safety.mjs`
  - repo-owned host-process safety gate
  - blocks negative-pid or process-group signals plus host-GUI automation
    primitives such as `killall`, `pkill`, `osascript`, `System Events`,
    `loginwindow`, raw `AppleEvent` paths, and `showForceQuitPanel`
- `npm run docs:check`
  - deterministic docs front-door gate
  - keeps lint, link, and scope checks on the default path
- `npm run docs:check:strict`
  - strict docs lane for release or manual governance review
  - adds manual-fact and proof-pack checks without forcing that cost onto every
    routine push
- `npm run uiux:audit:strict:gate`
  - Gemini-assisted UI/UX review plus deterministic axe follow-up
  - advisory in `ci:gate`; keep it for release-readiness or manual review, not as
    the primary every-PR blocker
- mutation full runs
  - keep `npm run mutation:run:gate` and the matching GitHub workflow as
    explicit manual lanes
  - do not treat mutation full runs as part of the default `ci:gate` hot path
- local `pre-commit` / `pre-push`
  - keep them deterministic and repo-local
  - do not require a live Gemini credential just to run front-door hygiene,
    lint, typecheck, or fast test gates
  - keep tracked-surface hygiene plus tracked-text sensitive-surface screening
    in the fast local path so personal emails, phone-like contact fields,
    host-local absolute paths, and tracked log surfaces are blocked before
    commit instead of being discovered only after Git history is already public
  - do not block the default local path on docs co-change classification
- CI `required_env_hard_gate`
  - keep the default PR, push, and scheduled path on deterministic checks
  - reserve hard `GEMINI_API_KEY` enforcement for the explicit manual
    `workflow_dispatch` lane when `run_live_gemini=true`
- scheduled reporting and maintenance workflows should stay secret-free unless
  they explicitly invoke a live Gemini lane
- CI `Live Gemini hard gate`
  - keep it manual-only through `workflow_dispatch`
  - require an explicit `run_live_gemini=true` opt-in so default CI never
    blocks on live provider behavior, secret availability, or external model
    stability
  - require the protected `live-gemini-manual` environment so a reviewer must
    approve the secret-bearing lane before it starts
- Gemini-backed maintenance workflows
  - keep `mutation-manual.yml`, `quality-trend-manual.yml`, and
    `env-audit-manual.yml` manual-only
  - keep `runtime-cleanup-nightly.yml` in the nightly lane instead of
    blurring it into the manual maintenance bucket
  - do not auto-schedule model-dependent or high-variance maintenance lanes on
    the canonical repo by default
- CI `secret_scan`
  - secret and tracked-surface hygiene enforcement
- `npm run security:pii:audit`
  - heuristic scan for tracked-text email addresses and phone-like contact data
- `npm run security:evidence:final`
  - writes repo-side final evidence summaries for heuristic PII and ScanCode keyfile review under `.runtime-cache/reports/security/`
- `npm run governance:tracked-surface:check`
  - prevents tracked `.agents/`, `.serena/`, `.runtime-cache/`, log files, and
    runtime/log `.jsonl` outputs
- `npm run repo:space:check`
  - front-door repo-local space-governance gate; fails when hard-fail pollution
    such as literal `$HOME/`, repo-local Go caches, or repo-local pre-commit
    tool homes exist, or when unknown heavy non-canonical runtime subtrees
    remain under `.runtime-cache/`
- `npm run repo:space:verify`
  - reports contract verification candidates plus repo-local maintenance candidates; this is an eligibility report, not a delete command
- `npm run repo:space:maintain:dry-run`
  - the no-delete maintenance lane; use it to inspect projected reclaimable bytes and skip reasons before any apply wave
- `npm run repo:space:maintain`
  - explicit repo-local maintenance apply; shared layers remain outside this default lane
- `npm run governance:remote:review`
  - writes a remote canonical review summary plus fresh mirror audit outputs
- `npm run repo:workflow:ready`
  - writes the non-mutating PR/checks-ready packet that combines repo-local
    verification state with live GitHub checks and alerts truth

## External Readonly Boundary

- `npm run test:e2e:external` is separate from the default blocking path.
- It already injects `RUN_EXTERNAL_E2E=1`.
- Treat DNS, proxy, or network instability as environmental first.
- Preserve Playwright evidence before drawing conclusions.

## Runtime Evidence

- Playwright and visual evidence belong under `.runtime-cache/runs/<run_id>/...`.
- Cross-run report files belong under `.runtime-cache/reports/*`, including the canonical quality-trend root at `.runtime-cache/reports/quality-trend/`.
- Long-running tasks must keep heartbeat output.
- Current CI uses host orchestration with container execution for the main gate.
- Login-state-dependent browser tests stay disabled in cloud CI by default.
- Real Chrome profile flows are local-only and must use `OPENUI_CHROME_USER_DATA_DIR` + `OPENUI_CHROME_PROFILE_DIRECTORY`; deterministic CI browser lanes keep using ephemeral/containerized Playwright contexts.
- Always-run CI evidence helpers such as env inventory, `summary.json`, and
  flake-metrics generation are advisory preservation steps. If an earlier
  blocking gate exits before those prerequisites exist, the helper must skip
  cleanly instead of becoming the primary failure.
- External readonly validation remains report-only in the default governance
  posture.
