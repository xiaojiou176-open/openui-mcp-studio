# AGENTS

This file defines collaboration rules for `services/mcp-server/src/retrieval`.

## 1. Module Purpose

- Provide local indexing and retrieval capabilities for RAG and context recall.
- Keep retrieval input/output contracts stable for callers in the tool layer.

## 2. Technology And Dependencies

- Language: TypeScript
- Key files:
  - `local-index.ts`
  - `retriever.ts`
  - `types.ts`

## 3. Navigation

- Local index: `services/mcp-server/src/retrieval/local-index.ts`
- Retrieval flow: `services/mcp-server/src/retrieval/retriever.ts`
- Type definitions: `services/mcp-server/src/retrieval/types.ts`

## 4. Minimum Gates

- After code changes, run at least:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If output quality or acceptance semantics change, also run:
  - `npm run ci:acceptance:gate`

## 5. Change Constraints

- Keep tests and docs in sync when retrieval input/output structures change.
- Do not introduce unrelated business logic into this module.
