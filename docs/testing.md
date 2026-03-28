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

| Scenario | Minimum commands |
| --- | --- |
| Normal code change | `npm run lint && npm run typecheck && npm run test` |
| UI or interaction change | baseline + `npm run test:e2e` |
| Next startup or routing change | baseline + `npm run smoke:e2e` |
| Visual change | baseline + `npm run visual:qa` |
| Release or broad governance change | `npm run repo:verify:full && npm run release:public-safe:check && npm run security:evidence:final && npm run governance:remote:review` |

## CI Lane Truth

Use this table when you want the shortest honest answer to "which lane is the
real gate?"

| Lane type | Default path | Typical entrypoints | What it is for |
| --- | --- | --- | --- |
| Deterministic local front door | yes | `npm run precommit:gate`, `npm run prepush:gate`, `npm run repo:doctor`, `npm run repo:verify:fast` | fast local hygiene and structural truth |
| Deterministic CI hot path | yes | `npm run ci:gate`, docs/workflow governance jobs, secret scan | the default PR and push confidence path |
| Advisory deterministic deep review | no | `npm run uiux:audit:strict:gate` | stricter UX/a11y review without blocking every routine push |
| Manual live-provider lane | no | `npm run test:live`, `workflow_dispatch` with `run_live_gemini=true` | explicit live Gemini verification |
| Manual maintenance lane | no | mutation, quality trend, weekly env audit | periodic or operator-triggered maintenance evidence |

If a lane depends on Gemini, external APIs, or unstable network behavior, keep
it out of the default blocking PR path.

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
- Gemini-backed maintenance workflows
  - keep `mutation-weekly.yml`, `quality-trend-weekly.yml`, and
    `weekly-env-audit.yml` manual-only
  - do not auto-schedule model-dependent or high-variance maintenance lanes on
    the canonical repo by default
- CI `secret_scan`
  - secret and tracked-surface hygiene enforcement
- `npm run security:pii:audit`
  - heuristic scan for tracked-text email addresses and phone-like contact data
- `npm run security:evidence:final`
  - writes repo-side final evidence summaries for heuristic PII and ScanCode keyfile review under `.runtime-cache/reports/security/`
- `npm run governance:tracked-surface:check`
  - prevents tracked `.agents/`, `.runtime-cache/`, log files, and runtime/log
    `.jsonl` outputs
- `npm run repo:space:check`
  - front-door repo-local space-governance gate; fails when hard-fail pollution
    such as literal `$HOME/`, repo-local Go caches, or repo-local pre-commit
    tool homes exist, or when unknown heavy non-canonical runtime subtrees
    remain under `.runtime-cache/`
- `npm run governance:remote:review`
  - writes a remote canonical review summary plus fresh mirror audit outputs

## External Readonly Boundary

- `npm run test:e2e:external` is separate from the default blocking path.
- It already injects `RUN_EXTERNAL_E2E=1`.
- Treat DNS, proxy, or network instability as environmental first.
- Preserve Playwright evidence before drawing conclusions.

## Runtime Evidence

- Playwright and visual evidence belong under `.runtime-cache/runs/<run_id>/...`.
- Long-running tasks must keep heartbeat output.
- Current CI uses host orchestration with container execution for the main gate.
- Always-run CI evidence helpers such as env inventory, `summary.json`, and
  flake-metrics generation are advisory preservation steps. If an earlier
  blocking gate exits before those prerequisites exist, the helper must skip
  cleanly instead of becoming the primary failure.
- External readonly validation remains report-only in the default governance
  posture.
