# Codex plugin-grade starter

Use this directory when you want the repo-owned Codex plugin-grade package
surface without pretending ShadcnBrief is already in the official Plugin Directory.

## What is here

- `marketplace.sample.json`
  - a copyable repo-scoped marketplace sample for `$REPO_ROOT/.agents/plugins/marketplace.json`
- `../../plugins/shadcn-brief-codex-delivery/`
  - the Codex bundle with install skill and starter sample
- `../../packages/skills-kit/starter-bundles/codex.mcp.json`
  - the copyable local MCP starter config

## Proof loop

1. Copy `marketplace.sample.json` into `$REPO_ROOT/.agents/plugins/marketplace.json`
2. Restart Codex and install the `ShadcnBrief Workspace Delivery` bundle
3. Use the starter MCP JSON, then run:
   - `ShadcnBrief surface-guide --json`
   - `ShadcnBrief ecosystem-guide --json`
   - `npm run repo:doctor`

## Boundaries

- This is plugin-grade packaging, not an official Plugin Directory listing.
- Codex official publishing is a later platform step.
