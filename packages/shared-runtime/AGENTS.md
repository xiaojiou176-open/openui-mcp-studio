# AGENTS

This file defines collaboration rules for `packages/shared-runtime`.

## 1. Module Purpose

- Provide pure shared runtime substrate utilities across services and tooling.
- Current scope includes env pass-through, path safety, process execution, target build handling, queues, and idempotency helpers.

## 2. Change Constraints

- Do not back-reference `services/mcp-server/src/tools`, `providers`, `retrieval`, `uiux`, or `next-smoke`.
- Keep shared interfaces stable and avoid hard-coding service-specific business semantics into the package layer.

## 3. Minimum Gates

- `npm run typecheck`
- `npm run governance:deps:check`
- `npm run test`
