# Discovery Surfaces

This page explains how to discover OpenUI MCP Studio without confusing
repo-owned truth with live deployment truth.

Use it when you want the shortest honest map from the GitHub storefront to the
front door, proof desk, operator desk, plugin-grade starter bundle, and
machine-readable builder surfaces.

## One Product, Two Names

Keep the naming split explicit:

- `OpenUI MCP Studio` is the technical product and runtime name
- `OneClickUI.ai` is the shorter front-door label

The label helps with discoverability. It does not prove that a live canonical
site, domain, or hosted product is already running.

## Discovery Chain

Read the surfaces in this order:

1. `README.md`
   Use this as the storefront on GitHub.
2. `/`
   Use the front door to understand the product sentence, guided paths, and
   builder order.
3. `/proof`
   Use the proof desk when trust is the first question.
4. `/walkthrough`
   Use this when you want the shortest guided newcomer route.
5. `/workbench`
   Use the operator desk only after the proof meaning is clear.
6. `/llms.txt`
   Use the shortest machine-readable product and route summary for LLMs and
   search/index systems.
7. `/api/frontdoor`
   Use the structured discovery contract for tooling and builder integrations.
8. `/manifest.webmanifest`, `/sitemap.xml`, and `/robots.txt`
   Use these browser/crawler metadata routes for install and crawl semantics.
9. `examples/skills/`
   Use the repo mirror when you want the plugin-grade starter bundle, sample
   configs, proof loop, and troubleshooting without opening package internals.

## Human-Facing Surfaces

| Surface | Best question | What it is not |
| --- | --- | --- |
| `README.md` | What is this product in one screen? | A route source-code index |
| `/` | Where should I go next? | A full proof manual |
| `/proof` | What evidence exists and what does it prove? | The operator desk |
| `/walkthrough` | What is the shortest first-minute route? | A contract dump |
| `/workbench` | What should a maintainer or reviewer do next? | A live ops console |
| `examples/skills/` | What can I actually copy into Codex, Claude Code, or an OpenClaw-ready bundle today? | A marketplace listing |

## Machine-Readable Surfaces

| Surface | Best for | Current boundary |
| --- | --- | --- |
| `/llms.txt` | LLM and search/index summaries | Not a full builder manual |
| `/api/frontdoor` | Structured builder and discovery JSON | Not a hosted builder API |
| `/manifest.webmanifest` | Browser install and route shortcuts | Not a canonical proof surface |
| `/sitemap.xml` | Crawl map for canonical public routes | Not the product story itself |
| `/robots.txt` | Crawl policy | Not a replacement for route-role metadata |
| [`docs/contracts/openui-ecosystem-productization.json`](./contracts/openui-ecosystem-productization.json) | ecosystem-facing machine-readable truth | Not proof of official listing approval |
| [`docs/contracts/openui-public-skills-starter.json`](./contracts/openui-public-skills-starter.json) | starter-bundle metadata | Not proof of a managed Skills runtime |

## Current Builder Entry Order

The current builder-facing order stays frozen:

1. local `stdio` MCP
2. compatibility OpenAPI bridge
3. repo-local workflow readiness packet

These are the current promises.

Think of that split like a train map:
the **builder entry order** is the three-stop route you should read first,
while the repo-owned public starter bundle is the install shelf that helps
people board those tracks without pretending the train already lives in a
marketplace.

## Strongest Public Distribution Surfaces

The strongest honest public distribution surfaces today are:

1. `README.md`
2. `docs/discovery-surfaces.md`
3. `examples/public-distribution/`
4. `examples/codex/marketplace.sample.json` and `.claude-plugin/marketplace.json`
5. `examples/openclaw/public-ready.manifest.json`
6. `examples/skills/`
7. `packages/skills-kit/`
8. `docs/contracts/openui-public-skills-starter.json`
9. `docs/contracts/openui-ecosystem-productization.json`
10. `docs/proof-and-faq.md`

Those ten surfaces are the repo-owned equivalent of a plugin-grade package
box: install note, sample configs, proof loop, troubleshooting, and machine-
readable metadata all live there together.

## Client Support Matrix

| Client | Current status | What is true now | What this does **not** mean |
| --- | --- | --- | --- |
| `Codex` | plugin-directory-ready | the official Plugin Directory exists and the repo now ships a directory-ready local package with sample config, proof loop, and troubleshooting | not a listed Codex directory item |
| `Claude Code` | marketplace-ready | the official marketplace exists and the repo now ships a marketplace-ready local package with sample config, proof loop, and troubleshooting | not a listed Claude marketplace item |
| `Generic MCP host` | template-ready | the repo documents a reusable stdio launch contract for MCP-capable hosts beyond Codex and Claude Code | not a verified vendor-native integration |
| `OpenClaw` | ClawHub-ready, unlisted | the repo now exposes an OpenClaw public-ready bundle, proof loop, and discoverable contract artifacts; the official public surface exists as ClawHub, but no OpenUI listing is claimed yet | not a verified OpenClaw runtime or ClawHub listing |
| `OpenHands` | positioning-only | comparison and category-fit language exists | not a dedicated install or discovery path |
| `OpenCode` | positioning-only | comparison and category-fit language exists | not a dedicated install or discovery path |

Use this table like a station board:

- `Codex` and `Claude Code` have repo-owned install shelves ready now
- `Generic MCP host` has a reusable timetable card
- `OpenClaw` now has a public-ready package draft and proof route, but no live
  catalog entry
- `OpenHands` and `OpenCode` remain signs on the comparison board, not live
  install shelves

## Supporting / Parked Lanes

These lanes still exist with proof, but they are no longer front-stage public
distribution surfaces:

- `@openui/sdk`
- `openui-mcp-studio hosted ...`

They stay in the repo as supporting or parked lanes.
They should not sit on the front door next to the plugin-grade starter bundle.

## Repo-Local Ecosystem Contracts

Use these repo-owned files when the app is not running or when you need
artifact-level references inside GitHub:

- `docs/contracts/openui-mcp.openapi.json`
- `docs/contracts/openui-ecosystem-productization.json`
- `docs/contracts/openui-public-skills-starter.json`
- `examples/public-distribution/README.md`
- `examples/public-distribution/install-and-proof.md`
- `examples/public-distribution/openclaw-public-ready.manifest.json`
- `examples/codex/marketplace.sample.json`
- `.claude-plugin/marketplace.json`
- `examples/openclaw/public-ready.manifest.json`
- `examples/skills/README.md`
- `examples/skills/install-use-note.md`
- `examples/skills/codex.mcp.json`
- `examples/skills/claude-code.mcp.json`
- `examples/skills/openclaw.mcp.json`
- `examples/skills/starter-troubleshooting.md`
- `openui-mcp-studio surface-guide`
- `openui-mcp-studio ecosystem-guide`
- `openui-mcp-studio skills starter --json`

## Operator-Only Public Surfaces

These are outside repo-local closure:

- GitHub Homepage field
- GitHub Social Preview selection and verification
- publishing future releases and refreshing attached assets after the public
  story changes again
- official marketplace or catalog submission
- future Discussions seeding and curation beyond the currently live baseline
- domain, DNS, TLS, and deployment for `OneClickUI.ai`

The repo can prepare the story and the assets.
It cannot prove those remote settings are live by itself unless a live GitHub
verification path is available in the current environment.
