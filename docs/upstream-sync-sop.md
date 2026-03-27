# Upstream Maintenance SOP

This repository keeps upstream visibility on demand and does not treat
whole-repo merge as the default maintenance route.

## Default Rule

- use selective port as the default route
- use larger adoption only when necessary
- treat whole-repo merge or rebase as exceptional

This repository is a long-lived productized fork, not a lightweight mirror.

Important boundary:

- upstream contract health and current-clone sync readiness are **not** the
  same thing
- this repository keeps the canonical upstream URL and sync discipline under
  version control
- the default local clone may still only have `origin` configured until an
  operator starts a real upstream maintenance pass

## Required Preparation

Before upstream work begins:

```bash
npm run sync:upstream:init
npm run repo:upstream:check
git fetch upstream --prune --tags
npm run security:history:audit
```

What these commands do:

- `npm run repo:upstream:check`
  - proves the repo-side upstream contracts, patch governance, and post-fetch
    history discipline are healthy
  - prints non-blocking clone-local sync-preflight truth so operators can see
    whether `upstream` is attached **right now**
- `npm run sync:upstream:init`
  - attaches or repairs the canonical `upstream` remote on demand for the
    current clone
  - does **not** mean every clone must keep `upstream` attached all the time

Hard rule:

- any upstream fetch can repopulate local tracking refs with historical findings
- do not assume a previously clean local clone is still history-clean until the
  post-fetch audit passes again
- when upstream work is finished, return the default local state to canonical
  refs only by removing the temporary upstream remote or by discarding the
  disposable clone/worktree used for the maintenance pass
- do not describe a clone as "ready for upstream sync" unless the clone-local
  preflight checks are green for that clone at that moment

## Allowed Adoption Shapes

1. selective port
2. targeted adoption
3. reject or defer

Whole-repo merge is exceptional only.

## Clone-Local Truth

Use this shortcut when you want to distinguish repo-wide upstream policy from
the current clone's live state:

- **repo-wide upstream policy is healthy**
  means the contracts, compatibility matrix, patch registry, and history
  discipline are green
- **this clone is ready for a sync pass**
  means `upstream` exists, `upstream/main` is fetched locally, and the current
  branch satisfies the sync preflight checks

Do not collapse those two statements into one.

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
