# @openui/skills-kit

Installable package for the official repo-owned OpenUI skill product line.

This package is the strongest truthful skill surface in the current repository:

- it is installable
- it now ships plugin-grade starter bundles for Codex and Claude Code plus an OpenClaw-ready skill line
- it exposes machine-readable starter artifacts, proof loops, and troubleshooting
- it does not pretend a marketplace, official plugin listing, or hosted skills runtime exists

## Install

```bash
npm install /ABS/PATH/openui-mcp-studio/packages/skills-kit
```

## Use

```js
import {
  OPENUI_SKILLS_KIT_MANIFEST,
  OPENUI_SKILLS_STARTER_TEMPLATE,
  OPENUI_SKILLS_STARTER_EXAMPLE,
} from "@openui/skills-kit";
```

## Verify

```bash
node --input-type=module -e "import { OPENUI_SKILLS_KIT_MANIFEST } from '@openui/skills-kit'; console.log(OPENUI_SKILLS_KIT_MANIFEST.packageName)"
```

## Starter Bundles

- `starter-bundles/codex.mcp.json`
  - repo-owned Codex stdio MCP starter config
- `starter-bundles/claude-code.mcp.json`
  - repo-owned Claude Code stdio MCP starter config
- `starter-bundles/openclaw.mcp.json`
  - repo-owned OpenClaw public-ready bridge bundle
- `starter-bundles/codex-plugin/`
  - Codex Plugin Directory-ready bundle with `.codex-plugin/plugin.json`, `.mcp.json`, and a shared delivery skill
- `starter-bundles/claude-code-plugin/`
  - Claude Code marketplace-ready bundle with `.claude-plugin/plugin.json`, `.mcp.json`, and a shared delivery skill
- `starter-bundles/openclaw-skill/`
  - OpenClaw / ClawHub-ready skill bundle with `SKILL.md` and MCP config example
- `starter-troubleshooting.md`
  - fastest self-serve recovery note when attach or proof fails

These bundles are repo-owned skill product artifacts.
They do not claim publication or approval inside any official catalog.

## What it is for

- drafting starter contracts for OpenUI tool or workflow integrations
- keeping public-facing starter assets separate from internal `.agents/skills/*`
- giving builders one installable package instead of telling them to browse repo internals
- packaging sample config, proof loops, and troubleshooting so the product line feels closer to a real install surface without overclaiming listing truth

## What it is not

- not a marketplace listing
- not a hosted skills runtime
- not a vendor-approved plugin catalog
- not a ClawHub or official OpenClaw listing
