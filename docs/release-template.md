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

## Highlights

- **New capability**
  One sentence on what people can do now.
- **Better workflow**
  One sentence on what got easier, faster, or safer.
- **Trust improvement**
  One sentence on how validation, docs, or public readiness improved.

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

## Links

- README
- Demo Proof and FAQ
- Architecture
- Full changelog or compare link
