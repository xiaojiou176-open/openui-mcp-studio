# CLAUDE.md

This file defines Claude Code specific execution guidance for this repository.
Repository-wide rules and facts live in `AGENTS.md`; this file only adds Claude-focused operating rules.

## 1. Role And Boundaries

- Role: implementer plus verifier.
- Principles: minimal changes, evidence-backed delivery, easy rollback.
- Boundaries: do not perform high-risk actions without approval, do not bypass gates, and do not create docs drift.

## 1.1 Module Entry Points

- Root baseline: `AGENTS.md`, `CLAUDE.md`
- `services/mcp-server/src/`: `services/mcp-server/src/next-smoke/CLAUDE.md`, `services/mcp-server/src/providers/CLAUDE.md`, `services/mcp-server/src/retrieval/CLAUDE.md`, `services/mcp-server/src/tools/CLAUDE.md`, `services/mcp-server/src/uiux/CLAUDE.md`
- `packages/`: `packages/contracts/CLAUDE.md`, `packages/shared-runtime/CLAUDE.md`, `packages/runtime-observability/CLAUDE.md`
- `tests/`: `tests/e2e/CLAUDE.md`, `tests/visual-golden/CLAUDE.md`
- `tooling/`: `tooling/contracts/CLAUDE.md`, `tooling/env-contract/CLAUDE.md`, `tooling/shared/CLAUDE.md`
- `services/`: `services/gemini-sidecar/CLAUDE.md`
- `ops/`: `ops/CLAUDE.md`

Rule priority remains:

1. system/platform instructions
2. root `AGENTS.md`
3. module `AGENTS.md`
4. module `CLAUDE.md`

## 1.2 Repository Facts Snapshot

- Primary product shape: local `stdio` MCP server plus a default product frontend at `apps/web`
- Frontend stack target: `Next.js App Router + React + Tailwind + shadcn`
- Model strategy: Gemini-only
- Minimum merge gate: `npm run lint && npm run typecheck && npm run test`
- Mainline acceptance gate: `npm run ci:gate`

## 2. Start-Of-Task Checklist

1. Read `AGENTS.md`, `README.md`, and `docs/index.md`.
2. Identify the impacted modules and nearby tests before editing.
3. Pick the smallest valid verification set for the task.
4. If the task touches E2E or CI paths, ensure Playwright browsers are installed:

```bash
npx playwright install chromium firefox webkit
```

## 3. Recommended Claude Flow

1. Recon: search and read before editing.
2. Plan: define the smallest valid change set.
3. Change: edit in small, reviewable steps.
4. Verify: run the minimum required validation and fix failures immediately.
5. Report: summarize change, verification, and residual risk.

## 4. Command And Tool Strategy

Common commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run smoke:e2e
npm run visual:qa
npm run env:check
npm run docs:check
npm run ci:gate
```

Tool guidance:

- Prefer `rg` / `rg --files` for search.
- Read files lazily instead of expanding the whole repo.
- Prefer small, surgical patches.
- Parallelize only when tasks do not write the same file set.

## 5. High-Risk Actions

Stop and confirm before:

1. deleting data or making irreversible changes
2. writing to production or remote environments
3. touching secrets, auth, or billing sensitive paths
4. rewriting Git history (`--force`, `--amend`, `reset --hard`)

## 6. Hard Repository Constraints

1. Canonical Node version: `22.22.0`
2. Gemini-only: do not introduce other provider fallbacks
3. `.env` is the default local runtime file; local override env files are not part of the supported path
4. Env contract changes must update `packages/contracts/src/env-contract.ts`, example env files, and docs in the same change
5. Minimum merge gate: `lint + typecheck + test`
6. Mainline/release verification should prioritize `npm run ci:gate`
7. Never commit real secrets or tracked local `.env` files

## 6.1 Mandatory Execution Rules

Claude must follow these repository red lines whenever code changes are made:

1. Live tests must be real for LLM/API/external-site changes.
2. Live key resolution order is `process.env -> .env -> zsh global env`.
3. Commit-time lint must stay at zero errors.
4. Coverage thresholds remain enforced: global `>= 80%`, key modules `>= 95%`.
5. Placebo assertions are forbidden.
6. Independent checks should run in parallel when resource-safe.
7. Long-running flows must emit heartbeat output.
8. Fast checks run before slow checks.
9. Code/docs co-change remains mandatory.

Minimum pre-commit execution:

```bash
npm run precommit:gate
```

Recommended pre-merge execution:

```bash
npm run ci:gate
npm run test:live
```

## 6.2 Applied Governance Principles

Claude should map the repository principles into execution as follows:

1. Prefer real live paths for LLM/API/external integrations.
2. Keep teardown idempotent.
3. Treat coverage thresholds as hard gates.
4. Use counterfactual or mutation thinking for critical logic.
5. Separate config errors, retryable transient errors, and terminal business errors.
6. Run short gates before long chains.
7. Parallelize safe checks, serialize shared build resources.
8. Keep long-running tasks observable with heartbeat logs.
9. Treat lint warnings as blocking quality debt before completion.
10. Keep commits atomic and conventionally named.
11. Enforce code/docs bidirectional consistency.
12. Use indexed navigation before deep reads.
13. Search before adding new code.
14. Keep secrets isolated, runtime/container parity aligned, logs structured and redacted, and model routing Gemini-only.

## 7. Suggested Reporting Shape

```md
## Completion
- What changed:
- Files touched:
- Verification:
- Risks / follow-ups:
```

Use precise file references such as `services/mcp-server/src/main.ts:120`.

## 8. Sync Rule With AGENTS

- If this file conflicts with `AGENTS.md`, follow `AGENTS.md`.
- If commands, facts, or gates drift, update both files in the same task to avoid long-term divergence.
