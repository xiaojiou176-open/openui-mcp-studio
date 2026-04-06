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

The product should now be read as a UI/UX vertical companion for Codex /
Claude Code workflows:

- stronger on execution, review, and proof than a plain generator
- still intentionally narrower than a generic coding-agent platform

## Main Flow

The default end-to-end flow is owned by `openui_ship_react_page`:

1. receive prompt input
2. generate HTML
3. convert HTML into React and shadcn-oriented files
4. apply files under path safety rules
5. run quality gates

The repository also exposes a spec-driven preflight plane:

1. scan the target workspace profile
2. build a change plan before writing files
3. attach request-scoped acceptance
4. assemble a unified review bundle
5. optionally ship a multi-route feature flow

The delivery-intelligence surfaces are now meant to answer four different
questions, not one generic "extra metadata" question:

- workspace scan: what the target repository already looks like, how confident
  the scan is, and where shared-shell hotspots live
- change plan: why a path is in scope, which assumptions remain unresolved, and
  whether the safest next move is dry-run or apply-safe
- acceptance: which checks were truly automatic, which are still manual, and
  whether the current request is actually ready for reviewer trust
- review bundle: what a reviewer should look at first, not only what raw
  objects exist

`openui_ship_feature_flow` now sits on top of that shared plane instead of
standing beside it.
The intended layering is:

1. page-level ship builds route-local delivery evidence
2. route-level artifacts are retained under feature-scoped route directories
3. feature-level quality and acceptance roll up those route results
4. one feature-level review bundle summarizes the whole package for reviewers

That keeps page-level and feature-level delivery in one progressive system
instead of creating a separate "v2" universe.

Feature-level delivery now sits on top of the same shared contracts instead of
creating a parallel system:

- each route can still emit its own page-level workspace/profile/acceptance/
  review artifacts
- the feature-level package now keeps a route-scoped artifact tree
- the top-level feature bundle aggregates quality, acceptance, hotspots,
  shared-impact notes, and reviewer follow-up across the full route set

When `openui_ship_feature_flow` is used, the delivery plane now adds a true
feature-level package:

- route-scoped artifacts are retained under a feature-scoped artifact subtree
- feature-level quality is rolled up across routes
- feature-level acceptance distinguishes aggregate verdict from route-level
  verdicts
- the feature-level review bundle exposes shared impact, route summaries, and
  manual follow-up instead of only changed paths

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

### Delivery-intelligence surface

These tools turn the workflow into a spec-driven delivery plane:

- `openui_scan_workspace_profile`
- `openui_plan_change`
- `openui_build_acceptance_pack`
- `openui_build_review_bundle`
- `openui_ship_feature_flow`
- `openui_repo_workflow_summary`

### Repo workflow bridge

This is the narrow bridge from local delivery evidence to GitHub-facing review
truth:

- `openui_repo_workflow_summary`
- `npm run repo:workflow:ready`

The layering is intentional:

1. raw workflow summary reads local git state plus live GitHub checks and
   alerts
2. workflow-ready packet reshapes that truth into a maintainer-facing PR/checks
   packet
3. remote mutation remains separate and explicitly authorized

### Builder-facing order

The current builder-facing order is intentionally frozen:

1. local stdio MCP
2. compatibility OpenAPI projection
3. repo-local workflow CLI/readiness packet

That is the honest current surface.
It should not be rephrased as proof that the repo already ships a hosted API,
formal SDK, plugin marketplace, or write-capable remote MCP.

The aggregate code entrypoint for that public story is
`services/mcp-server/src/public/index.ts`.
It is a curated allowlist, not a mirror of `services/mcp-server/src/*`.
The root package bin `openui-mcp-studio` is a repo-local CLI alias for
inspecting those same lanes. It does not create a fourth builder surface or a
hosted control plane.
The root package export map is now build-backed as well, so plain Node package
consumers resolve compiled JavaScript under `.runtime-cache/build/...` instead
of raw TypeScript source files. The default package import is intentionally
builder-surface-first, while broader runtime helpers stay on explicit
`openui-mcp-studio/public/*` subpaths.

### Allowlisted public export layer

| Public module | Exposes | Boundary |
| --- | --- | --- |
| `services/mcp-server/src/public/builder-surface.ts` | Frozen builder-surface order, public export allowlist, later-lane metadata | Repo-side manifest only; not a hosted/SDK promise |
| `services/mcp-server/src/public/uiux-audit-foundation.ts` | Shared UI/UX audit frame, style-pack, and rubric contract | Allowlisted audit contract for repo-local review tooling only |
| `services/mcp-server/src/public/server.ts` | `createServer`, `runStdioServer`, `MCP_SERVER_VERSION` | Local stdio runtime entry only |
| `services/mcp-server/src/public/workflow-summary.ts` | `buildRepoWorkflowSummary`, `registerRepoWorkflowSummaryTool`, `RepoWorkflowSummary` | Read-only workflow bridge; no remote mutation |
| `services/mcp-server/src/public/ship.ts` | `registerShipTool`, `registerShipFeatureFlowTool` | Delivery registration surface for page and feature flows |
| `services/mcp-server/src/public/openui-client.ts` | `openuiChatComplete`, `openuiListModels` | Repo-local model helper surface |
| `services/mcp-server/src/public/next-smoke.ts` | `runNextSmoke` | Local proof/readiness helper |
| `services/mcp-server/src/public/computer-use.ts` | `registerComputerUseTool` | Advanced surface, not the front-door claim |
| `services/mcp-server/src/public/provider-testing.ts`, `tool-shared.ts`, `visual-diff.ts` | Test/ops helpers | Allowlisted helpers, not builder-product claims |

This split matters because the OpenAPI document is only the second lane in that
order. It should mirror the same boundary language, not drift into a separate
"future platform" story.
It also means the aggregate entrypoint should not silently drop allowlisted
modules that the package export map and public docs already present as current.

### Supporting surfaces

These tools are part of the maintained runtime, but they support the core path
instead of defining the repository by themselves:

- `openui_refine_ui`
- `openui_review_uiux`
- `openui_list_models`
- `openui_embed_content`

They help with review, iteration, or provider/runtime visibility around the
main shipping workflow.

`openui_repo_workflow_summary` is the GitHub-connected companion for this layer:
it reports repo-local git state plus live GitHub PR/check/alert/protection
truth, but it deliberately stops short of any remote mutation.

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
- `/` now acts as the product front door for that app.
- `/workbench` keeps the interactive proof surface that E2E interaction tests
  exercise directly.
- `smoke:e2e`, `test:e2e`, `visual:qa`, and `uiux:audit*` target that surface by
  default.
- The repository is not a generic Next.js demo and is not driven from `apps/web`
  alone.

## i18n Boundary

- public pages stay English-first
- default locale is `en-US`
- product UI can switch to `zh-CN`
- new bilingual copy should flow through centralized message sources instead of
  scattered mixed-language literals

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
