# AGENTS

This file defines collaboration rules for `services/mcp-server/src/tools`.

## 1. Module Purpose

- Implement MCP tools such as generation, detection, conversion, workspace scanning, change planning, acceptance, review bundles, shipping, and smoke paths.
- Keep tool inputs and outputs stable for the main service and test suite.

## 2. Technology And Dependencies

- Language: TypeScript
- Key files:
  - `generate.ts`
  - `detect.ts`
  - `workspace-scan.ts`
  - `plan.ts`
  - `acceptance.ts`
  - `review-bundle.ts`
  - `quality.ts`
  - `ship.ts`
  - `ship-feature-flow.ts`
  - `shared.ts`

## 3. Navigation

- Generation and conversion:
  - `services/mcp-server/src/tools/generate.ts`
  - `services/mcp-server/src/tools/convert.ts`
  - `services/mcp-server/src/tools/refine.ts`
- Detection and quality:
  - `services/mcp-server/src/tools/detect.ts`
  - `services/mcp-server/src/tools/workspace-scan.ts`
  - `services/mcp-server/src/tools/plan.ts`
  - `services/mcp-server/src/tools/acceptance.ts`
  - `services/mcp-server/src/tools/review-bundle.ts`
  - `services/mcp-server/src/tools/quality.ts`
  - `services/mcp-server/src/tools/uiux-review.ts`
- Retrieval and embedding:
  - `services/mcp-server/src/tools/rag.ts`
  - `services/mcp-server/src/tools/embed.ts`
- Shipping and smoke:
  - `services/mcp-server/src/tools/ship.ts`
  - `services/mcp-server/src/tools/ship-feature-flow.ts`
  - `services/mcp-server/src/tools/smoke.ts`
- Shared helpers:
  - `services/mcp-server/src/tools/shared.ts`
  - `services/mcp-server/src/tools/models.ts`

## 4. Minimum Gates

- After code changes, run at least:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If the change affects end-to-end user experience, also run:
  - `npm run test:e2e`

## 5. Change Constraints

- Keep tests synchronized with any tool-name or input/output schema change.
- Keep error meaning and error tracking aligned with `docs/error-codes.md` when behavior changes.
