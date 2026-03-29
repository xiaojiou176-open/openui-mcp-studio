# services/mcp-server

## Responsibility

`services/mcp-server` is the protocol entrypoint for this repository. It owns the MCP stdio server, tool registration, quality-gate orchestration, Gemini runtime orchestration, and the compatibility-facing public surface.

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
- `services/mcp-server/src/public/index.ts` is the aggregate public entrypoint for external consumers.
- `tooling/` must not import private implementation paths such as `src/providers/*`, `src/tools/*`, or `src/next-smoke/*` directly. It must go through `src/public/*` or `packages/*` public surfaces.

## Tool Surface Layers

The MCP server registers more than one kind of tool. Read them in layers so the
runtime entrypoint does not blur the product priority.

### Core workflow tools

These tools define the primary repository promise:

- `openui_detect_shadcn_paths`
- `openui_generate_ui`
- `openui_convert_react_shadcn`
- `openui_make_react_page`
- `openui_apply_files`
- `openui_quality_gate`
- `openui_next_smoke`
- `openui_ship_react_page`

If an external consumer asks what this server is primarily for, start here.

### Supporting tools

These tools support review, iteration, or provider visibility around the core
workflow:

- `openui_refine_ui`
- `openui_review_uiux`
- `openui_list_models`
- `openui_embed_content`

### Advanced or non-primary tools

These tools are still part of the live server, but they should not overshadow
the governed UI shipping path:

- `openui_rag_upsert`
- `openui_rag_search`
- `openui_observe_screen`
- `openui_execute_ui_action`
- `openui_computer_use_loop`

Operational boundary notes:

- `openui_rag_upsert` and `openui_rag_search` use a local in-memory index owned
  by the current server process. They are not a durable datastore contract.
- The computer-use tools provide observation and guarded action-loop semantics
  with confirmation controls. They are not a claim that this module already
  owns a full browser-driving executor.

## Runtime

- Development entrypoint: `npm run dev`
- Build entrypoint: `npm run build`
- Logs and evidence are stored under `.runtime-cache/runs/<run_id>/...`
