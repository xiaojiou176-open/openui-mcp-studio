# Skills Product Line

This directory is the repo mirror for the **official repo-owned OpenUI skill
product line**.

It is intentionally stronger than "just examples" and still intentionally
narrower than a shipped marketplace/runtime:

- it gives maintainers and builders a real, versioned skill surface they can inspect
- it points at plugin-grade skill bundles for Codex and Claude Code plus the
  repo-owned OpenClaw skill line
- it stays honest about the current builder surface
- it does not claim that OpenUI MCP Studio already ships a live marketplace
  listing, formal Skills runtime, or vendor approval

## Current Truth

Read the builder-facing order like a relay race, not like four winners crossing
the line at once:

1. local `stdio` MCP is the current primary builder surface
2. the OpenAPI file is a compatibility bridge for review and contract reading
3. the repo-local workflow packet is a maintainer-facing readiness surface
4. an official repo-owned skill product line exists here, but listing/runtime
   publication remains a later lane
5. the repo-owned package now also ships starter bundles and troubleshooting
   for zero-context public distribution

If you need the zero-context builder map first, start with:

- `openui-mcp-studio surface-guide`

## Files In This Starter Kit

| File | Role |
| --- | --- |
| `public-starter.manifest.json` | Machine-readable manifest for the repo-owned skill product line |
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
- Do not describe this product line as a live marketplace, SDK, or hosted API
  publication.
- Do not call the OpenClaw public-ready manifest an official OpenClaw runtime or
  ClawHub listing.
- If a future change promotes this starter kit into a public-facing builder
  surface, update the builder-surface truth ledger and public docs in the same
  change.
