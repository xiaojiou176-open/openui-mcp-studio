# Public Surface Guide

This document explains how to keep OpenUI MCP Studio looking like a maintained
product instead of drifting back into a governance-only repository facade.

## What Counts As Public Surface

The public surface is the combined first impression formed by:

- `README.md`
- `docs/discovery-surfaces.md`
- `docs/proof-and-faq.md`
- `docs/evaluator-checklist.md`
- `npm run demo:ship`
- release notes and release assets
- GitHub About, Topics, Homepage, and Discussions
- visual assets under `docs/assets/`

Primary product rule:

- the public GitHub repo is the main distribution artifact
- install bundles, skill bundles, plugin metadata, and machine-readable
  contracts are supporting shelves for that repo, not separate co-equal front
  doors

Canonical split:

- `README.md` sells the product in one screen
- `docs/discovery-surfaces.md` explains how to move from storefront to
  machine-readable discovery without falling into source files
- `docs/proof-and-faq.md` is the canonical proof explanation
- `docs/evaluator-checklist.md` is the short decision checklist
- `docs/first-minute-walkthrough.md` explains the fastest already-configured path

## Public Surface Rules

### 1. Lead With Results

When editing public-facing content, answer these in order:

1. What does the repository help people do?
2. What will they see if they try it in the first minute?
3. Why is it more trustworthy than a plain generator or demo?

Governance details still matter, but they must stay in the role of evidence,
not the opening paragraph.

That means `demo:ship` and the sample prompt must stay current. If the repo
cannot show one honest generated result quickly, the public story is already
drifting.

Hard rule:

- do not turn `apps/web` into a second marketing site by accident
- keep it as the default proof target unless a separate plan explicitly changes
  that role
- keep the README opening screen small enough that a new visitor can answer
  "what is this, where do I start, and why should I trust it?" without opening
  three more documents first
- keep the first screen focused on the repo itself before talking about plugin,
  skill, SDK, or hosted follow-through lanes
- move strategy history, packaging archaeology, and deeper ledgers behind the
  front row instead of stacking them into the README opening block

### 2. Keep The Visual Set Fresh

The current public asset bundle includes:

- frontdoor-to-workbench bridge visual
- animated demo
- workflow overview
- comparison visual
- trust stack visual
- use cases visual
- visitor paths visual
- social preview visual

If the public workflow changes materially, refresh the matching asset instead of
pretending the old one still represents the repo.

### 3. README And Releases Must Tell The Same Story

When the public message changes:

- update `README.md`
- update release notes or the release template when a published GitHub release
  actually exists
- keep About and Topics aligned with the same product sentence

If README says one thing and Releases say another, the repo starts feeling
unmaintained even when the code is healthy.

The current repository already has a published `v0.3.0` GitHub release, so the
README, release page, and attached asset bundle should all acknowledge the same
current public story.

If the repository has tags but no published GitHub release yet, keep that truth
explicit. Do not leave a release badge or navigation link in place if it makes
an empty Releases page look like a closed public surface.

### 3.1 Homepage And Social Preview Must Be Honest

- Prefer a real landing page or docs site for the GitHub Homepage field.
- If a truthful landing page already exists, point Homepage at that page.
  In the current repo posture, the correct target is the GitHub Pages front
  door, not a raw GitHub blob URL.
- If no standalone landing page exists yet, leaving Homepage unset is still
  better than pointing visitors at source code that looks like a product site.
- Do not assume that shipping `docs/assets/openui-mcp-studio-social-preview.png`
  means GitHub is already using it. Treat Social Preview as a settings-level
  control that must be explicitly verified whenever the public story changes.
- The app itself should serve one repo-owned social-preview image route so page
  metadata, release assets, and future public verification can point at the
  same truthful image instead of drifting into mismatched screenshots.

### 3.2 Draft Releases Are Not Public Closure

- A draft release is a preparation shelf, not a published public proof shelf.
- Treat the latest published release as the public truth for release notes and
  attached asset checks.
- If the repo only has a draft release, public-surface follow-through is still
  incomplete even when all local assets are ready.
- If the repo currently has no published GitHub release, point readers at tags,
  templates, or operator-owned follow-through instead of implying that a live
  release page already exists.

### 4. Discussions Should Feel Alive

The main discussions categories should keep at least one visible, useful thread:

- Announcements
- General
- Ideas
- Polls
- Q&A
- Show and tell

Empty categories make the project feel abandoned even when the setting is
enabled.

## Regenerating Public Assets

The public images are built from source HTML under `docs/assets/` and rendered
with Playwright screenshots.

Current source files:

- `docs/assets/openui-mcp-studio-workbench-source.html`
- `docs/assets/openui-mcp-studio-social-preview-source.html`
- `docs/assets/openui-mcp-studio-demo-source-brief.html`
- `docs/assets/openui-mcp-studio-demo-source-review.html`
- `docs/assets/openui-mcp-studio-demo-source-ship.html`
- `docs/assets/openui-mcp-studio-workflow-overview-source.html`
- `docs/assets/openui-mcp-studio-comparison-source.html`
- `docs/assets/openui-mcp-studio-trust-stack-source.html`
- `docs/assets/openui-mcp-studio-use-cases-source.html`
- `docs/assets/openui-mcp-studio-visitor-paths-source.html`

Preferred regeneration pattern:

1. update the matching source HTML
2. run `npm run public:assets:render`
3. run `npm run public:assets:check`
4. verify the repo-owned social preview route still serves the refreshed image
5. update README or docs references if the asset meaning changed
6. upload the asset to the latest published release only if a published release
   exists and that asset really belongs in the release bundle

Visual quality floor:

- comparison and trust visuals must not clip their final row or status pills
- demo frames must not rely on README scaling to stay readable
- if a frame only works when viewed full-size but becomes unreadable in README,
  treat that as a layout problem and fix the frame or the embedding pattern

## Release Asset Checklist

When the public story changes materially and a published GitHub release exists,
the latest release should expose the updated public assets:

- `openui-mcp-studio-demo.gif`
- `openui-mcp-studio-workbench.png`
- `openui-mcp-studio-workflow-overview.png`
- `openui-mcp-studio-comparison.png`
- `openui-mcp-studio-trust-stack.png`
- `openui-mcp-studio-use-cases.png`
- `openui-mcp-studio-visitor-paths.png`
- `openui-mcp-studio-social-preview.png`

## Machine-Readable Discovery Chain

Treat these routes as one discovery bundle:

- `/llms.txt`
- `/api/frontdoor`
- `/manifest.webmanifest`
- `/sitemap.xml`
- `/robots.txt`

They should repeat the same truth:

- `OpenUI MCP Studio` is the technical product
- `OneClickUI.ai` is the front-door label
- current builder order remains local MCP -> compatibility OpenAPI ->
  repo-local workflow packet
- the public repo is the primary distribution artifact
- repo-owned starter-pack packaging, supporting install bundles, and the
  OpenClaw skill product line are current
- SDK package shape and the self-hosted command surface are supporting or
  parked, not front-stage
- Docker runtime distribution is planned, not current
- official listing publication, registry publication, managed deployment, and
  remote write-capable MCP remain later/operator-owned

## Operator-Only GitHub Surfaces

These stay outside repo-local closure:

- Homepage field
- Social Preview selection and verification
- publishing future releases or refreshing attached release assets after the
  public story changes again
- future Discussions seeding and curation beyond the currently live baseline

The repo can prepare the story and the assets.
It can only prove those GitHub settings when live GitHub verification is
available in the current execution environment.

## Automation Entry Points

Use these commands instead of one-off shell snippets:

```bash
npm run public:assets:render
npm run public:assets:check
npm run public:remote:check
npm run public:surface:check
```

## Evaluator Checklist Routing

Use `docs/evaluator-checklist.md` when you want a decision-friendly page for:

- evaluators
- teammates reviewing the public story
- future maintainers checking whether the repo still feels convincing
