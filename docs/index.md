# Documentation Index

This page is the routing layer for the minimal tracked documentation set.

English is the canonical source of truth for repository governance and
maintenance.

## Start Here

- [`README.md`](../README.md)
- [`docs/architecture.md`](./architecture.md)
- [`docs/environment-governance.md`](./environment-governance.md)
- [`docs/testing.md`](./testing.md)
- [`docs/governance-runbook.md`](./governance-runbook.md)
- [`docs/release-readiness.md`](./release-readiness.md)
- [`docs/upstream-sync-sop.md`](./upstream-sync-sop.md)
- [`docs/secrets-incident-runbook.md`](./secrets-incident-runbook.md)

## Public Governance Entry Points

```bash
npm run repo:doctor
npm run repo:verify:fast
npm run repo:verify:full
npm run repo:upstream:check
npm run release:public-safe:check
```

## Community And Legal Surface

- [`LICENSE`](../LICENSE)
- [`SECURITY.md`](../SECURITY.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`CODEOWNERS`](../CODEOWNERS)
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- [`SUPPORT.md`](../SUPPORT.md)

## Authoritative Contracts

- [`contracts/governance/root-allowlist.json`](../contracts/governance/root-allowlist.json)
- [`contracts/governance/dependency-boundaries.json`](../contracts/governance/dependency-boundaries.json)
- [`contracts/governance/module-topology.json`](../contracts/governance/module-topology.json)
- [`contracts/governance/public-surfaces.json`](../contracts/governance/public-surfaces.json)
- [`contracts/runtime/path-registry.json`](../contracts/runtime/path-registry.json)
- [`contracts/runtime/run-layout.json`](../contracts/runtime/run-layout.json)
- [`contracts/observability/log-event.schema.json`](../contracts/observability/log-event.schema.json)
- [`contracts/upstream/inventory.json`](../contracts/upstream/inventory.json)
- [`contracts/upstream/pinned-sources.json`](../contracts/upstream/pinned-sources.json)
- [`contracts/upstream/compatibility-matrix.json`](../contracts/upstream/compatibility-matrix.json)
- [`contracts/upstream/patch-registry.json`](../contracts/upstream/patch-registry.json)
- [`contracts/upstream/glue-surfaces.json`](../contracts/upstream/glue-surfaces.json)

## Release Evidence Inputs

- `docs/contracts/openui-mcp.openapi.json`
- `docs/contracts/performance-budget.json`
- `docs/contracts/rum-slo.json`
- `docs/contracts/feature-flags.json`
- `docs/contracts/canary-policy.json`
- `docs/contracts/rollback-policy.json`
- `docs/contracts/observability-policy.json`
- `docs/contracts/ci-image-supply-chain.json`

These JSON files are machine-consumed release/readiness inputs. They are part of
the minimal public repository surface even though they are not narrative guides.

## Historical Archive

No tracked historical markdown archive is kept in the minimal docs profile.

Archive material is historical only and must not be treated as the current
operating truth.
