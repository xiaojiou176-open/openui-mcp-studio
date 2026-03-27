# ops/ci-container

## Responsibility

This directory provides the containerized execution entrypoint that runs repository commands inside the governed CI/runtime image.

## Out Of Scope

- business-test logic itself
- upstream contract definition
- product page implementation

## Dependencies

- depends on `.github/ci-image.lock.json`
- is invoked by `.github/actions/run-in-ci-container/action.yml` and the public `repo:verify:full` entrypoint

## Runtime

- primary entrypoint: `ops/ci-container/run-in-container.sh`
- any container execution must use an immutable digest or an explicit image reference
