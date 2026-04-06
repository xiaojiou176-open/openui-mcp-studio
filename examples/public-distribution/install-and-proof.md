# Install And Proof

This note is the quickest plug-and-play route for the public distribution
bundle.

## 1. Build Once

The sample configs point at the built local MCP server entrypoint:

```bash
npm install
npm run build
```

That produces the repo-owned `main.js` path used by the sample configs.

## 2. Install Into Codex

Use the official MCP add pattern:

```bash
codex mcp add openui --env GEMINI_API_KEY=your_key -- \
  node /ABS/PATH/openui-mcp-studio/.runtime-cache/build/mcp-server/services/mcp-server/src/main.js
```

If you prefer to start from a machine-readable example first, open:

- `examples/public-distribution/codex.mcp.json`
- `examples/codex/marketplace.sample.json` if you also want a repo-scoped
  local plugin-directory sample

## 3. Install Into Claude Code

Use the official MCP add pattern:

```bash
claude mcp add --transport stdio --env GEMINI_API_KEY=your_key openui -- \
  node /ABS/PATH/openui-mcp-studio/.runtime-cache/build/mcp-server/services/mcp-server/src/main.js
```

If you prefer a machine-readable example first, open:

- `examples/public-distribution/claude-code.mcp.json`
- `.claude-plugin/marketplace.json` if you want the marketplace-compatible
  Claude bundle entry that points at `plugins/openui-workspace-delivery`

## 4. Install Into Another Local-First MCP Host

Start from the generic stdio contract:

- `examples/public-distribution/generic-mcp.json`

The contract is intentionally simple:

- command = `node`
- args = built local MCP server entrypoint
- env = `GEMINI_API_KEY`

## 5. Run The Proof Loop

```bash
node tooling/cli/openui.mjs surface-guide
node tooling/cli/openui.mjs ecosystem-guide --json
node tooling/public-distribution-proof.mjs
npm run demo:ship
```

Use that order for a reason:

1. `surface-guide` tells you what the real builder order is.
2. `ecosystem-guide --json` tells you what the repo can honestly claim today.
3. `public-distribution-proof` proves the bundle files and sample configs stay
   intact.
4. `demo:ship` proves the repo can still return a real ship-tool payload.

## 6. Keep The Boundaries Honest

This bundle is strong enough to call:

- package-ready
- install-ready
- proof-backed

It is **not** strong enough to call:

- official marketplace listed
- vendor-approved plugin
- hosted builder
- managed SaaS
