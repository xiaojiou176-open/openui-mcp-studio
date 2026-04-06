# CLAUDE.md

This file adds Claude Code specific guidance for `tooling/shared`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read `tooling/shared/child-env.mjs` and its callers first.
2. Keep the change set minimal and compatible.

## 2. Minimum Gates

- Required:
  - `npm run lint`
  - `npm run test`
- If env pass-through behavior changes:
  - `npm run env:check`

## 3. Risk Boundary

- Shared script changes can affect a wide surface, so compatibility matters first.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
