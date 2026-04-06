# Release Notes Template

Use this template when turning a tag into a public release. The goal is to tell
users what they gained, not to dump commits.

## Release Title

`vX.Y.Z - one-line user-facing headline`

Example:

`v0.4.0 - Faster brief-to-UI proof with a clearer review workflow`

## Opening Summary

In one short paragraph:

- what changed for users
- why this release matters now
- who should care
- keep the same product sentence used in `README.md`, then point readers to
  `docs/proof-and-faq.md` for the canonical proof explanation

## Front Door Sentence

In one line:

- use the same product sentence as `README.md`
- keep `OpenUI MCP Studio` as the technical name
- only mention `OneClickUI.ai` as the front-door label, never as proof of a
  live canonical site

## Highlights

- **New capability**
  One sentence on what people can do now.
- **Better workflow**
  One sentence on what got easier, faster, or safer.
- **Trust improvement**
  One sentence on how validation, docs, or public readiness improved.

## Builder Order

Spell out the current builder-facing order without promoting later lanes:

1. local stdio MCP
2. compatibility OpenAPI bridge
3. repo-local workflow packet

Then add one sentence saying that formal Skills, plugin, SDK, and hosted API
no longer all sit in the same bucket:

- `@openui/skills-kit`
- `@openui/sdk`
- the self-hosted OpenUI Hosted API

are current repo-owned product lines, while marketplace listing, registry
publication, managed deployment, and remote write-capable MCP remain
later/operator-owned.

## Good For

- teams evaluating governed UI generation
- developers trying the MCP workflow for the first time
- users upgrading from the last release because of a specific outcome

## Upgrade Notes

- breaking changes, if any
- migration steps, if any
- new prerequisites, if any

## Validation Snapshot

List the checks that back the release claim:

```bash
npm run demo:ship
npm run public:surface:check
npm run public:assets:check
npm run repo:doctor
npm run smoke:e2e
npm run release:public-safe:check
```

## Public Asset Checklist

- demo gif
- frontdoor-to-workbench bridge visual
- comparison
- trust stack
- use cases
- visitor paths
- social preview

## Operator-Only Follow-Through

Call these out explicitly when they are still pending:

- Homepage update
- Social Preview verification
- publishing the draft release
- refreshing attached release assets
- Discussions seeding or curation

## Links

- README
- Discovery Surfaces
- Demo Proof and FAQ
- Architecture
- Full changelog or compare link
