# CLAUDE.md

This file adds Claude Code specific guidance for `tests/e2e`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read the relevant `*.spec.ts` file and nearby helpers.
2. Identify the critical user journey affected by the change.
3. Run the minimum gate set and inspect failure traces or logs if needed.

## 2. Minimum Gates

- Required:
  - `npm run test:e2e`
- If the Next application startup path is affected:
  - `npm run smoke:e2e`

## 3. Risk Boundary

- Avoid unstable waiting strategies.
- Keep selectors and assertions semantic instead of brittle.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
