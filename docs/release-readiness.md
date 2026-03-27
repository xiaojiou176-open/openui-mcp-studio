# Release Readiness

This document explains the repository-side release and public-safe gates.

## Core Commands

```bash
npm run release:readiness:check
npm run release:public-safe:check
npm run governance:remote-evidence:check:strict
npm run governance:history-hygiene:check
```

## Command Boundaries

- `npm run release:readiness:check`
  - checks repository-side release evidence inputs
  - does not prove remote GitHub controls or full Git history hygiene
- `npm run release:public-safe:check`
  - is the canonical repository-side public-safe verdict
  - requires strict authoritative run evidence
  - requires strict remote governance evidence
  - requires classified history hygiene

## Remote Governance Boundary

Release readiness does not prove remote GitHub controls by itself.

Use:

- `npm run governance:remote-evidence:check:strict`
- `tooling/contracts/remote-governance-evidence.contract.json`

The canonical public-safe stance for this wave is:

- repository is public
- `main` is protected
- required checks are enforced
- CODEOWNERS review is enforced
- secret scanning is enabled
- push protection is enabled
- private vulnerability reporting is enabled

## Git History Boundary

Current-tree checks are not a substitute for full-history scanning.

- `npm run governance:history-hygiene:check` refreshes the raw history report
  first when the report artifact is missing
- classified history findings are different from rewritten-history proof
- public visibility does not waive this requirement

## Release Evidence Inputs

These machine-consumed inputs stay under `docs/contracts/`:

- `openui-mcp.openapi.json`
- `performance-budget.json`
- `rum-slo.json`
- `feature-flags.json`
- `canary-policy.json`
- `rollback-policy.json`
- `observability-policy.json`
- `ci-image-supply-chain.json`

These JSON files are intentionally retained even in the minimal docs profile.
