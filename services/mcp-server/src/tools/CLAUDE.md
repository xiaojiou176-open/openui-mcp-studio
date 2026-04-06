# CLAUDE.md

This file adds Claude Code specific guidance for `services/mcp-server/src/tools`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read the target tool and `services/mcp-server/src/tools/shared.ts`.
2. Identify the call path and nearby tests.
3. Run the smallest valid gate set before considering broader E2E coverage.

## 2. Minimum Gates

- Required:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If the change affects the end-to-end experience:
  - `npm run test:e2e`

## 3. Risk Boundary

- Do not hard-code environment-sensitive configuration in the tool layer.
- Keep tool-facing errors diagnosable for callers.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
