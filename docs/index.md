# Documentation Index

This page is the public routing layer for the repository.

English is the canonical source of truth for repository governance and
maintenance.

## For First-Time Visitors

Start here if you are trying to answer "what does this project do for me?"

- [`README.md`](../README.md)
- [`docs/first-minute-walkthrough.md`](./first-minute-walkthrough.md)
- [`docs/proof-and-faq.md`](./proof-and-faq.md)
- [`docs/evaluator-checklist.md`](./evaluator-checklist.md)
- [`docs/architecture.md`](./architecture.md)

## For Evaluators

Start here if you are deciding whether the workflow is trustworthy enough to
try, adopt, or share.

- [`docs/testing.md`](./testing.md)
- [`docs/environment-governance.md`](./environment-governance.md)
- [`docs/release-readiness.md`](./release-readiness.md)
- [`docs/release-template.md`](./release-template.md)

## For Maintainers

Start here if you are changing repository rules, upstream policy, or incident
handling.

- [`docs/governance-runbook.md`](./governance-runbook.md)
- [`docs/public-surface-guide.md`](./public-surface-guide.md)
- [`docs/upstream-sync-sop.md`](./upstream-sync-sop.md)
- clone-local upstream readiness is checked separately from repo-wide upstream
  contract health; use the SOP before assuming a local checkout is sync-ready
- [`docs/secrets-incident-runbook.md`](./secrets-incident-runbook.md)
- [`LICENSE`](../LICENSE)
- [`SECURITY.md`](../SECURITY.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`CODEOWNERS`](../CODEOWNERS)
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)
- [`SUPPORT.md`](../SUPPORT.md)

## Authoritative Contracts

- [`contracts/governance/public-surfaces.json`](../contracts/governance/public-surfaces.json)
- [`contracts/governance/root-allowlist.json`](../contracts/governance/root-allowlist.json)
- [`contracts/governance/dependency-boundaries.json`](../contracts/governance/dependency-boundaries.json)
- [`contracts/governance/module-topology.json`](../contracts/governance/module-topology.json)
- [`contracts/runtime/path-registry.json`](../contracts/runtime/path-registry.json)
- [`contracts/runtime/run-layout.json`](../contracts/runtime/run-layout.json)
- [`contracts/runtime/space-governance.json`](../contracts/runtime/space-governance.json)
- [`contracts/observability/log-event.schema.json`](../contracts/observability/log-event.schema.json)
- [`contracts/upstream/inventory.json`](../contracts/upstream/inventory.json)
- [`contracts/upstream/pinned-sources.json`](../contracts/upstream/pinned-sources.json)
- [`contracts/upstream/compatibility-matrix.json`](../contracts/upstream/compatibility-matrix.json)
- [`contracts/upstream/patch-registry.json`](../contracts/upstream/patch-registry.json)
- [`contracts/upstream/glue-surfaces.json`](../contracts/upstream/glue-surfaces.json)

## Fast Validation Commands

```bash
npm run demo:ship
npm run repo:doctor
npm run repo:space:report
npm run repo:space:check
npm run repo:space:verify
npm run security:evidence:final
npm run governance:remote:review
npm run smoke:e2e
npm run release:public-safe:check
```

## Release Evidence Inputs

- `docs/contracts/openui-mcp.openapi.json`
- `docs/contracts/performance-budget.json`
- `docs/contracts/rum-slo.json`
- `docs/contracts/feature-flags.json`
- `docs/contracts/canary-policy.json`
- `docs/contracts/rollback-policy.json`
- `docs/contracts/observability-policy.json`
- `docs/contracts/ci-image-supply-chain.json`

These JSON files are machine-consumed release and readiness inputs. They stay in
the docs tree because the repository treats release evidence as part of the
public engineering surface.

## Historical Archive

No tracked historical markdown archive is kept in the minimal docs profile.

Archive material is historical only and must not be treated as the current
operating truth.
