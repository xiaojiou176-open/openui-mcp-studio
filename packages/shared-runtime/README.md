# packages/shared-runtime

## Responsibility

This package is the shared runtime substrate for reusable cross-module capabilities such as path safety, job queues, idempotency, and child-process environment handling.

## Out Of Scope

- tool-layer business orchestration
- provider implementation details
- UI review heuristics

## Dependencies

- consumed by `services/mcp-server` and `tooling/`
- must not depend back on business-facing tool layers

## Runtime

- exercised indirectly through `test`, `test:fast:gate`, `ci:gate`, and repository governance scripts
- runtime cache and idempotency data default to `.runtime-cache/cache`
