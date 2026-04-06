# CLAUDE.md

This file adds Claude Code specific guidance for `tests/visual-golden`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Confirm the source of the visual diff first.
2. Decide whether the code should change or the baseline should change.
3. Re-run visual QA after any update.

## 2. Minimum Gates

- Required:
  - `npm run visual:qa`
- Baseline refresh flow:
  - `npm run visual:qa:update`
  - `npm run visual:qa`

## 3. Risk Boundary

- Do not overwrite unknown diffs as new baselines.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
