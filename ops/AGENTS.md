# AGENTS

This file defines the collaboration rules for the `ops/` module and applies to Codex, Claude Code, and other coding agents.

## 1. Module Purpose

- Own runtime, release, container, and operations-level assets.
- Current focus path: `ops/ci-container/run-in-container.sh`.

## 2. Change Constraints

- Operations scripts must stay aligned with `.github/workflows/**`, `.github/actions/**`, and any related contracts.
- Do not move developer-only scripts back into `ops/`.

## 3. Minimum Gates

- `npm run governance:upstream:check`
- `npm run governance:workflow:check`
- `npm run iac:check`
