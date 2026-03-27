# OpenUI MCP Studio

OpenUI MCP Studio is a local `stdio` MCP server that turns natural-language UI
requests into governed frontend delivery.

English is the canonical source of truth for repository governance and
maintenance.

## What This Repository Is

- The repository entrypoint is `services/mcp-server/src/main.ts`.
- Tool registration and orchestration live in `services/mcp-server/src/index.ts`.
- The MCP server remains the system protocol entrypoint.
- `apps/web` is the default frontend proof target for smoke, E2E, visual, and
  UI/UX checks.
- `contracts/*` and `tooling/*` contain the machine-governed repository control
  plane.
- This repository is a long-lived productized fork and uses selective port
  maintenance instead of whole-repo upstream merge as the default path.

## Quick Start

```bash
npm install
cp .env.example .env
npx playwright install chromium firefox webkit
npm run build
npm start
```

## Core Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run smoke:e2e
npm run docs:check
npm run repo:doctor
npm run repo:verify:fast
npm run repo:verify:full
npm run repo:upstream:check
npm run release:public-safe:check
```

## Minimum Docs

- Docs index: `docs/index.md`
- Architecture: `docs/architecture.md`
- Environment governance: `docs/environment-governance.md`
- Testing: `docs/testing.md`
- Governance runbook: `docs/governance-runbook.md`
- Release readiness: `docs/release-readiness.md`
- Upstream maintenance: `docs/upstream-sync-sop.md`
- Secrets and incident routing: `docs/secrets-incident-runbook.md`
- Agent baseline: `AGENTS.md`
- Claude guidance: `CLAUDE.md`

## Community And Legal Surface

- `LICENSE`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CODEOWNERS`
- `CODE_OF_CONDUCT.md`
- `SUPPORT.md`

## Security And Release Truth

- The repository is public.
- `main` is protected.
- Required checks are enforced.
- CODEOWNERS review is enforced.
- Secret scanning is enabled.
- Push protection is enabled.
- Private vulnerability reporting is enabled.

Important boundary:

- a public repository posture does not prove full Git history is clean
- `npm run release:public-safe:check` is the canonical repository-side public
  release gate
- `npm run security:oss:audit` runs the repo-local secret and keyfile audit
  bundle
- `npm run security:pii:audit` runs the repo-local heuristic PII scan for
  tracked text files
- `npm run governance:history-hygiene:check` classifies the current history
  report and refreshes it first when the report artifact is missing

## Runtime And Environment

- Local runtime secrets come from `.env` or shell/CI environment variables.
- The repository is Gemini-only.
- Runtime logs and evidence belong under `.runtime-cache/runs/<run_id>/...`.
- Container parity remains available through `npm run repo:verify:full`.
- Local bootstrap container paths are construction-only bridges, not proof of
  trusted CI closure.

## Upstream Policy

- Upstream visibility stays enabled for comparison and selective adoption.
- `npm run repo:upstream:check` validates inventory, compatibility, patch
  governance, and reruns `security:history:audit`.
- Do not treat `repo:upstream:check` as approval for whole-repo merge or rebase.
- The default route is selective port; whole-repo merge is exceptional only.

## Integrating With Claude Or Codex

### Claude Code

```bash
claude mcp add --transport stdio --env GEMINI_API_KEY=your_key openui -- \
  node /ABS/PATH/openui-mcp-studio/.runtime-cache/build/mcp-server/main.js
```

### Codex CLI

```bash
codex mcp add openui --env GEMINI_API_KEY=your_key -- \
  node /ABS/PATH/openui-mcp-studio/.runtime-cache/build/mcp-server/main.js
```
