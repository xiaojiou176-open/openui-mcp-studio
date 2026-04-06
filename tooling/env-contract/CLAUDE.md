# CLAUDE.md

This file adds Claude Code specific guidance for `tooling/env-contract`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read `check.mjs` and `parse.mjs` first.
2. Then inspect `cli.mjs` for external behavior.
3. Run env contract and baseline tests after changes.

## 2. Minimum Gates

- Required:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`

## 3. Risk Boundary

- Any env contract change is high-impact and must stay synchronized with docs and example files.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
