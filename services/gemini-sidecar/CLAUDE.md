# CLAUDE.md

This file adds Claude Code specific guidance for `services/gemini-sidecar`.
The shared baseline still comes from the root `AGENTS.md` and this module's `AGENTS.md`.

## 1. Recommended Read Order

1. Read `services/gemini-sidecar/protocol.py` first.
2. Then read request handling in `services/gemini-sidecar/server.py`.
3. After changes, run health checks before smoke verification.

## 2. Minimum Gates

- Required:
  - `npm run py:health`
  - `npm run py:smoke`
- If Node integration is affected:
  - `npm run test`

## 3. Risk Boundary

- Prioritize protocol compatibility and avoid unversioned breaking changes.

## 4. Change Boundary

- Do not modify implementation files outside this module unless the task explicitly authorizes it.
