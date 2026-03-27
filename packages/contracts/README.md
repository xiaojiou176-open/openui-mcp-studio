# packages/contracts

## Responsibility

This package stores reusable code-level contracts, such as the environment contract and other shared cross-module facts.

## Out Of Scope

- business execution logic
- provider-specific behavior
- UI or smoke-flow implementation details

## Dependencies

- consumed by `services/`, `tooling/`, and `tests/`
- should remain a pure contract layer and must not depend back on business modules

## Runtime

- exercised indirectly through root-level env and governance checks
- any contract change must update the relevant README, docs, and tests in the same change
