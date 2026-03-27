# CLAUDE.md

This file adds Claude Code specific guidance for `services/mcp-server/src/retrieval`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read `services/mcp-server/src/retrieval/types.ts`.
2. Then read the main flow in `services/mcp-server/src/retrieval/retriever.ts`.
3. Inspect `services/mcp-server/src/retrieval/local-index.ts` for index-level behavior.

## 2. Minimum Gates

- Required:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If retrieval strategy or acceptance semantics change:
  - `npm run ci:acceptance:gate`

## 3. Risk Boundary

- Retrieval output shape changes can break upstream callers.
- Preserve enough error detail to keep failures diagnosable.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
