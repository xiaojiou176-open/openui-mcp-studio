# Integration Note

This starter pack is meant to help maintainers describe a future Skills-shaped
surface without lying about what exists today.

Its current public role is:

- a formal starter pack
- a bounded contract surface
- a zero-context install/use handoff

It is still not a runtime or marketplace surface.

## Three Boundary Sentences

1. Local `stdio` MCP is the current primary builder surface.
2. OpenAPI is only a compatibility bridge for contract reading and review.
3. The repo-local workflow packet is maintainer-facing, not a generic public API.

## How To Use This Starter Kit

1. Start from the current tool or packet that already exists in the repo.
2. If the current order is not clear yet, read `openui-mcp-studio surface-guide` first.
2. Copy `starter-contract.template.json`.
3. Fill the contract with current invocation, inputs, outputs, and limitations.
4. Add proof anchors that point to repo-owned truth, not to future ideas.
5. Stop if the wording starts sounding like a shipped Skills platform.

## Public Starter Pack Additions

- `public-starter.manifest.json`
  - machine-readable audience / role / install path / boundaries
- `install-use-note.md`
  - shortest human-readable install/use route for zero-context maintainers

## Mapping To Current Surfaces

| Surface | What it is good for | What it is not |
| --- | --- | --- |
| local `stdio` MCP | primary execution path for Codex, Claude Code, and other MCP clients | not proof of hosted API or remote write semantics |
| `docs/contracts/openui-mcp.openapi.json` | compatibility bridge, schema review, and call-shape inspection | not a hosted API launch statement |
| `npm run repo:workflow:ready` | repo-local, maintainer-facing readiness packet | not a public workflow service or external integration platform |

## Internal-Only Reminder

The `.agents/skills/*` directory is useful for internal collaboration patterns.
It is not the same thing as an external Skills product surface.

If a future wave decides to externalize a formal Skills runtime, that work should
be treated as a new builder-surface step with shared-doc updates, verification,
and naming review.
