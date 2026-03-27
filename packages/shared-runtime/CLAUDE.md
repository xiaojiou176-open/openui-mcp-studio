# CLAUDE.md

This file adds Claude Code specific guidance for `packages/shared-runtime`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

1. Read the target runtime primitive and its consumers first.
2. Confirm that the change preserves the package as a pure runtime substrate instead of re-coupling service business behavior.
3. Before reporting completion, run:
   - `npm run typecheck`
   - `npm run governance:deps:check`
   - `npm run test`
