# CLAUDE.md

This file adds Claude Code specific guidance for `tooling/contracts`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read the target contract JSON and its checker script first.
2. Keep the change set minimal.
3. Run docs and test gates before reporting completion.

## 2. Minimum Gates

- Required:
  - `npm run docs:check`
  - `npm run test`
- Suggested:
  - `npm run ci:acceptance:gate`

## 3. Risk Boundary

- Contracts that are too strict block normal development.
- Contracts that are too loose lose governance value.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
