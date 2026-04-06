# apps/web

## Responsibility

`apps/web` is the default proof frontend target for this repository. It now has
two public-facing roles inside one app:

- `/` is the product front door
- `/proof` is the proof desk for evidence tiers, proof meaning, and evaluator
  routing
- `/workbench` is the operator desk used by E2E interaction coverage
- `/llms.txt` is the machine-readable front-door summary for LLM/agent
  consumers that need the shortest honest description of the product surface
- `/api/frontdoor` is the machine-readable JSON snapshot for builder and agent
  consumers that need routes, bindings, and boundary metadata
- `/manifest.webmanifest` is the discovery metadata route for browsers,
  installable clients, and search-facing front-door metadata

The app is still the page surface audited by `smoke:e2e`, `test:e2e`, and
`visual:qa`; it is not the repository's primary protocol entrypoint.

Current surface emphasis:

- `/` should guide newcomers into the right next route instead of acting like a flat marketing sheet
- `/compare` should explain the honest boundary against hosted builders and broader agent traffic
- `/proof` should read like an evidence desk: what the repo proves now, what still needs a human, and where to go next
- `/walkthrough` should feel like a guided route, not a detached doc excerpt
- `/workbench` should feel like an operator decision-and-execution desk, not a generic dashboard shell

## Front-Door Truth

Read `apps/web` through three frozen truths:

1. it is the public/product front door, not the runtime protocol entrypoint
2. public discovery stays English-first, but product UI can switch to `zh-CN`
3. builder-facing order stays:
   - local `stdio` MCP
   - compatibility OpenAPI projection
   - repo-local CLI / workflow-ready packet

Do not let route copy imply Skills, plugin, SDK, hosted API, or write-capable
remote MCP. Those remain later lanes.

Current i18n contract:

- locale source: `openui_locale` cookie
- default locale: `en-US`
- message source: `apps/web/lib/i18n/messages.ts`
- front-door request locale helper: `apps/web/lib/i18n/server.ts`
- no scattered bilingual literals across route files
- current high-signal bilingual coverage includes the proof desk plus
  workbench next-action, pause, dialog, and state guidance

## Out Of Scope

- MCP protocol orchestration
- Gemini provider or Python sidecar execution
- Repository-level governance contracts

## Dependencies

- Depends on shared contracts and runtime capabilities from `packages/*`
- Consumed by the smoke, quality, and UI/UX audit flows orchestrated from `services/mcp-server`
- Frontend runtime is pinned to `Next.js 16.2.1` with `react 19.2.4` and `react-dom 19.2.4` so the app and Radix-driven component tree resolve a single React runtime during build/start smoke validation

## Runtime

- Local entrypoints come from the repository root: `npm run demo:ship`, `npm run prepare:next-app`, and `npm run smoke:e2e`
- Test and visual evidence is stored under `.runtime-cache/runs/<run_id>/artifacts/*`
