# Discovery Surfaces

This page explains how to discover OpenUI MCP Studio without confusing
repo-owned truth with live deployment truth.

Use it when you want the shortest honest map from the public GitHub repo to the
front door, proof desk, operator desk, supporting install bundles, and
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
while the supporting install bundles and skill product line are the shelves that
help people board those tracks without pretending the repo already lives in a
marketplace.

## Strongest Public Distribution Surfaces

Keep the public story centered on the repo first, then the supporting install
surfaces:

1. `README.md`
2. `docs/discovery-surfaces.md`
3. `examples/public-distribution/`
4. `examples/codex/marketplace.sample.json` and `.claude-plugin/marketplace.json`
5. `examples/openclaw/public-ready.manifest.json`
6. `docs/contracts/openui-public-skills-starter.json`

If a surface does not help a new builder install, inspect, or verify the repo,
it belongs in reference material, not in the front row.

## Client Support Matrix

| Client | Current status | What is true now | What this does **not** mean |
| --- | --- | --- | --- |
| `Codex` | plugin-directory-ready | repo-owned local package with sample config, proof loop, and troubleshooting | not a listed Codex directory item |
| `Claude Code` | marketplace-ready | repo-owned local package with sample config, proof loop, and troubleshooting | not a listed Claude marketplace item |
| `Generic MCP host` | template-ready | reusable stdio launch contract for other MCP-capable hosts | not a verified vendor-native integration |
| `OpenCode` | compatibility-reference | use the same repo-owned generic MCP contract and local stdio launch pattern | not a dedicated OpenCode install shelf or official integration |
| `OpenClaw` | official repo-owned skill line, unlisted | repo-owned skill product line, public-ready bundle, and proof loop exist | not a verified OpenClaw runtime or ClawHub listing |
| `OpenHands` | positioning-only | comparison language exists | not a dedicated install path |

Use this table like a station board:

- the public repo is still the main thing you hand to a builder
- `Codex` and `Claude Code` have the strongest repo-owned install shelves today
- `Generic MCP host` has a reusable timetable card
- `OpenCode` can reuse that generic MCP contract, but the repo does not claim a
  dedicated vendor-native install shelf
- `OpenClaw` now has an official repo-owned skill product line and public-ready
  bundle, but no live catalog entry
- `OpenHands` remains a comparison board reference, not a live install shelf

## Supporting / Parked Lanes

These lanes still exist with proof, but they are no longer front-stage public
distribution surfaces:

- `@openui/sdk`
- `openui-mcp-studio hosted ...`

Docker runtime distribution is also outside the current front-stage story.
Treat it as a planned follow-through lane, not a current install promise.

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

These are outside repo-local closure once the current GitHub Pages front door is live:

- future Homepage override beyond the current GitHub Pages front door
- GitHub Social Preview selection and verification
- publishing future releases and refreshing attached assets after the public
  story changes again
- official marketplace or catalog submission
- future Discussions seeding and curation beyond the currently live baseline
- domain, DNS, TLS, and deployment for `OneClickUI.ai`

The repo can prepare the story and the assets.
It cannot prove those remote settings are live by itself unless a live GitHub
verification path is available in the current environment.
