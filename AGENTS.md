# AGENTS

This file is the shared AI-agent collaboration baseline for this repository.
Its job is to keep delivery safe, verifiable, and low-drift across Codex, Claude Code, and other coding agents.

English is the canonical source of truth for repository governance and maintenance guidance.
Localized entry documents may exist later, but they must not override this file.

## 1. Repository Positioning

- Repository type: local `stdio` MCP server that packages OpenUI capabilities
- Primary outcome: turn natural-language UI requests into frontend files and run quality gates on the result
- Technology target: `Next.js App Router + React + Tailwind + shadcn`
- Model strategy: Gemini-only (see `docs/environment-governance.md`)
- Default frontend target: `apps/web`
  - `smoke:e2e`
  - `visual:qa`
  - `uiux:audit*`
- The repository no longer maintains a fixture/compat dual-track frontend entry

## 1.1 Module Navigation

- Root baseline: `AGENTS.md`, `CLAUDE.md`
- `services/mcp-server/src/`
  - `services/mcp-server/src/next-smoke/AGENTS.md`
  - `services/mcp-server/src/providers/AGENTS.md`
  - `services/mcp-server/src/retrieval/AGENTS.md`
  - `services/mcp-server/src/tools/AGENTS.md`
  - `services/mcp-server/src/uiux/AGENTS.md`
- `packages/`
  - `packages/contracts/AGENTS.md`
  - `packages/shared-runtime/AGENTS.md`
  - `packages/runtime-observability/AGENTS.md`
- `tests/`
  - `tests/e2e/AGENTS.md`
  - `tests/visual-golden/AGENTS.md`
- `tooling/`
  - `tooling/contracts/AGENTS.md`
  - `tooling/env-contract/AGENTS.md`
  - `tooling/shared/AGENTS.md`
- `services/`
  - `services/gemini-sidecar/AGENTS.md`
- `ops/`
  - `ops/AGENTS.md`

## 2. Instruction Priority

Priority order:

1. system/platform instructions
2. root `AGENTS.md`
3. nearest module-level guidance
4. user task details

When rules conflict, prefer:

1. safety
2. rollbackability
3. verifiability
4. speed

## 3. 30-Minute Onboarding Path

```bash
npm install
cp .env.example .env
npx playwright install chromium firefox webkit
npm run build
npm start
```

Minimum validation:

```bash
npm run precommit:gate
npm run prepush:gate
npm run test
npm run test:e2e
npm run smoke:e2e
```

Runtime cleanup:

```bash
npm run repo:clean
```

## 4. Default Execution Protocol

1. Read before editing.
2. Keep changes minimal and directly related to the current task.
3. Verify before reporting completion.
4. Fix failures before claiming progress.
5. Keep docs in sync with command/config/flow/env changes.

## 5. Change Boundaries And Safety

### 5.1 File And Path Safety

- Writes must stay inside the workspace.
- Do not write outside the workspace or into protected paths.
- Never commit real secrets or tracked local `.env` files.
- Allowed tracked env templates:
  - `.env.example`
  - `.env.development.example`
  - `.env.staging.example`
  - `.env.production.example`

### 5.2 Git Safety

- Do not run `push`, `force push`, `reset --hard`, or `clean -fd` unless explicitly requested.
- Do not rewrite history unless explicitly requested.
- Do not revert unrelated dirty changes made by someone else.

### 5.3 Shared-Machine Resource And External-Write Safety

- Treat browser instances, browser profiles, tabs, Docker residue, and runtime caches as shared-machine resources, not free scratch space.
- When using Chrome, Chromium, Playwright browsers, or other browser-driven flows:
  - keep browser/profile ownership scoped to the current repo and current task
  - do not reuse windows, tabs, profiles, or logged-in sessions opened by another repo or another L1
  - prefer background-safe or no-focus-steal paths whenever the tooling supports them
  - inspect existing browser pressure before opening another repo-owned instance; if there are already more than 6 live browser instances on the machine, wait for resource pressure to fall unless the current task has no safe alternative
  - treat login-state checks as fail-fast work, not a brute-force loop; after 1-2 clean attempts on the current repo-owned profile, if the required login state is still missing, record a blocker instead of spawning more browsers or more profile clones
  - close repo-owned tabs, windows, and browser sessions when the task ends
  - remove temporary cloned profiles or task-only browser cache roots once they are no longer needed
- Do not leave large numbers of idle tabs, duplicate browser instances, or cloned profile trees running in the background.
- Keep Docker hygiene explicit:
  - do not leave disposable containers, temporary builders, or task-only Docker residue running after the task ends
  - do not treat machine-wide shared Docker layers as repo-local cleanup targets without separate approval
- Before creating a new browser/profile/container lane, check whether the task can reuse the current repo-owned lane safely without colliding with another active repo.
- Always preserve global awareness on a multi-repo machine:
  - assume other L1s may be using their own browser/profile/container state
  - never hijack, mutate, or depend on another repo's live browser/profile session
  - never borrow browser windows, tabs, profiles, or Docker lanes opened by another repo just because they already look warm
- Do not perform write actions against external accounts, browser-authenticated services, marketplaces, consoles, or dashboards unless the user explicitly asked for that write and the task requires it.
- When an external surface only needs inspection, stay read-only by default.
- When Git/GitHub landing is explicitly authorized for a closeout task, fully reconcile repo-owned branches, worktrees, and PRs back to `main` before declaring closure; do not leave repo-owned branch/worktree/PR residue behind.

### 5.4 Host Process Safety

- `worker-safe` is the default mode for this repository.
- Never use `killall`, `pkill`, `killpg(...)`, or `process.kill(...)` with `pid <= 0`.
- Never use `osascript`, `System Events`, `loginwindow`, raw `AppleEvent` paths, or `showForceQuitPanel` inside repo-owned automation.
- Only terminate processes through a directly held child handle or a recorded positive pid used for liveness probes such as `process.kill(pid, 0)`.
- If a process does not have a recorded positive pid, fail closed instead of broadening the kill scope.
- Detached browser/runtime launch is review-required only and must stay inside repo-owned browser roots or directly held child handles.
- Keep `node tooling/check-host-safety.mjs` green in the default local and CI gate lanes.

## 6. Testing And Quality Gates

Minimum validation by change type:

1. Normal code changes:

```bash
npm run lint && npm run typecheck && npm run test
```

2. UI interaction or page behavior changes:

```bash
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```

3. Next.js startup/build/routing changes:

```bash
npm run lint && npm run typecheck && npm run test && npm run smoke:e2e
```

4. Visual or styling changes:

```bash
npm run lint && npm run typecheck && npm run test && npm run visual:qa
```

5. Mainline/full merge gate:

```bash
npm run ci:gate
```

Notes:

- `ci:gate` is the main hard gate for lint/typecheck/test/build/e2e/smoke plus coverage-related enforcement; visual QA currently runs inside that path as an advisory stage, while `coreCoverageGate` remains blocking.
- Mutation manual review remains in `.github/workflows/mutation-manual.yml`, but the mainline path already includes full mutation gate semantics.
- Default Playwright baseline:
  - `retries=2`
  - `workers=1`
  - `fullyParallel=false`
- `external-site-readonly.spec.ts` stays out of default `npm run test:e2e` unless `RUN_EXTERNAL_E2E=1` or `npm run test:e2e:external` is used.

## 6.1 Non-Negotiable Repository Red Lines

1. Live tests must be real for LLM/API/external-site changes.
2. Live key resolution order must remain:
   - `process.env`
   - `.env`
   - `zsh` global environment
3. `precommit:gate` must pass before commit.
4. Coverage floor remains:
   - global `>= 80%`
   - key modules `>= 95%`
5. Placebo assertions are forbidden.
6. Safe parallelism is required where resource conflicts do not exist.
7. Long-running tasks must emit heartbeat logs.
8. Fast gates run before slow chains.
9. Code/docs co-change is mandatory in both directions.

Default gate sequence:

```bash
npm run precommit:gate
npm run prepush:gate
npm run ci:gate
npm run test:live
```

## 6.2 Repository Principles Mapping

1. Use real live paths for external integrations.
2. Keep teardown idempotent.
3. Treat coverage thresholds as hard gates.
4. Use mutation/counterfactual thinking on critical paths.
5. Separate config errors, retryable transient errors, and terminal business errors.
6. Run short checks before long ones.
7. Parallelize safe checks and serialize shared build resources.
8. Keep long-running tasks observable.
9. Treat lint warnings as errors before completion.
10. Keep commits atomic and conventionally named.
11. Enforce code/docs bidirectional consistency.
12. Navigate through `docs/index.md` and module guides before deep reads.
13. Search before adding new code.
14. Keep secrets isolated, IaC/container parity aligned, logs structured/redacted, and routing Gemini-only.
15. Leave repo-owned browser/profile/container state smaller and cleaner than you found it, without touching other repos' live lanes.
16. Treat external-account writes as opt-in, not default behavior.

## 7. Environment Governance

- Canonical env sources:
  - `packages/contracts/src/env-contract.ts`
  - `services/mcp-server/src/constants.ts`
- Local default runtime file: `.env`
- Local override env files are outside the supported default path.
- Tracked env templates are limited to:
  - `.env.example`
  - `.env.development.example`
  - `.env.staging.example`
  - `.env.production.example`
- `.env.sample` is not a governance source in this repository.

Any env behavior change must update, in the same change:

- `packages/contracts/src/env-contract.ts`
- example env files
- `README.md`
- `docs/environment-governance.md`

And must re-run:

```bash
npm run env:check
```

## 8. Documentation Sync Rules

If these change, update docs in the same change:

1. `package.json` scripts -> update `README.md` and `docs/governance-runbook.md`
2. test matrix -> update `docs/testing.md`
3. runtime output / cleanup strategy -> update `README.md`, `docs/environment-governance.md`, or `docs/governance-runbook.md`
4. upstream sync flow -> update `docs/upstream-sync-sop.md`
5. release/public-safe security routing -> update `README.md`, `SECURITY.md`, and `docs/release-readiness.md`

Docs entry point:

- `docs/index.md`

## 9. Recommended Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run smoke:e2e
npm run visual:qa
npm run docs:check
npm run env:check
npm run ci:gate
npm run repo:clean
npm run repo:doctor
npm run repo:upstream:check
npm run repo:verify:full
```

## 10. Delivery Reporting

When reporting completion, include:

1. what changed
2. which files were touched
3. what was verified
4. what risk remains

When blocked, state:

1. the blocker
2. what has already been tried
3. the minimum missing condition

## 11. AGENTS vs CLAUDE Split

- `AGENTS.md`: repository facts, shared process, shared gates
- `CLAUDE.md`: Claude-specific execution guidance

If the two drift, fix both in the same task so the repository does not keep two competing truths.
