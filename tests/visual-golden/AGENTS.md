# AGENTS

This file defines collaboration rules for `tests/visual-golden`.

## 1. Module Purpose

- Store golden image baselines for visual regression comparison.

## 2. Technology And Dependencies

- Snapshot files: PNG baselines
- Related flows:
  - `npm run visual:qa`
  - `npm run visual:qa:update`

## 3. Navigation

- Current baseline:
  - `tests/visual-golden/apps-web-home.png`

## 4. Minimum Gates

- After baseline changes, run at least:
  - `npm run visual:qa`
- If the baseline truly must be refreshed, record and run:
  - `npm run visual:qa:update`

## 5. Change Constraints

- Baseline changes must include a reason such as design change, rendering strategy change, or dependency upgrade.
- Avoid bulk refreshing golden files without a clear reason.
