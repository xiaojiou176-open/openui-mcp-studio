# ShadcnBrief UI Delivery

Use this skill when you want Codex to turn a UI brief into React + shadcn files
inside a real workspace while keeping proof, review, and acceptance visible.

## What this bundle is for

- prompt-to-workspace UI delivery
- proof-first review flow
- React + shadcn teams using ShadcnBrief through local stdio MCP

## What it is not

- not proof that the plugin is already listed in the official Codex directory
- not a hosted builder
- not a write-anywhere remote control plane

## Short proof loop

1. Build the repo with `npm install && npm run build`.
2. Point `.mcp.json` at the built `main.js` path.
3. Run `ShadcnBrief surface-guide --json`.
4. Run `ShadcnBrief ecosystem-guide --json`.
5. Run `npm run repo:doctor`.
