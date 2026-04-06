# OpenUI Ecosystem Productization Ledger

> Current ledger for the ecosystem-facing product layer.
> This document now records current repo-owned distribution surfaces, plus the
> supporting lanes that remain parked instead of front-stage.

## 1. Core Rule

Only promote a lane to current truth when the repo can both **ship it** and
**verify it**.

That rule is now satisfied for two front-stage distribution surfaces in this
wave:

- plugin-grade public distribution package for Codex and Claude Code
- repo-owned OpenClaw public-ready bundle

The repo still retains two supporting or parked lanes with proof:

- `@openui/sdk`
- the self-hosted OpenUI Hosted API

It is **not** yet satisfied for:

- official marketplace or vendor listing support
- registry publication
- managed hosted deployment
- write-capable remote MCP

## 2. Current Ecosystem Truth

The strongest honest ecosystem packaging today is:

1. plugin-grade public distribution package for Codex and Claude Code
2. OpenClaw public-ready repo-owned bundle
3. compatibility OpenAPI bridge
4. repo-local workflow packet
5. public Skills starter pack via `@openui/skills-kit`
6. supporting SDK via `@openui/sdk`
7. supporting self-hosted OpenUI Hosted API via `openui-mcp-studio hosted ...`

That is now materially stronger than “repo-side starter only.”
It is still narrower than a marketplace listing or managed SaaS deployment.

## 3. Surface-by-Surface Status

| Surface | Current status | What it honestly means |
| --- | --- | --- |
| formal Skills | current-packaging | installable public starter pack plus repo mirror, but not a hosted runtime or marketplace item |
| plugin-grade package | official-surface-ready | Codex and Claude Code now have starter bundles, proof loop, troubleshooting, and discoverable metadata as one repo-owned install surface, and the official public surfaces exist even though no listing is claimed |
| OpenClaw | clawhub-ready | repo-owned starter bundle, proof loop, and discoverable artifacts exist, the official public surface exists as ClawHub, but no listing is claimed |
| SDK | supporting-parked | `@openui/sdk` is retained with proof, but no longer belongs on the front stage |
| hosted API | supporting-parked | a self-hosted HTTP runtime still exists, but it is now a supporting or parked lane rather than a primary public story |

## 4. Audience / Role / Packaging Shape

| Surface | Audience | Role | Packaging shape | Verification path |
| --- | --- | --- | --- | --- |
| `@openui/skills-kit` | maintainers and builders drafting skill-shaped flows | public starter pack | installable package + repo mirror under `examples/skills/` | `openui-mcp-studio skills starter --json` + `node tooling/skills-install-proof.mjs` |
| Codex / Claude package | Codex / Claude Code users plus other MCP-capable hosts using the generic launch template | plugin-grade public distribution package | README + discovery guide + starter bundles + CLI + machine-readable front door | config snippet review + `openui-mcp-studio ecosystem-guide --json` + `npm run repo:doctor` |
| OpenClaw bundle | OpenClaw-side builders and operators | repo-owned public-ready bundle | OpenClaw starter bundle + discovery guide + ecosystem contract | `openui-mcp-studio ecosystem-guide --json` + `npm run repo:doctor` |
| `@openui/sdk` | thin-client authors and integration developers | supporting SDK | installable package + import path + proof script | `node --import tsx tooling/sdk-install-proof.ts` |
| Hosted API runtime | adapter authors and self-host operators | supporting self-hosted service | root CLI `hosted info`, `hosted openapi`, `hosted serve` + hosted contract | `node --import tsx tooling/hosted-api-smoke.ts` |

## 5. What Is Now Current Truth

- local MCP installation is current and remains the primary builder runtime
- plugin-grade public distribution package for Codex and Claude Code is current
- OpenClaw public-ready repo-owned bundle is current
- public Skills starter-pack packaging is current
- the SDK and self-hosted API remain real but are now supporting or parked
- ecosystem metadata is exported through package surfaces, CLI guides, and
  machine-readable contracts

## 6. What Remains Later / Operator-Owned

- official marketplace or vendor listing support
- registry publication
- managed hosted deployment
- remote write-capable MCP

## 7. Operator-Only Actions

These remain outside repo-local closure even if the contracts exist:

- package registry publication
- vendor or marketplace account submission
- hosted infrastructure, deployment, and DNS
- any external approval or review workflow required by a client platform

## 8. Current Verdict

This wave should now be read as:

> make the ecosystem layer **real, installable, proofable, and publicly
> discoverable inside the repo**
> while keeping official listing, registry, and managed deployment claims out
> of the current truth.
