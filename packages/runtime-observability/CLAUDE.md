# CLAUDE.md

This file adds Claude Code specific guidance for `packages/runtime-observability`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

1. Read the target observability primitive and its call sites first.
2. Any change to log schema, redaction, or retention policy must also be checked against the governance gates.
3. Before reporting completion, run:
   - `npm run typecheck`
   - `npm run governance:log-schema:check`
   - `npm run test`
