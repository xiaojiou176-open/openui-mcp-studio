## Summary

- What changed:
- Why:

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run ci:gate`

### Validation Result (Required)

- Summary:
- Command outputs:
  - `npm run lint`:
  - `npm run typecheck`:
  - `npm run test`:
  - `npm run build`:
  - `npm run ci:gate`:

## ENV Governance Checklist (Required for env/config changes)

- [ ] This PR changes `OPENUI_*` env behavior.
- [ ] Updated `packages/contracts/src/env-contract.ts` (keys/metadata) when env set changed.
- [ ] Updated `.env.example` to match the env contract.
- [ ] Updated `README.md` env section.
- [ ] `npm run env:check` passes.
- [ ] Runtime validation tests updated (`tests/runtime-config.test.ts`) if parsing/validation changed.

## Risk and Rollback

- Risk level:
- Rollback approach:

### Rollback Plan (Required)

- Trigger condition:
- Exact rollback steps/commands:

## Upstream and Dependency Governance (Required for dependency/upstream sync PRs)

- Backlog entry ID (Required):
  - `contracts/upstream/adoption-backlog.json` entry:
- Upstream version source (Required):
  - Release note / changelog URL:
  - Upstream tag / commit SHA:
- Conflict points (Required):
  1.
- Whole-repo merge/rebase exception note (Required when applicable):
  - If whole-repo merge/rebase was considered, explain why selective-port was not realistic:
- Verification result for conflict resolution (Required):
  - Key checks and outcomes:
- Backlog receipt update (Required when status becomes `done`):
  - `completedAt`:
  - `sourceCommit`:
  - `decisionSummary`:
  - `validationEvidence`:
  - `rollbackVerified`:

## Remote Governance Evidence (Required for governance changes)

- [ ] This PR changes how the repository describes or relies on remote GitHub governance controls.
- [ ] Updated `tooling/contracts/remote-governance-evidence.contract.json` when the verified/unverified status changed.
- [ ] If remote-side proof is still unavailable, kept the status as `unverified` instead of rewriting it as confirmed.
- [ ] Ran `npm run governance:remote-evidence:check:strict` before claiming any public-ready or remote-closure conclusion.
