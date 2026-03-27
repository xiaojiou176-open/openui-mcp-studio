# apps/web

## Responsibility

`apps/web` is the default product frontend. It is the page target audited by `smoke:e2e`, `test:e2e`, and `visual:qa`.

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
