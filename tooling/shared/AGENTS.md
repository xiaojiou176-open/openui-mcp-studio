# AGENTS

This file defines collaboration rules for `tooling/shared`.

## 1. Module Purpose

- Hold shared script helpers to avoid duplicated logic across tooling.

## 2. Technology And Dependencies

- Language: Node.js ESM (`.mjs`)
- Current shared file:
  - `tooling/shared/child-env.mjs`

## 3. Navigation

- Shared child-process environment helper:
  - `tooling/shared/child-env.mjs`

## 4. Minimum Gates

- After changes, run at least:
  - `npm run lint`
  - `npm run test`
- If env pass-through semantics are affected, also run:
  - `npm run env:check`

## 5. Change Constraints

- Keep shared script interfaces stable for current callers.
