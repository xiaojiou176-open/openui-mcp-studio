# Troubleshooting

## Built file does not exist

Symptom:

- the sample config points at `.../.runtime-cache/build/.../main.js`
- your host says the file does not exist

Fix:

```bash
npm install
npm run build
```

Then re-run the host setup command.

## `GEMINI_API_KEY` is missing

Symptom:

- the host launches OpenUI, but requests fail immediately

Fix:

- set `GEMINI_API_KEY` in the command or config you are using
- keep the env var local to the host setup instead of hardcoding it in a file

## The host wants a JSON config, not a shell command

Use these files as the starting point:

- `examples/public-distribution/codex.mcp.json`
- `examples/public-distribution/claude-code.mcp.json`
- `examples/public-distribution/generic-mcp.json`

If the host has its own schema, keep the same three truths:

- command = `node`
- args = built local MCP server path
- env = `GEMINI_API_KEY`

## OpenClaw / ClawHub listing is not claimed yet

That is expected.
The repo currently proves a public-ready bundle, not a live listing or a
verified OpenClaw runtime.

The current repo-owned artifact is:

- `examples/public-distribution/openclaw-public-ready.manifest.json`

That means:

- the repo ships a public-ready, repo-owned starter bundle for a future listing flow
- the repo can prove the starter bundle and proof loop it would submit
- the repo still must **not** claim that a ClawHub listing or verified
  OpenClaw runtime is already live

## I only want the quickest "does this work?" check

Run:

```bash
node tooling/public-distribution-proof.mjs
npm run demo:ship
```

That is the shortest truthful package-level proof loop.
