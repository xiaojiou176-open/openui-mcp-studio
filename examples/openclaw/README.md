# OpenClaw public-ready starter

This directory records the repo-owned OpenClaw public-ready surface.

OpenClaw already documents plugin bundles, ClawHub publication, and
Claude-compatible bundle import. OpenUI does **not** claim a live ClawHub
listing today, but it now ships a repo-owned bundle and proof loop that can be
installed and evaluated honestly.

## Install path

1. Build the repo if needed.
   - `npm install`
   - `npm run build`
2. Install the Claude-compatible bundle:
   - `openclaw plugins install ./plugins/openui-workspace-delivery`
3. Review the OpenClaw starter JSON:
   - `packages/skills-kit/starter-bundles/openclaw.mcp.json`

## Proof loop

1. `openui-mcp-studio ecosystem-guide --json`
2. `openui-mcp-studio skills starter --json`
3. `npm run repo:doctor`
4. Open `docs/proof-and-faq.md`

## Boundaries

- public-ready inside the repo-owned surface
- not a ClawHub listing
- not an official OpenClaw runtime verification claim
