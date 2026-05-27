# AGENTS

This file defines collaboration rules for `services/mcp-server/src/providers`.

## 1. Module Purpose

- Provide the Gemini provider adapter layer, including Python sidecar integration.
- Keep model-call parameters, capability boundaries, and provider type contracts consistent.

## 2. Technology And Dependencies

- Language: TypeScript
- Model strategy: Gemini-only
- Key files:
  - `gemini-provider.ts`
  - `gemini-python-sidecar.ts`
  - `types.ts`

## 3. Navigation

- Main provider implementation: `services/mcp-server/src/providers/gemini-provider.ts`
- Sidecar adapter: `services/mcp-server/src/providers/gemini-python-sidecar.ts`
- Type contracts: `services/mcp-server/src/providers/types.ts`

## 4. Minimum Gates

- After code changes, run at least:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- If the change affects sidecar interaction, also run:
  - `npm run py:smoke`

## 5. Change Constraints

- Do not introduce non-Gemini provider fallbacks.
- If env reads or provider config changes, keep these in sync:
  - `packages/contracts/src/env-contract.ts`
  - `.env.example`
  - `docs/environment-governance.md`
