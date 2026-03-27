# Architecture

## System Shape

This repository is a hybrid repo with three layers:

1. a local MCP server
2. a default frontend proof target at `apps/web`
3. a contracts-and-tooling governance layer

The runtime entrypoint is `services/mcp-server/src/main.ts`.
Tool registration and orchestration live in `services/mcp-server/src/index.ts`.
The MCP server remains the system protocol entrypoint.

## Main Flow

The default end-to-end flow is owned by `openui_ship_react_page`:

1. receive prompt input
2. generate HTML
3. convert HTML into React and shadcn-oriented files
4. apply files under path safety rules
5. run quality gates

Core implementation surfaces:

- `services/mcp-server/src/main.ts`
- `services/mcp-server/src/index.ts`
- `services/mcp-server/src/ai-client.ts`
- `services/mcp-server/src/file-ops.ts`
- `services/mcp-server/src/quality-gate.ts`
- `services/mcp-server/src/constants.ts`

## Default Frontend Target

- `apps/web` is the default frontend proof target.
- `smoke:e2e`, `test:e2e`, `visual:qa`, and `uiux:audit*` target that surface by
  default.
- The repository is not a generic Next.js demo and is not driven from `apps/web`
  alone.

## Provider Boundary

- Gemini is the only provider path.
- Runtime model calls flow through the repository-owned provider bridge.
- Environment parsing and fail-fast validation stay in
  `services/mcp-server/src/constants.ts`.

## Upstream Boundary

This repository is a long-lived productized fork.

- keep upstream visible
- use selective port as the default route
- do not treat whole-repo merge as the normal maintenance path
- do not assume every local clone keeps `upstream` attached between sync passes
- treat clone-local sync readiness as a separate question from repo-wide
  upstream policy health

## Failure Boundaries

Use these documents when triaging failures:

- `docs/environment-governance.md` for runtime/env failures
- `docs/testing.md` for test and gate meaning
- `docs/governance-runbook.md` for repository operating rules
- `docs/upstream-sync-sop.md` for upstream maintenance discipline
