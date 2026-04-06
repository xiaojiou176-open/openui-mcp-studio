# Skills Starter Kit

This directory is now the **formal public starter pack** for future
builder-facing Skills work.

That is still intentionally narrower than a shipped marketplace/plugin runtime:

- it gives maintainers a concrete public starter surface they can copy
- it now points at plugin-grade starter bundles for Codex and Claude Code plus
  a repo-owned OpenClaw public-ready bundle
- it stays honest about the current builder surface
- it does not claim that OpenUI MCP Studio already ships a formal Skills
  runtime or marketplace listing

## Current Truth

Read the builder-facing order like a relay race, not like four winners crossing
the line at once:

1. local `stdio` MCP is the current primary builder surface
2. the OpenAPI file is a compatibility bridge for review and contract reading
3. the repo-local workflow packet is a maintainer-facing readiness surface
4. a formal public starter pack exists here, but formal runtime packaging
   remains a later lane
5. the repo-owned package now also ships starter bundles and troubleshooting
   for zero-context public distribution

If you need the zero-context builder map first, start with:

- `openui-mcp-studio surface-guide`

## Files In This Starter Kit

| File | Role |
| --- | --- |
| `public-starter.manifest.json` | Machine-readable public starter manifest with audience, role, install path, starter bundles, and boundaries |
| `install-use-note.md` | Human-readable install/use note for zero-context maintainers |
| `starter-contract.md` | Defines the starter contract fields and what each one is supposed to mean |
| `starter-contract.template.json` | Minimal template maintainers can copy before filling a repo-specific draft |
| `starter-contract.example.json` | Honest example that wraps current repo surfaces without claiming a shipped runtime |
| `integration-note.md` | Explains how the starter contract maps to the current MCP, OpenAPI bridge, and repo-local packet |
| `../public-distribution/codex.mcp.json` | Copyable Codex MCP config |
| `../public-distribution/claude-code.mcp.json` | Copyable Claude Code MCP config |
| `../public-distribution/openclaw-public-ready.manifest.json` | OpenClaw public-ready, unlisted starter artifact |
| `../public-distribution/troubleshooting.md` | Short install recovery checklist |

## Guardrails

- Treat `.agents/skills/*` as internal collaboration assets, not as an external Skills product.
- Do not describe this starter pack as marketplace, plugin, SDK, or hosted API
  proof.
- Do not call the OpenClaw public-ready manifest an official OpenClaw runtime or
  ClawHub listing.
- If a future change promotes this starter kit into a public-facing builder
  surface, update the builder-surface truth ledger and public docs in the same
  change.
