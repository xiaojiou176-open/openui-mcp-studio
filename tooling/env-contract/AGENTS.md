# AGENTS

This file defines collaboration rules for `tooling/env-contract`.

## 1. Module Purpose

- Provide environment-contract checking, parsing, formatting, and CLI behavior.
- Together with `packages/contracts/src/env-contract.ts`, this module forms the main environment-governance path.

## 2. Technology And Dependencies

- Language: Node.js ESM (`.mjs`)
- Key files:
  - `check.mjs`
  - `cli.mjs`
  - `format.mjs`
  - `parse.mjs`

## 3. Navigation

- Validation logic: `tooling/env-contract/check.mjs`
- CLI entrypoint: `tooling/env-contract/cli.mjs`
- Parsing and formatting:
  - `tooling/env-contract/format.mjs`
  - `tooling/env-contract/parse.mjs`

## 4. Minimum Gates

- After script changes, run at least:
  - `npm run env:check`
  - `npm run lint`
  - `npm run test`

## 5. Change Constraints

- If env semantics change, keep these synchronized:
  - `packages/contracts/src/env-contract.ts`
  - `.env.example`
  - `README.md`
  - `docs/environment-governance.md`
- Never print sensitive values from these scripts.
