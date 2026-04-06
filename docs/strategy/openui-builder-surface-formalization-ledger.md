# OpenUI Builder Surface Formalization Ledger

> Current Wave 3 + 4 ledger for builder-surface formalization.
> This document builds on the landed Round 2 foundation.
> It does not change the frozen builder order, and it does not elevate later lanes into current promises.

## 1. Why This Exists

The repo already had the right surfaces.
The current gap was not “missing runtime”.
The gap was “how does a zero-context builder understand which door to open first?”

This ledger exists to keep that answer short and stable.

## 2. Current Surface Order

The current builder-facing order remains:

1. local stdio MCP
2. compatibility OpenAPI bridge
3. repo-local workflow packet
4. repo-side skills starter examples

That order is frozen for the current wave.

## 3. Audience And Boundary

| Surface | Primary audience | What it is for | What it is not |
| --- | --- | --- | --- |
| Local stdio MCP | Codex, Claude Code, other MCP clients | canonical runtime entry for prompt-to-workspace UI delivery | not a hosted builder or remote-write control plane |
| Compatibility OpenAPI bridge | contract reviewers and bridge consumers | shape inspection, compatibility review, adapter-facing HTTP projection | not a hosted API or SDK promise |
| Repo-local workflow packet | maintainers and operators | repo-local plus GitHub-connected readiness without remote mutation | not a public workflow service |
| Repo-side skills starter | maintainers drafting future skill-shaped contracts | starter-only contract framing and future-facing integration notes | not a shipped Skills runtime or marketplace |

## 4. This Wave Hardening

### 4.1 Public Builder Guide

The repo-side builder layer is now easier to read:

- `services/mcp-server/src/public/builder-surface.ts`
  - now carries audience, best-for, read-when, and not-for metadata
- `services/mcp-server/src/public/index.ts`
  - now re-exports the builder guide and dispatcher metadata

### 4.2 OpenAPI Bridge

The compatibility contract is now thicker and still honest:

- `docs/contracts/openui-mcp.openapi.json`
  - now mirrors builder audience, read order, and boundary metadata
- the file still speaks as a compatibility bridge
- it still does not claim a hosted API or SDK product

### 4.3 CLI Formalization

The root CLI is now more formally useful for builders:

- `openui-mcp-studio surface-guide`
  - gives a repo-local reading order for the current surfaces
- the CLI remains a dispatcher and inspection helper
- it still does not replace MCP as the primary runtime surface

## 5. Still Partial

These are real current-wave limitations:

- the workflow packet is still stronger as a maintainer/operator packet than as a first-time builder front door
- the public export layer is curated, but it still mixes `builder`, `ops`, and `testing` audiences
- the skills starter remains contract-shaped and starter-only, not runtime-shaped
- the builder story is now more formal, but it is still repo-local truth rather than remote or hosted product truth

## 6. Later Lanes Do Not Touch

The following remain later lanes:

- formal SDK packaging
- hosted API productization
- plugin or marketplace distribution
- formal public Skills runtime packaging
- write-capable remote MCP

## 7. Reading Rule

When you need the current builder truth, read these together:

- [`docs/index.md`](../index.md)
- [`docs/contracts/openui-mcp.openapi.json`](../contracts/openui-mcp.openapi.json)
- `services/mcp-server/src/public/builder-surface.ts`
- `services/mcp-server/src/public/index.ts`
- `tooling/cli/openui.mjs`
- `examples/skills/README.md`
- `examples/skills/integration-note.md`
