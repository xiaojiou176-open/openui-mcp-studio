# Upstream Maintenance SOP

This repository keeps upstream visibility but does not treat whole-repo merge as
the default maintenance route.

## Default Rule

- use selective port as the default route
- use larger adoption only when necessary
- treat whole-repo merge or rebase as exceptional

This repository is a long-lived productized fork, not a lightweight mirror.

## Required Preparation

Before upstream work begins:

```bash
npm run repo:upstream:check
git fetch upstream --prune --tags
npm run security:history:audit
```

Hard rule:

- any upstream fetch can repopulate local tracking refs with historical findings
- do not assume a previously clean local clone is still history-clean until the
  post-fetch audit passes again

## Allowed Adoption Shapes

1. selective port
2. targeted adoption
3. reject or defer

Whole-repo merge is exceptional only.

## Minimum Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run ci:gate
```

If the affected surface touches the default frontend proof target, also run the
relevant smoke, E2E, or visual checks.

## PR Expectations

Every upstream maintenance PR must state:

1. upstream source evidence
2. selected adoption shape
3. changed subsystem or contract surface
4. validation results
5. rollback path

Do not use merge-first wording in PRs, dry runs, or reviewer guidance.
