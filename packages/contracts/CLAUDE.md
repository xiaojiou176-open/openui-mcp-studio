# CLAUDE.md

This file adds Claude Code specific guidance for `packages/contracts`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

1. Read `packages/contracts/src/env-contract.ts` first.
2. Before changing the contract, confirm whether `README.md` and docs env tables must change in the same task.
3. Before reporting completion, run:
   - `npm run env:check`
   - `npm run env:governance:check`
   - `npm run typecheck`
