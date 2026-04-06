# Builder Surface Round 1 - Worker C

## Purpose

This scoped note records the Round 1 Worker C slice for builder-surface work.
Its job is modest and honest:

- capture what already exists
- land one repo-side Skills starter kit
- keep later-lane claims out of the current surface
- leave a short gap ledger that future maintainers can actually use

## Current Layer

The current builder-facing order remains:

1. local `stdio` MCP
2. compatibility OpenAPI bridge
3. repo-local maintainer packet
4. later-lane Skills or ecosystem packaging

This round does not change that order.
It only makes the later Skills lane easier to approach without pretending it is
already shipped.

## Already Exists

These surfaces were already real before this slice:

| Area | Existing truth |
| --- | --- |
| Primary builder surface | local `stdio` MCP remains the real runtime surface |
| Bridge layer | `docs/contracts/openui-mcp.openapi.json` already exists as a compatibility bridge |
| Maintainer packet | `openui_repo_workflow_summary` plus `npm run repo:workflow:ready` already expose a repo-local workflow bridge |
| Builder-surface wording | `README.md`, `docs/strategy/openui-uiux-truth-ledger.md`, `docs/proof-and-faq.md`, and `docs/architecture.md` already freeze current-vs-later boundaries |
| Internal-only pattern assets | `.agents/skills/*` already exists for repo-internal collaboration, but not as an external product claim |

## Filled In This Round

This slice adds one concrete repo-side starter kit under `examples/skills/`:

| File | What it adds |
| --- | --- |
| `package.json` | adds one repo-local `bin` plus a narrow root `exports` allowlist around the curated public layer |
| `tooling/cli/openui.mjs` | adds a real repo-side CLI entrypoint for MCP, workflow packet inspection, OpenAPI inspection, and the skills starter |
| `examples/skills/README.md` | explains the starter-kit role and hard boundaries |
| `examples/skills/starter-contract.md` | defines the contract fields and authoring rules |
| `examples/skills/starter-contract.template.json` | gives a copyable starter shape |
| `examples/skills/starter-contract.example.json` | shows one honest example anchored in current repo surfaces |
| `examples/skills/integration-note.md` | maps the starter kit to MCP primary, OpenAPI bridge, and maintainer packet |

## Still Partial

This round is intentionally partial in the following ways:

| Partial area | Honest current reading |
| --- | --- |
| Runtime activation | no formal Skills runtime registration was added |
| Public docs routing | no front-door or docs-index promotion was added in this slice |
| Verification | no new tests were added because tests are out of scope for this worker slice |
| Distribution | no plugin, marketplace, SDK, or hosted API packaging exists yet |
| Package layering | root `exports` are now narrow and honest, but `services/mcp-server/package.json` still has a wider internal-style export map that was not in this worker's write scope |

## Later Lanes

The following lanes remain later work, not current product truth:

- formal Skills surface as a first-class builder contract
- marketplace or plugin packaging
- SDK packaging
- hosted API packaging
- write-capable remote MCP semantics

## Short Executable Gap Ledger

Think of this like a handoff checklist, not a launch checklist.
These are the smallest meaningful next gaps:

| Gap | Why it matters | Minimum next step |
| --- | --- | --- |
| starter kit is repo-local only | maintainers can now draft consistently, but the public docs still do not advertise a Skills surface | decide whether a later wave wants public discoverability before touching shared docs |
| example is contract-shaped, not runtime-shaped | the repo has wording and structure, but no formal skill registration path | choose the activation surface before adding runtime code |
| bridge and packet are separate by design | this starter kit keeps invocation honest, but future maintainers still need to decide when to combine them | keep MCP primary and compose bridge or packet only when a concrete use case requires it |
| internal skills and external starter remain separate | avoids fake shipping claims today, but future maintainers need a migration rule if externalization starts | define a shared promotion rule before reusing `.agents/skills` language publicly |

## Shared Change Proposals

These proposals are intentionally not landed here because they require shared
file or cross-surface coordination:

| Proposal | Why it is shared |
| --- | --- |
| expose `examples/skills/` from `README.md` or `docs/index.md` | touches shared front-door docs |
| add contract-aware tests for starter examples or future runtime registration | touches `tests/*` and verification strategy |
| add a public builder-surface page that compares MCP, OpenAPI bridge, maintainer packet, and later Skills lanes | needs shared docs and likely truth-ledger wording updates |
| define a formal promotion rule from internal `.agents/skills` assets to public starter examples | crosses internal-collaboration assets and external product messaging |
| align `services/mcp-server/package.json` exports with the curated `src/public` allowlist | touches a shared package contract outside this worker's authorized paths |
| register new `src/public/*` files in `contracts/governance/public-surfaces.json` once the new allowlist is accepted | touches shared governance contracts outside this worker's authorized paths |

## Maintainer Reading

A zero-context maintainer should leave this slice with one simple map:

- today, use local MCP first
- treat OpenAPI as bridge-only
- treat `repo:workflow:ready` as maintainer-facing
- use `examples/skills/` to draft future skill-shaped contracts
- do not describe that draft layer as a shipped Skills product until shared
  docs, activation path, and verification catch up
