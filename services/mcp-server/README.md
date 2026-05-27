# services/mcp-server

## Responsibility

`services/mcp-server` is the protocol entrypoint for this repository. It owns the MCP stdio server, tool registration, quality-gate orchestration, Gemini runtime orchestration, and the compatibility-facing public surface.

The canonical public root still lives at the repo root (`README.md` +
`manifest.yaml`), and the canonical machine-readable descriptor for the pure-MCP
lane now lives at `../../server.json`. This document remains the runtime support
surface for the pure-MCP lane, not a claim that the repo already has a live
registry listing.

## Out Of Scope

- Implementing the actual product frontend pages
- Owning the Python Gemini SDK execution details
- Handling repository-level release operations or branch-protection administration

## Dependencies

- Depends on `packages/contracts`
- Depends on `packages/shared-runtime`
- Depends on `packages/runtime-observability`
- Consumed by `tooling/`, `tests/`, and `.github/workflows/*`

## Public Surface

- `services/mcp-server/src/public/` is the allowlisted export layer for repository tooling and operational scripts.
- `services/mcp-server/src/public/index.ts` is the aggregate public entrypoint and mirrors the curated allowlist instead of mirroring every internal module.
- `tooling/` must not import private implementation paths such as `src/providers/*`, `src/tools/*`, or `src/next-smoke/*` directly. It must go through `src/public/*` or `packages/*` public surfaces.
- The root package bin `ShadcnBrief` is the repo-local CLI alias for inspecting the same builder-surface order; it does not create a hosted API or SDK lane.
- The root package export map is build-backed on purpose. Plain Node consumers should resolve the compiled `.runtime-cache/build/...` JavaScript surface instead of depending on raw `.ts` source files.
- The default package import is intentionally narrower than `./public/*`: it resolves to the builder-surface manifest, while deeper runtime helpers stay on explicit `ShadcnBrief/public/*` subpaths.

Current allowlisted modules:

| Module | What it exposes | Boundary |
| --- | --- | --- |
| `index.ts` | Aggregate public entrypoint | Curated repo-side public surface only |
| `builder-surface.ts` | Frozen builder-surface order, public allowlist, later-lane metadata | Repo-side manifest, not SDK or hosted-product metadata |
| `uiux-audit-foundation.ts` | Shared UI/UX audit frame, style-pack, and rubric contract | Allowlisted audit contract for repo-local review tooling only |
| `server.ts` | `createServer`, `runStdioServer`, `MCP_SERVER_VERSION` | Local stdio MCP runtime only |
| `workflow-summary.ts` | `buildRepoWorkflowSummary`, `registerRepoWorkflowSummaryTool`, `RepoWorkflowSummary` | Read-only maintainer/workflow bridge only |
| `ship.ts` | `registerShipTool`, `registerShipFeatureFlowTool` | Delivery registration surface, not a hosted API endpoint |
| `shadcn-brief-client.ts` | `openuiChatComplete`, `openuiListModels` | Repo-local model helper surface |
| `next-smoke.ts` | `runNextSmoke` | Repo-local proof/readiness helper |
| `computer-use.ts` | `registerComputerUseTool` | Real advanced surface, but not the primary product story |
| `provider-testing.ts`, `tool-shared.ts`, `visual-diff.ts` | Provider reset/sidecar helpers, request-id helper, visual diff helper | Allowlisted ops/testing helpers only |

Allowlisted does not mean equally central. Think of this directory like a storefront shelf: every item here is intentionally placed, but the front-row product story still starts with local stdio MCP, then the compatibility bridge, then repo-local workflow readiness.
That also means the aggregate entrypoint should not quietly omit allowlisted modules that the root package export map already exposes.

## Tool Surface Layers

The MCP server registers more than one kind of tool. Read them in layers so the
runtime entrypoint does not blur the product priority.

### Core workflow tools

These tools define the primary repository promise:

- `shadcn_brief_detect_shadcn_paths`
- `shadcn_brief_generate_ui`
- `shadcn_brief_convert_react_shadcn`
- `shadcn_brief_make_react_page`
- `shadcn_brief_apply_files`
- `shadcn_brief_quality_gate`
- `shadcn_brief_next_smoke`
- `shadcn_brief_ship_react_page`

If an external consumer asks what this server is primarily for, start here.

### Delivery-intelligence tools

These tools make the workflow more spec-driven:

- `shadcn_brief_scan_workspace_profile`
- `shadcn_brief_plan_change`
- `shadcn_brief_build_acceptance_pack`
- `shadcn_brief_build_review_bundle`
- `shadcn_brief_ship_feature_flow`

### Supporting tools

These tools support review, iteration, or provider visibility around the core
workflow:

- `shadcn_brief_refine_ui`
- `shadcn_brief_review_uiux`
- `shadcn_brief_list_models`
- `shadcn_brief_embed_content`

### Advanced or non-primary tools

These tools are still part of the live server, but they should not overshadow
the governed UI shipping path:

- `shadcn_brief_rag_upsert`
- `shadcn_brief_rag_search`
- `shadcn_brief_observe_screen`
- `shadcn_brief_execute_ui_action`
- `shadcn_brief_computer_use_loop`

Operational boundary notes:

- `shadcn_brief_rag_upsert` and `shadcn_brief_rag_search` use a local in-memory index owned
  by the current server process. They are not a durable datastore contract.
- The computer-use tools provide observation and guarded action-loop semantics
  with confirmation controls. They are not a claim that this module already
  owns a full browser-driving executor.

## Runtime

- Development entrypoint: `npm run dev`
- Build entrypoint: `npm run build`
- Logs and evidence are stored under `.runtime-cache/runs/<run_id>/...`
