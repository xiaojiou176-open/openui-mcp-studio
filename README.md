<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/artist-palette_1f3a8.png" width="120" alt="artist palette" />
</p>

<h1 align="center">ShadcnBrief</h1>

<p align="center">
  <strong>brief in, React + shadcn out, proof attached</strong>
</p>

<p align="center">
  <a href="https://github.com/xiaojiou176-open/shadcn-brief/stargazers"><img src="https://img.shields.io/github/stars/xiaojiou176-open/shadcn-brief?style=flat&color=yellow" alt="Stars"></a>
  <a href="https://github.com/xiaojiou176-open/shadcn-brief/commits/main"><img src="https://img.shields.io/github/last-commit/xiaojiou176-open/shadcn-brief?style=flat" alt="Last Commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xiaojiou176-open/shadcn-brief?style=flat" alt="License"></a>
</p>

<p align="center">
  <a href="#what-you-get">What You Get</a> •
  <a href="#install">Install</a> •
  <a href="#how-it-work">How It Work</a> •
  <a href="#ecosystem">Ecosystem</a>
</p>

---

ShadcnBrief takes a one-paragraph brief and produces a styled React + shadcn surface — with screenshots, accessibility checks, and proof attached. Open-source MCP studio, batteries included.

```
┌──────────────────────────────────────┐
│  LOCAL-FIRST          ████████ 100%  │
│  SOURCE-TRACEABLE     ████████ 100%  │
│  TYPING REQUIRED      ░░░░░░░░   0%  │
│  VIBES                ████████ ZERO  │
│                                FILLER│
└──────────────────────────────────────┘
```

> MCP-driven UI generator. Brief, render, diff, ship.

## What You Get

| Surface | What |
|---|---|
| `studio apps` | Brief → preview → diff → export. All local. |
| `packages` | Reusable shadcn-aligned components, themed for proof workflows. |
| `mcp services` | Hand a brief to any agent through an MCP server. |
| `contracts` | Schemas for brief, render, and proof — versioned, diffable. |
| `tooling` | Snapshot tests, a11y checks, design-token guardrails. |

> [!IMPORTANT]
> Local-first by default. No silent telemetry. No cloud round-trip. Your data stays on your machine until you explicitly ship it somewhere.

## Install

```bash
git clone https://github.com/xiaojiou176-open/shadcn-brief.git
cd ShadcnBrief
# follow the per-stack quickstart in INSTALL.md or docs/
```

Three commands. No `curl | sh`. No login. Read what you run.

Install break? Open your favorite agent and say *"Read AGENTS.md and bootstrap ShadcnBrief for me."* Agent fix own brain. Long version: [`docs/`](./docs/).

## How It Work

The repo is seven layers — exactly the seven commits in `git log`. New work goes in as small named PRs. No 50-file mystery commits.

| Layer | What |
|---|---|
| `chore: scaffold` | License, governance, hygiene gates, CI scaffolding. |
| `feat(core)` | The primary engine. The reason ShadcnBrief exists. |
| `feat(modules)` | Packages, adapters, services, plugins. The second floor. |
| `feat(contracts)` | Schemas, configs, public boundaries. Other code talks here. |
| `test:` | Receipts. Everything in this layer must run. |
| `feat(ops)` | Scripts, infra, CI helpers, build glue. |
| `docs:` | Public docs surface. The pretty face. |

`git log` reads like a building floor plan. Look once, know the whole shape.

## Ecosystem

ShadcnBrief lives in the **open family**: three open platforms. local-first, source-first, builder-first.

| Repo | What |
|---|---|
| [**OpenCampus**](https://github.com/xiaojiou176-open/OpenCampus) | Canvas + Gradescope + EdStem on one calm desk |
| [**OpenVibeCoding**](https://github.com/xiaojiou176-open/OpenVibeCoding) | AI codes overnight, you ship in the morning |
| [**ShadcnBrief**](https://github.com/xiaojiou176-open/shadcn-brief) *(you here)* | brief in, React + shadcn out, proof attached |

Cross-family taste:
[**BeamMe**](https://github.com/xiaojiou176-open/BeamMe) ·
[**BrewMe**](https://github.com/xiaojiou176-open/BrewMe) ·
[**OpenVibeCoding**](https://github.com/xiaojiou176-open/OpenVibeCoding) ·
[**proofyard**](https://github.com/xiaojiou176-open/proofyard).

## Star This Repo

If ShadcnBrief saves you a click, an hour, or a headache — star costs zero. Fair trade. ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=xiaojiou176-open/shadcn-brief&type=Date)](https://star-history.com/#xiaojiou176-open/shadcn-brief&Date)

## Also by Yifeng[Terry] Yu

- **[OpenCampus](https://github.com/xiaojiou176-open/OpenCampus)** — Canvas + Gradescope + EdStem on one calm desk
- **[OpenVibeCoding](https://github.com/xiaojiou176-open/OpenVibeCoding)** — AI codes overnight, you ship in the morning
- **[BeamMe](https://github.com/xiaojiou176-open/BeamMe)** — beam your agent config to any planet
- **[BrewMe](https://github.com/xiaojiou176-open/BrewMe)** — wake up, news already brewed
- **[proofyard](https://github.com/xiaojiou176-open/proofyard)** — every claim ships with its receipt

## License

MIT — small print, big freedom.
