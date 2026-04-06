# Starter Bundle Troubleshooting

Use this note when the install surface looks correct on paper but the host still
does not attach cleanly.

## 1. Build output path is missing

- Run `npm install`
- Run `npm run build`
- Confirm the runtime exists at `.runtime-cache/build/mcp-server/services/mcp-server/src/main.js`

## 2. Gemini key is missing

- Provide `GEMINI_API_KEY` through the host config shown in the starter bundle
- Re-run `npm run env:check` if you changed local env wiring

## 3. You want the shortest proof loop

- Run `openui-mcp-studio surface-guide --json`
- Run `openui-mcp-studio ecosystem-guide --json`
- Run `npm run repo:doctor`

## 4. OpenClaw wording boundary

- Treat the OpenClaw starter as `public-ready` inside the repo-owned package
  surface
- Do not claim ClawHub, official marketplace, or vendor approval unless a real
  public listing exists and is freshly verified
