# AGENTS

This file defines collaboration rules for `tests/e2e`.

## 1. Module Purpose

- Hold Playwright E2E coverage for critical user journeys and resilience scenarios.
- Keep browser-level behavior testable and regression-safe.

## 2. Technology And Dependencies

- Framework: Playwright
- Key files: `*.spec.ts` and `helpers/`

## 3. Navigation

- Critical flow: `tests/e2e/critical-flow.spec.ts`
- Interaction guard: `tests/e2e/interaction-guard.spec.ts`
- Network resilience: `tests/e2e/network-resilience.spec.ts`
- External readonly probe: `tests/e2e/external-site-readonly.spec.ts`
- Helpers:
  - `tests/e2e/helpers/interaction.ts`
  - `tests/e2e/helpers/server.ts`

## 4. Minimum Gates

- After spec changes, run at least:
  - `npm run test:e2e`
- If the Next startup chain is affected, also run:
  - `npm run smoke:e2e`

## 5. Change Constraints

- Do not use fixed `sleep`; prefer dynamic waits.
- Keep coverage focused on critical browser paths and leave narrow edge logic to unit or integration tests.
