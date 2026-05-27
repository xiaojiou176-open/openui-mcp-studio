# AGENTS

This file defines collaboration rules for `tooling/contracts`.

## 1. Module Purpose

- Store documentation and governance contract files that serve as fact sources for checks.

## 2. Technology And Dependencies

- Data format: JSON
- Current contract focus:
  - `tooling/contracts/docs-completeness.contract.json`

## 3. Navigation

- Docs completeness contract:
  - `tooling/contracts/docs-completeness.contract.json`

## 4. Minimum Gates

- After contract changes, run at least:
  - `npm run docs:check`
  - `npm run test`
- Suggested broader gate:
  - `npm run ci:acceptance:gate`

## 5. Change Constraints

- Every contract entry must remain checkable by existing scripts.
- Do not add contract fields that no gate consumes.
