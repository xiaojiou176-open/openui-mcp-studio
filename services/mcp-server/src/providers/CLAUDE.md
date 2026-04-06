# CLAUDE.md

This file adds Claude Code specific guidance for `services/mcp-server/src/providers`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read `services/mcp-server/src/providers/types.ts` first.
2. Then read `services/mcp-server/src/providers/gemini-provider.ts`.
3. If the sidecar path is involved, read `services/mcp-server/src/providers/gemini-python-sidecar.ts`.

## 2. Minimum Gates

- Required:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If the sidecar path is affected:
  - `npm run py:smoke`

## 3. Risk Boundary

- Any model default change can affect both tests and docs.
- Keep provider errors diagnosable instead of swallowing failures.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
