# Public Surface Guide

This document explains how to keep OpenUI MCP Studio looking like a maintained
product instead of drifting back into a governance-only repository facade.

## What Counts As Public Surface

The public surface is the combined first impression formed by:

- `README.md`
- `docs/proof-and-faq.md`
- `docs/evaluator-checklist.md`
- `npm run demo:ship`
- release notes and release assets
- GitHub About, Topics, Homepage, and Discussions
- visual assets under `docs/assets/`

Canonical split:

- `README.md` sells the product in one screen
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

### 2. Keep The Visual Set Fresh

The current public asset bundle includes:

- workbench screenshot
- animated demo
- workflow overview
- comparison visual
- trust stack visual
- use cases visual

If the public workflow changes materially, refresh the matching asset instead of
pretending the old one still represents the repo.

### 3. README And Releases Must Tell The Same Story

When the public message changes:

- update `README.md`
- update release notes or the release template
- keep About and Topics aligned with the same product sentence

If README says one thing and Releases say another, the repo starts feeling
unmaintained even when the code is healthy.

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

- `docs/assets/openui-mcp-studio-social-preview-source.html`
- `docs/assets/openui-mcp-studio-demo-source-brief.html`
- `docs/assets/openui-mcp-studio-demo-source-review.html`
- `docs/assets/openui-mcp-studio-demo-source-ship.html`
- `docs/assets/openui-mcp-studio-workflow-overview-source.html`
- `docs/assets/openui-mcp-studio-comparison-source.html`
- `docs/assets/openui-mcp-studio-trust-stack-source.html`
- `docs/assets/openui-mcp-studio-use-cases-source.html`

Preferred regeneration pattern:

1. update the matching source HTML
2. run `npm run public:assets:render`
3. run `npm run public:assets:check`
4. update README or docs references if the asset meaning changed
5. upload the asset to the latest release if it belongs in the release bundle

## Release Asset Checklist

When the public story changes materially, the latest release should expose the
updated public assets:

- `openui-mcp-studio-demo.gif`
- `openui-mcp-studio-workbench.png`
- `openui-mcp-studio-workflow-overview.png`
- `openui-mcp-studio-comparison.png`
- `openui-mcp-studio-trust-stack.png`
- `openui-mcp-studio-use-cases.png`
- `openui-mcp-studio-visitor-paths.png`
- `openui-mcp-studio-social-preview.png`

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
