# Public Distribution Bundle

This directory is the supporting install bundle shelf for the public
`OpenUI MCP Studio` repo.

Think of it like the install box you can hand to a new developer after they
already understand that the public repo is the main product surface:

- sample configs for Codex, Claude Code, and generic stdio MCP hosts
- a repo-scoped Codex marketplace sample plus a marketplace-compatible Claude
  bundle
- one install-and-proof note for the quickest plug-and-play path
- one troubleshooting note for the most common setup failures
- one OpenClaw public-ready bundle that is honest about what is ready and what
  still needs operator publication

## SSOT Split

Use this split to avoid accidental duplicate truth:

- `packages/skills-kit/starter-bundles/*` = installable package SSOT
- `examples/public-distribution/*` = repo-frontdoor public mirror for GitHub,
  docs, and zero-context discovery

The content should tell the same story, but the public repo remains the main
distribution artifact and the package bundle remains the installable
source-of-truth surface.

## What This Bundle Is For

Use this bundle when you want to say something stronger than
"there is an install snippet in the README" but still stay truthful.

This bundle is meant to make four things easy to discover:

1. how to install OpenUI into Codex
2. how to install OpenUI into Claude Code
3. how to adapt the same local stdio launch contract for another MCP-capable
   host
4. how to prepare an OpenClaw / ClawHub-facing public-ready bundle without
   claiming that the listing is already published

## Files

| File | Role |
| --- | --- |
| `public-distribution.manifest.json` | Machine-readable package-ready distribution manifest |
| `codex.mcp.json` | Sample Codex MCP config contract |
| `claude-code.mcp.json` | Sample Claude Code MCP config contract |
| `generic-mcp.json` | Sample generic stdio MCP launch contract |
| `../codex/marketplace.sample.json` | Repo-scoped Codex marketplace sample for the official local plugin directory |
| `../../.claude-plugin/marketplace.json` | Marketplace-compatible Claude bundle entry |
| `install-and-proof.md` | Human-readable install and proof loop |
| `troubleshooting.md` | Fast recovery guide for common local setup failures |
| `openclaw-public-ready.manifest.json` | Machine-readable OpenClaw / ClawHub-ready bundle manifest |
| `openclaw-install-and-proof.md` | Human-readable OpenClaw public-ready install and proof note |

## Hard Boundaries

- This bundle is **package-ready**, not "officially marketplace listed."
- This bundle can be **public-ready** for OpenClaw and ClawHub without claiming
  that a real listing has already been published or approved.
- `@openui/sdk` and the self-hosted Hosted API remain supporting / parked lanes
  in this bundle. They still exist, but they are not the front-door lead story
  for the current raised-bar program.
- The primary runtime is still the local `stdio` MCP server.

## Proof Loop

Use the bundle like this:

```bash
node tooling/cli/openui.mjs surface-guide
node tooling/cli/openui.mjs ecosystem-guide --json
node tooling/public-distribution-proof.mjs
node tooling/skills-install-proof.mjs
```

That sequence proves the bundle files exist, the install contracts stay
machine-readable, and the Skills starter pack still resolves as a real repo-owned
artifact.
