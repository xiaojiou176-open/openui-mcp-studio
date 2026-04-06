# OpenClaw Public-Ready Bundle

This note is for the OpenClaw lane specifically.

## Current Truth

Official OpenClaw surfaces now prove two things:

1. OpenClaw has a public integrations surface.
2. ClawHub exists as a public skill registry.

That changes the honest repo-owned claim.

OpenUI is no longer just "bridge materials only" for OpenClaw.
It is now more honest to say:

- OpenClaw bundle = **public-ready**
- ClawHub listing = **not claimed yet**

## What To Use

Start from these repo-owned artifacts:

- `examples/public-distribution/generic-mcp.json`
- `examples/skills/public-starter.manifest.json`
- `examples/public-distribution/openclaw-public-ready.manifest.json`
- `examples/openclaw/public-ready.manifest.json`
- `plugins/openui-workspace-delivery/.claude-plugin/plugin.json`

Use them together like this:

1. generic MCP config = how OpenUI launches
2. skills starter manifest = what skill-shaped artifacts exist today
3. public-ready manifest = what the repo can honestly hand to a registry or
   listing workflow right now
4. Claude-compatible bundle = what OpenClaw can install today before any
   ClawHub publication happens

## Proof Loop

```bash
openclaw plugins install ./plugins/openui-workspace-delivery
node tooling/public-distribution-proof.mjs
node tooling/cli/openui.mjs skills starter --json
node tooling/skills-install-proof.mjs
```

That proves the bundle is real and the supporting starter-pack artifacts still
resolve.

## What You Still Cannot Claim

- You cannot claim a live ClawHub listing until a real publish step happens.
- You cannot claim OpenClaw-side runtime verification unless you fresh-prove it
  inside that host.
- You cannot claim platform approval or review completion from repo-local files
  alone.
