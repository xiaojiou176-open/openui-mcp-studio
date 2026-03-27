# CLAUDE.md

This file adds Claude Code execution guidance for `ops/`. The shared baseline still comes from the root `AGENTS.md` and the local `ops/AGENTS.md`.

1. Read the relevant workflow, action, or contract before editing.
2. Confirm whether the change affects containers, release flow, upstream governance, or environment parity.
3. Before handoff, run at least `npm run governance:upstream:check && npm run governance:workflow:check && npm run iac:check`.
