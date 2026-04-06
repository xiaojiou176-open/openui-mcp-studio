# Install / Use Note

This note turns the repo-side starter assets into a formal **public starter
bundle**.

That phrase is deliberately narrow:

- this directory is now packaged so a zero-context maintainer can discover it,
  copy host configs, and use it as a bounded starter
- it is **not** a shipped Skills runtime
- it is **not** a marketplace listing
- it is **not** SDK or hosted API proof
- it is **not** an official OpenClaw or ClawHub listing

## Who This Is For

Use this starter pack when you are:

1. designing a future skill-shaped integration
2. documenting a current repo-local builder slice without overclaiming
3. preparing a contract draft that may later graduate into a stronger product
   surface

## What To Open First

1. `starter-contract.md`
   - read the required fields and authoring rules
2. `public-starter.manifest.json`
   - read the machine-readable audience, role, starter bundles, proof loop, and
     boundaries
3. `../public-distribution/codex.mcp.json`,
   `../public-distribution/claude-code.mcp.json`,
   `../public-distribution/openclaw-public-ready.manifest.json`
   - copy the host bundle that matches your client or submission lane
4. `../public-distribution/troubleshooting.md`
   - use this when the first install attempt fails
5. `starter-contract.template.json`
   - copy this into your own draft
6. `starter-contract.example.json`
   - use it as the bounded reference shape
7. `integration-note.md`
   - map the draft back to the real MCP / OpenAPI / repo-workflow surfaces

## Minimal Install Path

1. Pick the host bundle that matches your client:
   - `../public-distribution/codex.mcp.json`
   - `../public-distribution/claude-code.mcp.json`
   - `../public-distribution/openclaw-public-ready.manifest.json`
2. Replace `/ABS/PATH/openui-mcp-studio/.../main.js` with your real local path.
3. Make sure `GEMINI_API_KEY` exists in the client environment.
4. Run `npm run repo:doctor`.
5. Run `npm run demo:ship`.

## Minimal Use Path

1. Explain the current slice in one sentence.
2. Name the current invocation path.
3. List the required inputs and bounded outputs.
4. State the limitations clearly.
5. Stop before the wording turns into plugin, marketplace, SDK, or
   hosted-product language.
6. For OpenClaw, say `public-ready repo-owned bundle` rather than `official
   integration`.

## Hard Boundaries

- local `stdio` MCP remains the primary builder surface
- OpenAPI remains a compatibility bridge
- repo-local workflow packets remain maintainer-facing
- this starter bundle does not prove a public runtime, marketplace item, or
  external control plane
- SDK and hosted API stay supporting/parked lanes in this bundle, not the main
  install story
- OpenClaw can be public-ready at the repo-owned artifact layer without implying
  an official catalog or ClawHub listing
