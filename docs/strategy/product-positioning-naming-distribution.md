# Product Positioning, Naming, and Distribution Strategy

> Canonical strategy artifact for the current product-foundation wave.
> Supersedes `docs/strategy/product-positioning-naming-and-front-door.md`,
> which remains historical context only.

## 1. Why This Document Exists

This repository has already accumulated three different naming pressures:

1. the technical product name in code, docs, and MCP runtime
2. the marketing desire for a shorter traffic-friendly front door
3. the trend pressure to look like the hottest AI coding products

This document is the current grounding artifact for those pressures.
It is not a rebrand order.
It is a truth-preserving strategy memo.

## 2. Current Product Truth

### Technical main name

`OpenUI MCP Studio`

### Current shortest honest product sentence

Turn UI and UI/UX briefs into shippable React and shadcn delivery, with proof,
review, and acceptance.

### Current higher-order positioning

The repository can now be framed more strongly, but still honestly, as:

- MCP-native
- AI-driven
- UI/UX vertical
- focused on real delivery, review, and proof
- a stronger companion for Codex / Claude Code UI workflows than a generic AI
  coding platform

### What the repo really is

- a local `stdio` MCP server
- an AI-backed UI/UX delivery and review workflow
- a proof-and-governance-heavy engineering product

### What it is not

- not a generic AI agent platform
- not a pure browser agent
- not a hosted SaaS-first website builder
- not a generic RAG platform

## 3. Competitor and Market Signal Snapshot

These observations come from live official pages or official docs referenced in
the current execution wave.

| Product | Official signal | What they lead with | What we should learn | What we should not copy |
| --- | --- | --- | --- | --- |
| Cursor | `Cursor: The best way to code with AI` | short brand + blunt category promise | short name plus immediate benefit sentence | do not pretend this repo is an editor |
| Bolt | `Bolt AI builder: Websites, apps & prototypes` | clear builder language and direct "using your words" framing | high-intent product copy and try-now posture | do not promise generic app building breadth we do not own |
| Lovable | `AI App Builder ... apps & websites with AI, fast` | fast app-builder promise, low-friction creation framing | strong front-door conversion language | do not flatten our deeper review/proof value into a pure no-code builder claim |
| Devin | `The AI Software Engineer` | role-based positioning | strong category sentence matters | do not overclaim agent autonomy |
| OpenHands | `The Open Platform for Cloud Coding Agents` | open-platform identity | open-source identity can be a differentiator when it is real | do not move into generic cloud coding agent positioning |
| OpenCode | `The open source coding agent.` | open-source coding agent category | short open-source label plus clear role | do not call this repo a coding agent if UI delivery remains the true mainline |
| OpenClaw | `Personal AI Assistant` | personal assistant identity | strong semantic anchor matters | do not use `claw` because the product category is wrong |
| Claude Code | official docs call it `Claude Code` | coding tool identity tied to a model brand | explicit role naming is powerful | we cannot borrow the model-brand shortcut |
| v0 | official surface describes collaborative AI for full-stack web apps | design/build assistant with strong template and web-app framing | templates, examples, and immediate output matter | do not copy its category if our proof/review workflow is the real advantage |

## 4. Naming Recommendation

### Recommended architecture

Keep naming as two layers:

1. technical main name
2. marketing front-door name

### Technical main name recommendation

Keep:

- `OpenUI MCP Studio`

Why:

- it matches runtime reality
- it preserves OpenUI + MCP discoverability
- it explains why this repo feels more like a workbench than a simple generator
- it avoids a disruptive rename across repo/package/server/tool surfaces

### Marketing front-door recommendation

Use a shorter front door only as a distribution layer.

Preferred shape:

- front-door domain:
  `oneclickui.ai` only if it becomes live and intentionally owned
- supporting brand phrase:
  `Powered by OpenUI MCP Studio`

Current risk:

- `oneclickui.ai` did not resolve in live curl checks in this execution wave
- `OneClick*` naming space is already crowded:
  - `oneclick.ai`
  - `oneclickai.ai`
  - `oneclickai.app`

Conclusion:

- `OneClickUI` is acceptable as a traffic/front-door experiment
- it is not recommended as the new technical main name right now

### Naming directions to avoid

- `claw` names
- `bot` names
- generic `agent` names that erase the UI-delivery identity
- any rename that weakens `OpenUI` and `MCP` before a stronger hosted/product
  surface exists

## 5. Category Language

### Primary category

Spec-driven UI/UX delivery workbench

### Secondary category

Governed UI/UX shipping workflow for React and shadcn teams

### Supporting phrases

- AI UI shipping with proof
- prompt-to-React UI with review and verification
- MCP-native UI delivery workflow
- UI/UX execution and review companion for Codex / Claude Code workflows

### Avoid as primary category

- AI coding agent
- AI software engineer
- browser agent
- no-code app builder

Those phrases may help comparison pages, but they should not become the first
sentence if the product truth still centers on UI delivery plus proof.

## 6. Recommended Front-Door Copy

### Headline candidates

1. Turn UI briefs into shippable React UI, with proof and review.
2. AI UI shipping for React and shadcn teams.
3. Prompt to React delivery, with verification built in.

### Subhead candidates

1. Generate, apply, inspect, and verify frontend changes before you trust them.
2. A local MCP workflow that scans the target workspace, plans the change,
   applies real files, and keeps proof in the loop.
3. Built for teams that want more than screenshot demos and less than blind
   prompt optimism.

### Comparison-friendly line

More reviewable than a plain generator. More grounded than a generic AI agent.

## 7. SEO and Distribution Strategy

### Best-fit keyword clusters

- AI UI generator for React
- shadcn UI generator
- prompt to React UI
- AI UI review
- MCP frontend agent
- React UI shipping
- Bolt alternative
- Lovable alternative
- v0 alternative

### Why these are better than generic AI vanity terms

They target people who already know what they want to build and are closer to
trying the product.

### Distribution front door order

1. clear landing page with one proof-backed sentence
2. 30-second visible demo
3. comparison table against plain generators and app builders
4. proof ladder and evaluator route
5. GitHub repo for technical trust

### Do not lead with

- generic "AI agent" hype
- RAG or computer-use as the first story
- terminology that implies full autonomy or full hosted product maturity

## 7.1 Builder Surface Boundary

The current builder-facing order should stay explicit:

1. local stdio MCP
2. compatibility OpenAPI projection
3. repo-local workflow CLI/readiness packet

Do not market these as proof that the repo already ships:

- a hosted API
- a formal SDK
- plugin or marketplace distribution
- write-capable remote MCP

## 7.2 i18n Boundary

The public-facing language stance should also stay explicit:

- public pages stay English-first
- default locale is `en-US`
- product UI can switch to `zh-CN`
- new bilingual copy should come from centralized message sources, not
  scattered mixed-language literals

## 8. Functional Moves That Actually Support Naming and Traffic

Traffic gains will not come from naming alone.
The product needs a stronger front-door experience to cash in on any naming
improvement.

### Highest-value product moves

1. make `feature_flow` feel like real feature-level delivery
2. thicken acceptance and review into clearer default workflows
3. make first-time proof faster and more legible
4. eventually add repo/branch/PR integration once mainline delivery is thicker

### Why these matter for traffic

Because the official winners do not just sound modern.
They let visitors understand the product in one screen and imagine immediate
use.

## 9. Immediate No-Regret Actions

- keep `OpenUI MCP Studio` as the technical main name
- keep `OpenUI` / `MCP` / `proof` / `review` language visible in technical docs
- treat `OneClickUI` as an experiment only for a future marketing front door
- do not rename repo/package/server/tool prefixes yet
- build future landing pages around proof-backed UI delivery, not generic agent
  hype

## 10. Assumptions and Unknowns

### Facts

- official competitors use short brand plus blunt positioning
- `OneClick*` is a crowded namespace
- `oneclickui.ai` is not currently live in our curl-based checks

### Inferences

- a separate marketing front door can help traffic without forcing a technical
  rename
- the best growth surface is proof-backed UI delivery, not advanced-surface
  expansion

### Still unconfirmed

- whether `oneclickui.ai` will become available and strategically owned
- whether a future hosted front door changes the correct technical naming choice
