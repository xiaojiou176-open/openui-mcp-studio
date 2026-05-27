# AGENTS

This file defines collaboration rules for `services/mcp-server/src/uiux`.

## 1. Module Purpose

- Own structured UI/UX review output definitions.
- Keep review schemas stable and verifiable.

## 2. Technology And Dependencies

- Language: TypeScript
- Core file:
  - `services/mcp-server/src/uiux/review-schema.ts`

## 3. Navigation

- Review schema:
  - `services/mcp-server/src/uiux/review-schema.ts`

## 4. Minimum Gates

- After code changes, run at least:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If the change affects visual review flows, also run:
  - `npm run visual:qa`

## 5. Change Constraints

- Schema field changes must stay synchronized with tests and callers.
- Keep field meaning clear and avoid duplicate semantics.
