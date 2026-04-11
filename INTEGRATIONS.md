# Integrations

This file answers a different question from [`DISTRIBUTION.md`](./DISTRIBUTION.md):

Which client or host is OpenUI MCP Studio actually ready for today, and what is
the honest boundary for each one?

Think of it like a station board. Some platforms are already first-row routes.
Some are real but secondary. Some have live or pending external receipts with
clear review boundaries. Some are still comparison-only.

## Core Product Surfaces

| Surface | Current role | Truthful boundary |
| --- | --- | --- |
| local `stdio` MCP | Primary runtime | The canonical builder path stays local stdio MCP. |
| compatibility OpenAPI | Supporting bridge | The OpenAPI contract exists for compatibility, not as the main front door. |
| repo-local workflow packet | Maintainer bridge | Workflow summary and readiness packet stay read-only maintainer surfaces. |
| repo-owned skill product line | Install shelf | `@openui/skills-kit` and the repo mirror under `examples/skills/` are real current assets. |

## First-Row Current Fit

| Client / host | Status | Truthful claim |
| --- | --- | --- |
| Codex | First-row current fit | Repo-owned install config, proof loop, and submission-ready bundle exist today. |
| Claude Code | First-row current fit | Repo-owned install config, proof loop, and submission-ready bundle exist today. |
| Generic MCP hosts | Real current fit | The same local stdio MCP contract can be reused without claiming a vendor-native shelf. |

## Secondary Or Comparison Fit

| Client / host | Status | Truthful boundary |
| --- | --- | --- |
| OpenCode | Secondary / compatibility fit | The repo can support the same MCP contract, but it is not the headline install shelf. |
| OpenHands | `OPEN / REVIEW_REQUIRED / BLOCKED` | Submitted via PR `#161`; the repo has real substrate compatibility, but the current GitHub state is still review-required and blocked, not accepted. |

## External Lane Fit

| Client / host | Status | Truthful claim |
| --- | --- | --- |
| OpenClaw / ClawHub | `listed_live` with moderation warning | The repo ships a real OpenClaw bundle, install/proof notes, and a repo-owned skill line; the current ClawHub page is listed live, but the moderation label still reads `suspicious.llm_suspicious`. |
| Docker runtime consumers | `not_published` | The repo ships a Docker packet and operator runbook, but no verified public image receipt exists today. |

## Recommended Reading Path

Use the shortest route that matches the question:

1. [`README.md`](./README.md) for the storefront
2. [`DISTRIBUTION.md`](./DISTRIBUTION.md) for publishing / submission truth
3. [`examples/public-distribution/README.md`](./examples/public-distribution/README.md) for bundle files
4. [`examples/openclaw/README.md`](./examples/openclaw/README.md) for the OpenClaw lane
5. [`examples/public-distribution/docker-install-and-proof.md`](./examples/public-distribution/docker-install-and-proof.md) for the Docker lane

## What This Still Does Not Mean

- no trust-cleared marketplace approval is implied
- no hosted SaaS is implied
- no managed Docker runtime is implied
- no claim is made that a single bundle replaces the repo as the main product
  surface
