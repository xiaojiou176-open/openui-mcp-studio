# AGENTS

This file defines collaboration rules for `packages/contracts`.

## 1. Module Purpose

- Provide reusable code-level contracts and shared types.
- The current primary fact source is `src/env-contract.ts`.

## 2. Change Constraints

- Any key, default, or validation semantic change must also update `.env*.example`, `README.md`, and `docs/environment-governance.md`.
- The contract layer must not depend on service business implementations.

## 3. Minimum Gates

- `npm run env:check`
- `npm run env:governance:check`
- `npm run typecheck`
