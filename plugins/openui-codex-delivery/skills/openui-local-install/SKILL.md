# OpenUI local install for Codex

## Goal

Help the operator use the repo-owned Codex bundle and starter JSON to install
OpenUI MCP Studio from a local checkout.

## Read first

- `examples/codex/marketplace.sample.json`
- `plugins/openui-codex-delivery/samples/codex.mcp.json`
- `packages/skills-kit/starter-troubleshooting.md`

## Default route

1. Copy `examples/codex/marketplace.sample.json` into the official repo-scoped
   Codex marketplace path if needed.
2. Use `samples/codex.mcp.json` or
   `packages/skills-kit/starter-bundles/codex.mcp.json` as the local MCP config.
3. Replace the absolute repo path.
4. Run the proof loop:
   - `openui-mcp-studio surface-guide --json`
   - `openui-mcp-studio ecosystem-guide --json`
   - `npm run repo:doctor`

## Boundaries

- Do not claim an official Plugin Directory listing.
- Do not claim vendor approval beyond local plugin-grade packaging.
