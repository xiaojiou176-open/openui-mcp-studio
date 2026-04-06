# AGENTS

This file defines collaboration rules for `packages/runtime-observability`.

## 1. Module Purpose

- Provide shared runtime logging, evidence, and observability helpers.
- Current module scope includes cache retention and redaction capabilities.

## 2. Change Constraints

- Do not back-reference service business layers.
- Any change to redaction, retention, or evidence semantics must stay aligned with `docs/environment-governance.md`, `docs/testing.md`, and the relevant governance contracts.

## 3. Minimum Gates

- `npm run typecheck`
- `npm run governance:log-schema:check`
- `npm run test`
