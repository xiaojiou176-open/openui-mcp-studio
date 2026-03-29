# Architecture

## System Shape

This repository is a hybrid repo with three layers:

1. a local MCP server
2. a default frontend proof target at `apps/web`
3. a contracts-and-tooling governance layer

The runtime entrypoint is `services/mcp-server/src/main.ts`.
Tool registration and orchestration live in `services/mcp-server/src/index.ts`.
The MCP server remains the system protocol entrypoint.

Public entry order stays separate from runtime entry order:

1. `README.md` explains the product surface
2. `docs/proof-and-faq.md` explains the proof tiers
3. `docs/evaluator-checklist.md` gives the short evaluation route
4. `services/mcp-server/src/main.ts` remains the actual runtime entrypoint

## Main Flow

The default end-to-end flow is owned by `openui_ship_react_page`:

1. receive prompt input
2. generate HTML
3. convert HTML into React and shadcn-oriented files
4. apply files under path safety rules
5. run quality gates

Core implementation surfaces:

- `services/mcp-server/src/main.ts`
- `services/mcp-server/src/index.ts`
- `services/mcp-server/src/ai-client.ts`
- `services/mcp-server/src/file-ops.ts`
- `services/mcp-server/src/quality-gate.ts`
- `services/mcp-server/src/constants.ts`

## Capability Surface

Read the tool surface in three layers so the repository does not present every
registered tool as equally central.

### Core workflow surface

This is the canonical product path:

- `openui_detect_shadcn_paths`
- `openui_generate_ui`
- `openui_convert_react_shadcn`
- `openui_make_react_page`
- `openui_apply_files`
- `openui_quality_gate`
- `openui_next_smoke`
- `openui_ship_react_page`

These tools define the main repository promise:

1. detect target UI conventions
2. generate UI from a brief
3. convert output into React and shadcn-oriented files
4. apply files under path-safety rules
5. verify the result before treating it as trusted

### Supporting surfaces

These tools are part of the maintained runtime, but they support the core path
instead of defining the repository by themselves:

- `openui_refine_ui`
- `openui_review_uiux`
- `openui_list_models`
- `openui_embed_content`

They help with review, iteration, or provider/runtime visibility around the
main shipping workflow.

### Advanced or non-primary surfaces

These tools remain real registered server capabilities, but the repository's
public product story does not start from them:

- `openui_rag_upsert`
- `openui_rag_search`
- `openui_observe_screen`
- `openui_execute_ui_action`
- `openui_computer_use_loop`

Treat these as advanced or exploratory surfaces unless a specific workflow
explicitly depends on them.

Two important honesty boundaries:

- The RAG path is backed by a local in-memory vector index inside the current
  server process. It is useful for session-scoped retrieval helpers, not as a
  durable repository database layer.
- The computer-use path currently provides model observation plus guarded
  action/loop semantics with confirmation tokens. It should be read as a safety
  and orchestration surface, not as a standalone browser automation runtime.

## Default Frontend Target

- `apps/web` is the default frontend proof target.
- `smoke:e2e`, `test:e2e`, `visual:qa`, and `uiux:audit*` target that surface by
  default.
- The repository is not a generic Next.js demo and is not driven from `apps/web`
  alone.

## Provider Boundary

- Gemini is the only provider path.
- Runtime model calls flow through the repository-owned provider bridge.
- Environment parsing and fail-fast validation stay in
  `services/mcp-server/src/constants.ts`.

## Upstream Boundary

This repository is a long-lived productized fork.

- keep upstream visible
- use selective port as the default route
- do not treat whole-repo merge as the normal maintenance path
- do not assume every local clone keeps `upstream` attached between sync passes
- treat clone-local sync readiness as a separate question from repo-wide
  upstream policy health

## Failure Boundaries

Use these documents when triaging failures:

- `docs/environment-governance.md` for runtime/env failures
- `docs/testing.md` for test and gate meaning
- `docs/governance-runbook.md` for repository operating rules
- `docs/upstream-sync-sop.md` for upstream maintenance discipline
