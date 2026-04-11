# Distribution

This file answers the public-distribution question in one screen:

What can OpenUI MCP Studio truthfully ship today, which external lanes are live
but still under review, and which steps remain operator-only?

Think of it like a shipping desk. Some boxes are already on the shelf. Some are
packed, labeled, and ready to hand to a registry or marketplace reviewer. Some
still need a human to push the final publish button.

## Current Published Surfaces

| Surface | Status | Truthful claim |
| --- | --- | --- |
| GitHub repository | Published | `xiaojiou176-open/openui-mcp-studio` is the canonical public source and collaboration surface. |
| GitHub Pages front door | Published | `https://xiaojiou176-open.github.io/openui-mcp-studio/` is the current public front door. |
| GitHub Releases | Published | GitHub Releases is the public release trail with the current 8-asset bundle. |
| Proof and discovery docs | Published | Repo-owned proof, discovery, and install docs are already public in this repository. |

## External Distribution Truth

| Surface | Status | Truthful claim |
| --- | --- | --- |
| Pure-MCP registry descriptor | `not_submitted` | Root [`server.json`](./server.json) names the canonical pure-MCP surface without claiming any Official MCP Registry submission. |
| Codex bundle | Repo-owned package | Repo-owned config and marketplace-compatible sample exist, but no official directory listing is claimed. |
| Claude Code bundle | Repo-owned package | Repo-owned marketplace-compatible bundle exists, but no live marketplace listing is claimed. |
| OpenHands extension lane | `OPEN / REVIEW_REQUIRED / BLOCKED` | Submitted via PR `#161`; current GitHub state is still review-required and blocked, not accepted. |
| OpenClaw / ClawHub bundle | `listed_live` with moderation warning | The ClawHub page is listed live, but the current page still shows `Moderation verdict: suspicious` and `Detected: suspicious.llm_suspicious`. |
| GHCR | `not_published` | The repo can explain the image contract and proof route, but no GHCR publish receipt is verified today. |
| Public package / container lanes | No verified public receipt today | Package or container publication remains a later operator-owned proof step until a fresh receipt exists. |
| `@openui/sdk` local pack/install lane | Repo-owned pack/install | Pack/install truth exists inside the repo, but registry publication remains operator-only. |

## Docker Runtime Distribution

The current Docker lane is still a repo-owned packet, not a published runtime.

Use these files together:

- [`manifest.yaml`](./manifest.yaml)
- [`examples/public-distribution/docker-runtime-submission.manifest.json`](./examples/public-distribution/docker-runtime-submission.manifest.json)
- [`examples/public-distribution/docker-install-and-proof.md`](./examples/public-distribution/docker-install-and-proof.md)
- [`ops/ci-container/run-in-container.sh`](./ops/ci-container/run-in-container.sh)

This means:

- the repo can explain the image name, build contract, proof route, and
  operator-only publish steps
- `ghcr.io/xiaojiou176-open/openui-mcp-studio` remains `not_published`
- the repo does **not** claim a Docker-first front door

## Current Reading Order

Read the distribution story in this order:

1. [`README.md`](./README.md)
2. [`manifest.yaml`](./manifest.yaml)
3. [`server.json`](./server.json)
4. [`examples/public-distribution/README.md`](./examples/public-distribution/README.md)
5. [`examples/public-distribution/docker-runtime-submission.manifest.json`](./examples/public-distribution/docker-runtime-submission.manifest.json)
6. [`examples/public-distribution/openclaw-public-ready.manifest.json`](./examples/public-distribution/openclaw-public-ready.manifest.json)

## What We Still Do Not Claim

- a live official Codex directory listing
- a live Claude Code marketplace listing
- an Official MCP Registry submission or listing
- a trust-cleared or vendor-approved ClawHub result
- a GHCR publication or any other published public Docker image
- a managed hosted deployment or SaaS
- any package or container publish that requires a human account action and has
  not yet been freshly verified

## Operator-Only Follow-Through

The repository can prepare the submission packet, but these steps still belong
to an operator or platform owner:

1. create or refresh the real marketplace / registry entry
2. publish or attach the Docker image
3. complete any platform review flow
4. rerun fresh verification after the live publish before changing public copy
