# Product Positioning, Naming, and Front-Door Strategy

> Superseded on 2026-03-31 by
> `docs/strategy/product-positioning-naming-distribution.md`.
> Keep this file only as historical thread context, not as the current
> strategy source of truth.

This document defines the current product-positioning and naming strategy for
`openui-mcp-studio`.

English is the canonical source of truth for repository governance and
maintenance guidance, so this strategy artifact stays in English as the
maintainer-facing reference.

## 1. Current Product Truth

### One-sentence product line

OpenUI MCP Studio is a Gemini-only local MCP UI shipping workbench that turns
prompts into React + shadcn changes, can apply them into a real workspace, and
keeps proof, review, and quality gates in the loop.

### What it is not

- It is **not** a generic AI agent platform.
- It is **not** a hosted website builder first.
- It is **not** a pure screenshot or one-shot generator.
- It is **not** a durable RAG platform.
- It is **not** a browser-agent product whose primary value is computer use.

### Current product stack

| Layer | Recommended name | Why it exists |
| :--- | :--- | :--- |
| Technical core name | `OpenUI MCP Studio` | Keeps the strongest truth anchors: `OpenUI`, `MCP`, and a workflow-oriented `Studio` identity |
| Marketing front door | `OneClickUI.ai` (candidate domain / landing only) | Stronger click-through and memory for non-technical audiences |
| Category sentence | `AI UI shipping for React + shadcn, with proof and review.` | Short, explicit, high-intent positioning |
| Technical category sentence | `A local MCP UI shipping workbench.` | More accurate for technical evaluators and integrators |

## 2. Naming Decision

### Recommended decision

Keep the technical product name as `OpenUI MCP Studio`.

Do **not** rename the repository, package, MCP server identity, or tool prefix
to `oneclickUI.ai` in the current phase.

Use `OneClickUI.ai` only as a marketing front door or standalone landing-page
domain if and when an external landing surface is introduced.

### Why this is the default choice

#### [Fact] The current repo identity is already deeply wired

The current identity is embedded in:

- `package.json`
- `services/mcp-server/src/index.ts`
- tool naming and namespace expectations
- `README.md`
- `docs/architecture.md`
- `docs/proof-and-faq.md`

Renaming the repo/package/server identity now would create an avoidable
technical and narrative drift wave.

#### [Fact] The current product is more technical than `one-click`

The repo already exposes:

- `openui_ship_react_page`
- `openui_scan_workspace_profile`
- `openui_plan_change`
- `openui_build_acceptance_pack`
- `openui_build_review_bundle`
- `openui_ship_feature_flow`

That is a stronger and more workflow-heavy identity than a pure
“one-click UI generator” promise.

#### [Fact] The `OneClick + AI` naming space is crowded

Current live naming neighbors include:

- [One-Click AI](https://www.oneclickai.ai/)
- [OneClick.ai](https://www.oneclick.ai/)
- [OneClickAI.app](https://oneclickai.app/)
- [One Click SEO](https://oneclickseo.ai/)

This creates broad traffic familiarity, but not strong brand uniqueness.

#### [Inference] `OneClickUI.ai` works better as a click-friendly front door than a technical core name

It is more marketing-friendly, more domain-shaped, and more memorable for
non-technical audiences, but it also shifts expectations toward:

- hosted SaaS
- lower-friction “instant” generation
- less MCP / proof / review / governance identity

That is useful for landing-page traffic, but risky as the current canonical
technical name.

## 3. Recommended Naming Architecture

### Layered naming model

| Use case | Recommended label |
| :--- | :--- |
| GitHub repo, package, MCP server, technical docs | `OpenUI MCP Studio` |
| Landing page / campaign / domain | `OneClickUI.ai` |
| Short campaign subtitle | `Turn prompts into shippable React UI, with review and proof.` |
| Technical short subtitle | `A local MCP UI shipping workbench for React + shadcn.` |

### Acceptable variants

- `OpenUI MCP Studio`
- `OpenUI Studio` as a shorter public-tech label in selective contexts
- `OneClickUI.ai`
- `OpenUI MCP Studio by OneClickUI` if a dual-brand transition page is ever needed

### Not recommended right now

- `OpenClawUI`
- `ClawUI`
- `UIBot`
- `OneClickBot`
- `OpenAgentUI`
- direct replacement of the repo/product core name with `OneClickUI.ai`

These variants either overfit to transient naming trends or misrepresent the
current product as a generic agent or lightweight assistant.

## 4. What Competitors Teach Us

### [Fact] Winning products pair short names with explicit category language

Official-site signals:

- [Cursor](https://cursor.com/): “The best way to code with AI”
- [Claude Code](https://claude.com/product/claude-code): “AI Coding Agent, Terminal, IDE”
- [Devin](https://devin.ai/): “The AI Software Engineer”
- [Bolt](https://bolt.new/): “AI builder: Websites, apps & prototypes”
- [Lovable](https://lovable.dev/): “AI App Builder”
- [v0](https://v0.dev/): “Build Agents, Apps, and Websites with AI”
- [OpenHands](https://openhands.dev/): “The Open Platform for Cloud Coding Agents”
- [OpenCode](https://opencode.ai/): “The open source coding agent”
- [OpenClaw](https://openclaw.ai/): “The AI that actually does things. Your personal assistant on any platform.”

### Learn from them

- Keep the product sentence brutally short.
- Lead with the user outcome, not internal architecture.
- Make the first visible proof easy to understand.
- Use the landing page to clarify the category.

### Do not copy from them blindly

- Do not rename into a generic `claw` / `bot` style brand.
- Do not promise a hosted “instant builder” experience before that surface
  actually exists.
- Do not widen the repo narrative into “general AI agent” territory.

## 5. Front-Door Strategy

### Default front-door model

| Front door | Purpose | Status |
| :--- | :--- | :--- |
| GitHub README | technical product story and proof ladder | already live |
| `docs/proof-and-faq.md` | canonical proof explanation | already live |
| `docs/first-minute-walkthrough.md` | fastest already-configured route | already live |
| `OneClickUI.ai` landing page | click-friendly growth front door | future / optional |

### Key rule

Do not turn `apps/web` into a second marketing site.

The repository already treats `apps/web` as the default proof target, and that
boundary should stay intact unless a separate product plan explicitly changes
it.

### Phase order

1. Thicken the delivery mainline first.
2. Improve frictionless proof second.
3. Launch a marketing front door third.
4. Expand SEO content and alternative pages after the product story is stable.

## 6. SEO and Category Language

### Recommended category phrases

- `AI UI shipping`
- `Prompt-to-React UI shipping`
- `React + shadcn UI generation with proof`
- `MCP UI delivery workbench`
- `AI UI review and proof workflow`

### Recommended high-intent search clusters

- `AI UI generator`
- `shadcn generator`
- `React UI agent`
- `MCP frontend agent`
- `prompt to React`
- `AI UI review`
- `Lovable alternative`
- `Bolt alternative`
- `v0 alternative`
- `AI UI shipping`

### Recommended hero-line candidates

- `Turn prompts into shippable React UI, with review and proof.`
- `AI UI shipping for React + shadcn, with proof and review.`
- `From prompt to applied UI, without losing the review trail.`

## 7. What Must Happen Before Growth Gets the Microphone

### Must happen first

- `feature_flow` artifact and review aggregation must get thicker.
- acceptance/review must become more trustworthy than a thin structure wrapper.
- developer flow and GitHub/PR integration must become more coherent.
- proof/onboarding must become easier for first-time evaluators.

### Can happen after the above

- external landing page
- comparison pages
- alternative pages
- campaign content around `OneClickUI.ai`

## 8. Bet Boundaries

The following are valid future bets, but not current front-door claims:

- RAG-assisted planning
- computer-use-assisted review
- multi-provider support
- hosted cloud delivery service

Each of these requires a separate product-validation wave before it should
change the naming or category language.

## 9. Decision Summary

### [Fact]

- The current technical name still matches the repo’s real product shape.
- The repo is more than a generator, and more workflow-heavy than a simple
  “one-click UI builder” promise.
- The `OneClick + AI` namespace already has multiple incumbents.

### [Inference]

- `OneClickUI.ai` is better as a growth front door than as the current product
  core name.
- The repo should compete on `proof + review + delivery workflow`, not on
  generic agent naming mimicry.

### [Pending Confirmation]

- Whether an actual external landing page will be launched
- Whether `oneclickui.ai` will be acquired and activated
- Whether hosted proof becomes a real near-term product surface
