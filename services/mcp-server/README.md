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

## Runtime

- Development entrypoint: `npm run dev`
- Build entrypoint: `npm run build`
- Logs and evidence are stored under `.runtime-cache/runs/<run_id>/...`
