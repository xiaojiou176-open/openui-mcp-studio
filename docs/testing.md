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
| Release or broad governance change | `npm run repo:verify:full && npm run release:public-safe:check` |

## Gate Meaning

- `npm run ci:gate`
  - main repository hard gate
- CI `secret_scan`
  - secret and tracked-surface hygiene enforcement
- `npm run security:pii:audit`
  - heuristic scan for tracked-text email addresses and phone-like contact data
- `npm run governance:tracked-surface:check`
  - prevents tracked `.agents/`, `.runtime-cache/`, log files, and runtime/log
    `.jsonl` outputs

## External Readonly Boundary

- `npm run test:e2e:external` is separate from the default blocking path.
- It already injects `RUN_EXTERNAL_E2E=1`.
- Treat DNS, proxy, or network instability as environmental first.
- Preserve Playwright evidence before drawing conclusions.

## Runtime Evidence

- Playwright and visual evidence belong under `.runtime-cache/runs/<run_id>/...`.
- Long-running tasks must keep heartbeat output.
- Current CI uses host orchestration with container execution for the main gate.
- External readonly validation remains report-only in the default governance
  posture.
