# ops/ci-container

## Responsibility

This directory provides the containerized execution entrypoint that runs repository commands inside the governed CI/runtime image.

## Out Of Scope

- business-test logic itself
- upstream contract definition
- product page implementation

## Dependencies

- depends on `.github/ci-image.lock.json`
- is invoked by `.github/actions/run-in-ci-container/action.yml`, the manual `repo:verify:full` entrypoint, and the opt-in `ci:local:container:bootstrap` script when a local image bootstrap is explicitly requested

## Runtime

- primary entrypoint: `ops/ci-container/run-in-container.sh`
- any container execution must use an immutable digest or an explicit image reference
- workspace-scoped local container parity is single-flight and holds a repo-local lock under `.runtime-cache/locks/`
