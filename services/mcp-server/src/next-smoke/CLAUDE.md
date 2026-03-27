# CLAUDE.md

This file adds Claude Code specific guidance for `services/mcp-server/src/next-smoke`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read:
   - `services/mcp-server/src/next-smoke/run.ts`
   - `services/mcp-server/src/next-smoke/process.ts`
2. Then inspect the relevant `process-*.ts` or `probe.ts` file for the change.
3. Apply the smallest valid change and run the minimum gate set.

## 2. Minimum Gates

- Required:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run smoke:e2e`
- If the change affects the shared flow:
  - `npm run test`

## 3. Risk Boundary

- Prioritize clean shutdown behavior, diagnosable errors, and safe timeout handling.
- Do not add unrelated abstraction layers inside this module.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
