# CLAUDE.md

This file adds Claude Code specific guidance for `services/mcp-server/src/uiux`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read `services/mcp-server/src/uiux/review-schema.ts`.
2. Confirm which callers depend on the schema.
3. Run the minimum gate set after any change.

## 2. Minimum Gates

- Required:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If the change affects visual-review behavior:
  - `npm run visual:qa`

## 3. Risk Boundary

- Avoid unversioned breaking schema changes.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
