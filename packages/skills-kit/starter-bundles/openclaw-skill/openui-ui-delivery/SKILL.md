# OpenUI UI Delivery

This bundle is the repo-owned **public-ready** OpenClaw / ClawHub-facing skill
surface for `OpenUI MCP Studio`.

It is intentionally stronger than "bridge materials only" because the repo now
ships:

- starter configs
- public proof loops
- supporting starter-pack artifacts
- machine-readable public-distribution manifests

It is still intentionally narrower than a live listing:

- this skill is **ClawHub-ready**
- this skill is **not** claimed as already published
- this skill is **not** claimed as an officially verified OpenClaw runtime

## Use

1. Read `examples/public-distribution/openclaw-install-and-proof.md`
2. Read `examples/public-distribution/openclaw-public-ready.manifest.json`
3. Reuse `examples/public-distribution/generic-mcp.json` for the local stdio
   launch contract

## Proof

- `node tooling/public-distribution-proof.mjs`
- `node tooling/cli/openui.mjs skills starter --json`
- `node tooling/skills-install-proof.mjs`
