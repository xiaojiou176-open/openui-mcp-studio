# OpenUI Public Skills / Plugin-like Surface Ledger

> Current ledger for the public Skills starter pack and plugin-like install
> packaging.

## 1. Current Truth

- formal public Skills surface now exists as:
  - repo mirror under `examples/skills/`
  - installable package under `packages/skills-kit`
- plugin-like packaging now exists as a plugin-grade public distribution
  package for Codex and Claude Code
- the repo also now exposes an OpenClaw public-ready starter bundle plus the
  public Skills starter pack, without claiming official OpenClaw verification
- neither surface implies marketplace listing or vendor-approved plugin support

## 2. Install / Use Path

### Skills starter pack

- package:
  - `@openui/skills-kit`
- repo mirror:
  - `examples/skills/public-starter.manifest.json`
  - `examples/skills/install-use-note.md`
  - `examples/skills/starter-troubleshooting.md`
- CLI:
  - `openui-mcp-studio skills starter --json`

### Plugin-like packaging

- Codex:
  - `codex mcp add openui --env GEMINI_API_KEY=... -- node /ABS/PATH/.../main.js`
  - `examples/skills/codex.mcp.json`
  - `examples/codex/marketplace.sample.json`
- Claude Code:
  - `claude mcp add --transport stdio --env GEMINI_API_KEY=... openui -- node /ABS/PATH/.../main.js`
  - `examples/skills/claude-code.mcp.json`
  - `.claude-plugin/marketplace.json`
- generic stdio MCP host:
  - `{ "command": "node", "args": ["/ABS/PATH/.../main.js"], "env": { "GEMINI_API_KEY": "..." } }`
- OpenClaw:
  - `examples/skills/openclaw.mcp.json`
  - `examples/openclaw/public-ready.manifest.json`
- discovery docs:
  - `docs/discovery-surfaces.md`
  - `docs/contracts/openui-ecosystem-productization.json`

## 3. Official Support Matrix

| Surface | Officially supported | Honest current claim | Not allowed to claim |
| --- | --- | --- | --- |
| Codex MCP install | yes | official-surface-ready plugin-grade public package is current | listed Codex directory item |
| Claude Code MCP install | yes | marketplace-ready plugin-grade public package is current | listed Claude marketplace item |
| Generic MCP host | repo-owned template | reusable stdio launch contract is current | host-specific verification without proof |
| OpenClaw public-ready bundle | repo-owned bridge inputs | starter bundle plus public Skills starter pack are current, and the official public surface exists as ClawHub | official OpenClaw runtime, ClawHub listing, or plugin publication |
| Skills starter pack | repo-owned packaging | installable public starter pack is current | hosted Skills runtime |
| Marketplace / plugin listing | no fresh official proof | operator-only / unsupported today | current public listing |

## 4. Proof Path

- `node tooling/cli/openui.mjs skills starter --json`
- `node tooling/cli/openui.mjs ecosystem-guide --json`
- `node tooling/skills-install-proof.mjs`
- `npm run repo:doctor`
- `npm run demo:ship`
- `tests/openui-skills-kit-package.test.ts`
- `tests/public-skills-starter.test.ts`

## 5. Not-For Boundary

- marketplace listing claims
- managed Skills runtime claims
- hosted API or SDK parity claims
- generic external integration platform wording

## 6. Operator-Only Tail

- marketplace or vendor submission
- external approval workflows for plugin ecosystems
- any future managed runtime or hosted packaging
