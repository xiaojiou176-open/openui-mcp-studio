# OpenUI External Activation Ledger

> Current ledger for the external activation and public-control surfaces.
> This document does not invent a hosted product or a live canonical site.
> It records what the repository can already say publicly, which repo-owned
> distribution surfaces are now strong, and what still depends on operator-
> owned settings or external infrastructure.

## 1. Current Product Story

The current public story is:

> OneClickUI.ai is the front door for OpenUI MCP Studio, an MCP-native UI/UX
> delivery and review workflow for Codex and Claude Code with a plugin-grade
> public starter bundle, proof desk, and review-ready operator surface.

Keep these truths split:

- `OpenUI MCP Studio` is the technical product and runtime name
- `OneClickUI.ai` is the shorter front-door label
- the current public promise is repo-aware UI shipping with proof and review
- the current public promise is **not** a hosted builder, generic coding agent,
  or live operations console

## 2. Current Discovery Chain

Use the current surfaces in this order:

1. `README.md`
2. `/`
3. `/proof`
4. `/walkthrough`
5. `/workbench`
6. `examples/skills/`
7. `/llms.txt`
8. `/api/frontdoor`
9. `/manifest.webmanifest`

That chain should feel like one maintained product story instead of a repo, an
app, and a machine-readable layer all speaking separately.

## 3. Surface Roles

| Surface | Current role | Keep visible |
| --- | --- | --- |
| `README.md` | GitHub storefront | product sentence, guided paths, proof/workbench split, distribution bundle truth |
| `/` | front door | product sentence, guided paths, machine-readable entry hints |
| `/proof` | proof desk | proof tiers, evidence meaning, next routes |
| `/workbench` | operator desk | repo-local packet decisions, pause rules, next move |
| `examples/skills/` | public starter bundle mirror | sample configs, proof loop, troubleshooting, starter metadata |
| `/llms.txt` | LLM/search summary | shortest route and builder summary |
| `/api/frontdoor` | structured discovery contract | routes, bindings, builder order, product lines, operator-only follow-through |
| `manifest`/`sitemap`/`robots` | browser and crawl metadata | install/crawl semantics, not long-form story |

## 4. Public Bundle

The current public bundle should be read as five shelves:

1. visuals
   - demo gif
   - frontdoor-to-workbench bridge visual
   - comparison
   - trust stack
   - visitor paths
   - social preview
2. narrative docs
   - README
   - discovery surfaces
   - proof FAQ
   - evaluator checklist
   - public surface guide
3. starter bundle artifacts
   - `examples/skills/*.mcp.json`
   - `examples/skills/public-starter.manifest.json`
   - `examples/skills/install-use-note.md`
   - `examples/skills/starter-troubleshooting.md`
4. machine-readable discovery
   - `llms.txt`
   - `frontdoor JSON`
   - `manifest`
   - `sitemap`
5. operator-only follow-through
   - Homepage
   - Social Preview
   - published release assets
   - Discussions curation

## 5. Repo-Owned Truth Already Established

These things are already true inside the repo:

- the public/product surfaces are strong enough to be evaluated honestly
- the product sentence is aligned across README, front door, proof desk, and
  machine-readable routes
- `apps/web` is still a proof/product surface, not a second generic marketing
  site
- `llms.txt`, `frontdoor JSON`, and `manifest` all describe the same current
  builder order and public product lines
- a plugin-grade public starter bundle now exists for Codex and Claude Code
- an OpenClaw public-ready, unlisted bundle now exists as a repo-owned artifact
- SDK and hosted API remain supporting/parked lanes, not the front-stage pitch

## 6. GitHub Live Truth Already Verified

Fresh GitHub reads in this execution wave confirm:

- repository description is aligned
- default branch is `main`
- repository is public
- open PR count is `0`
- Homepage remains intentionally unset
- the latest merged `main` head is current and readable

## 7. Operator-Only Follow-Through

These remain outside repo-local closure:

- GitHub Homepage field if a future promoted landing/docs URL is chosen
- GitHub Social Preview settings-level visual confirmation
- refreshing release assets after future public-surface changes
- ongoing Discussions curation
- official marketplace or catalog submission
- any real `OneClickUI.ai` domain, DNS, TLS, or deployed front door

## 8. Carry-Forward Risks

- The repo can prepare a public bundle, but GitHub settings still decide which
  social preview image is live.
- Homepage is intentionally blank today because a misleading URL would be worse
  than no URL.
- The front-door label can improve discovery, but it must not be confused with
  an already-verified canonical deployment.
- OpenClaw can now be described as public-ready, but not as listed or approved
  until a real ClawHub/public-catalog entry exists.

## 9. Current Verdict

- external activation is **partly repo-owned, partly operator-owned**
- the repo-owned side is now strong enough to support plugin-grade public
  distribution and an OpenClaw public-ready artifact
- the operator-owned side is still settings, listing, and future deployment
  ownership, not repo-side engineering debt
