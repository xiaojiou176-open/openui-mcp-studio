# OpenUI SDK / Hosted API Ledger

> Current ledger for the supporting / parked SDK and self-hosted API lanes.

## 1. Current Product

- SDK:
  - `@openui/sdk`
  - thin client for the self-hosted OpenUI Hosted API
  - supporting / parked lane, not a front-stage public distribution surface
- Hosted API:
  - self-hosted HTTP runtime
  - surfaced through `openui-mcp-studio hosted info|openapi|serve`
  - supporting / parked lane, not a front-stage public distribution surface

## 2. Package / Runtime Shape

### SDK Shape

- package root: `packages/sdk`
- runtime entry: `packages/sdk/index.mjs`
- types entry: `packages/sdk/index.d.ts`
- current methods:
  - `health`
  - `getInfo`
  - `frontdoor`
  - `ecosystem`
  - `skillsManifest`
  - `openapi`
  - `workflowSummary`
  - `listTools`
  - `callTool`

### Hosted API Shape

- implementation root: `packages/hosted-api/src`
- contract: `docs/contracts/openui-hosted-api.openapi.json`
- runtime routes:
  - `/healthz`
  - `/v1/info`
  - `/v1/openapi`
  - `/v1/frontdoor`
  - `/v1/ecosystem`
  - `/v1/skills/manifest`
  - `/v1/workflow/summary`
  - `/v1/tools`
  - `/v1/tools/call`

## 3. Install / Use Path

### SDK Install

- local install:
  - `npm install /ABS/PATH/openui-mcp-studio/packages/sdk`
- pack/install proof:
  - `npm pack packages/sdk`
  - `node --import tsx tooling/sdk-install-proof.ts`
- import:
  - `import { createOpenuiHostedClient } from "@openui/sdk"`

### Hosted API Install

- inspect:
  - `openui-mcp-studio hosted info`
  - `openui-mcp-studio hosted openapi`
- run:
  - `OPENUI_HOSTED_API_BEARER_TOKEN=... openui-mcp-studio hosted serve`
- smoke:
  - `node --import tsx tooling/hosted-api-smoke.ts`

## 4. Auth / Env / Error / Observability

- auth:
  - bearer token via `OPENUI_HOSTED_API_BEARER_TOKEN`
- env:
  - `OPENUI_HOSTED_API_HOST`
  - `OPENUI_HOSTED_API_PORT`
  - `OPENUI_HOSTED_API_BEARER_TOKEN`
  - `OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE`
- errors:
  - JSON envelope with `code`, `message`, `requestId`
- observability:
  - structured request logging via the repo logger
- rate limiting:
  - fixed-window minute budget per token

## 5. Proof Path

- `tests/openui-sdk-package.test.ts`
- `tests/hosted-api-service.test.ts`
- `node --import tsx tooling/sdk-install-proof.ts`
- `node --import tsx tooling/hosted-api-smoke.ts`

## 6. Operator-Only Tail

- registry publication for `@openui/sdk`
- managed hosted deployment
- external infrastructure ownership
- public DNS / TLS / uptime commitments

## 7. Not-For Boundary

- managed SaaS claims
- remote write-capable control plane claims
- claims that SDK replaces the local stdio MCP runtime
