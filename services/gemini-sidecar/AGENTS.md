# AGENTS

This file defines collaboration rules for `services/gemini-sidecar`.

## 1. Module Purpose

- Provide the Python sidecar service and protocol implementation.
- Act as the external execution companion for the Node main process through the bridge layer.

## 2. Technology And Dependencies

- Language: Python
- Key files:
  - `services/gemini-sidecar/server.py`
  - `services/gemini-sidecar/protocol.py`
- Related commands:
  - `npm run py:health`
  - `npm run py:smoke`

## 3. Navigation

- Service implementation: `services/gemini-sidecar/server.py`
- Protocol definition: `services/gemini-sidecar/protocol.py`

## 4. Minimum Gates

- After code changes, run at least:
  - `npm run py:health`
  - `npm run py:smoke`
- If the change affects TypeScript callers, also run:
  - `npm run test`

## 5. Change Constraints

- Protocol field changes must stay synchronized with Node callers and tests.
- Do not treat `__pycache__` as functional evidence.
