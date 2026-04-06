# tooling

## Responsibility

`tooling/` is the repository governance and automation enforcement layer. It
validates contracts, generates reports, runs quality gates, and provides
operational helpers.

## Out Of Scope

- Directly implementing product pages
- Reaching into private service internals
- Becoming a second architecture source of truth

## Dependencies

- Depends on `contracts/` as its fact source
- Depends on the public surfaces from `packages/shared-runtime` and
  `packages/runtime-observability`
- Invoked by `package.json` scripts and CI workflows

## Runtime

- Main entrypoints: `governance:*`, `ci:gate`, and `verify:clean-room`
- Outputs must stay under `.runtime-cache/` and must not pollute the repository
  root
