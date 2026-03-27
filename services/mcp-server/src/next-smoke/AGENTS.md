# AGENTS

This file defines collaboration rules for `services/mcp-server/src/next-smoke`.

## 1. Module Purpose

- Own the Next.js smoke verification path:
  - install
  - build
  - start
  - probe
  - exit-code governance
- The goal is to verify quickly that a Next target can start, respond, and shut down cleanly.

## 2. Technology And Dependencies

- Language: TypeScript on Node.js
- Key capabilities:
  - child-process orchestration
  - probe checks
  - log redaction
  - structured error semantics
- Related command:
  - `npm run smoke:e2e`

## 3. Navigation

- Entry orchestration: `services/mcp-server/src/next-smoke/run.ts`
- Process orchestration: `services/mcp-server/src/next-smoke/process.ts`
- Subcommand implementations: `services/mcp-server/src/next-smoke/process-*.ts`
- Probe and target-root resolution:
  - `services/mcp-server/src/next-smoke/probe.ts`
  - `services/mcp-server/src/next-smoke/target-root.ts`
- Types and logging:
  - `services/mcp-server/src/next-smoke/types.ts`
  - `services/mcp-server/src/next-smoke/logging.ts`

## 4. Minimum Gates

- After code changes, run at least:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run smoke:e2e`
- If the change affects broader orchestration or release acceptance:
  - `npm run ci:gate`

## 5. Change Constraints

- Keep changes minimal and local to this module when possible.
- If execution semantics or error meaning changes, keep `docs/error-codes.md` and `docs/testing.md` aligned.
