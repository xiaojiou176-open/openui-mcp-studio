# packages/runtime-observability

## Responsibility

This package owns the repository's shared observability surface, including structured logging, redaction, run-id scoping, and cache-retention helpers.

## Out Of Scope

- business decision logic
- test orchestration
- upstream maintenance workflow logic

## Dependencies

- consumed by `services/mcp-server`, `tooling/`, and governance gates
- must remain a public observability surface and must not depend back on business modules

## Runtime

- file logs and evidence default to `.runtime-cache/runs/<run_id>/logs/*`
- redaction and run-context behavior should be centralized here
