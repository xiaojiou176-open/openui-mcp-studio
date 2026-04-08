# Distribution

This file answers the public-distribution question in one screen:

What can OpenUI MCP Studio truthfully ship today, what is submission-ready but
still unlisted, and which steps remain operator-only?

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

## Submission-Ready But Still Unlisted

| Surface | Status | Truthful claim |
| --- | --- | --- |
| Codex bundle | Submission-ready-unlisted | Repo-owned config and marketplace-compatible sample exist, but no live directory listing is claimed. |
| Claude Code bundle | Submission-ready-unlisted | Repo-owned marketplace-compatible bundle exists, but no live marketplace listing is claimed. |
| OpenClaw / ClawHub bundle | Submission-ready-unlisted | Repo-owned bundle and proof loop exist, but no live ClawHub listing is claimed. |
| Docker runtime distribution | Submission-ready-unlisted | Repo-owned Docker packaging guidance and manifest now exist, but no public image publish is claimed. |
| `@openui/sdk` local pack/install lane | Submission-ready-unlisted | Pack/install truth exists inside the repo, but registry publication remains operator-only. |

## Docker Runtime Distribution

The current Docker lane is now packaged as a repo-owned submission packet, not a
live registry claim.

Use these files together:

- [`manifest.yaml`](./manifest.yaml)
- [`examples/public-distribution/docker-runtime-submission.manifest.json`](./examples/public-distribution/docker-runtime-submission.manifest.json)
- [`examples/public-distribution/docker-install-and-proof.md`](./examples/public-distribution/docker-install-and-proof.md)
- [`ops/ci-container/run-in-container.sh`](./ops/ci-container/run-in-container.sh)

This means:

- the repo can explain the image name, build contract, proof route, and
  operator-only publish steps
- the repo does **not** claim that `ghcr.io/xiaojiou176-open/openui-mcp-studio`
  is already published
- the repo does **not** claim a Docker-first front door

## Current Reading Order

Read the distribution story in this order:

1. [`README.md`](./README.md)
2. [`manifest.yaml`](./manifest.yaml)
3. [`examples/public-distribution/README.md`](./examples/public-distribution/README.md)
4. [`examples/public-distribution/docker-runtime-submission.manifest.json`](./examples/public-distribution/docker-runtime-submission.manifest.json)
5. [`examples/public-distribution/openclaw-public-ready.manifest.json`](./examples/public-distribution/openclaw-public-ready.manifest.json)

## What We Still Do Not Claim

- a live official Codex directory listing
- a live Claude Code marketplace listing
- a live ClawHub listing
- a published public Docker image
- a managed hosted deployment or SaaS
- any registry publish that requires a human account action and has not yet been
  completed

## Operator-Only Follow-Through

The repository can prepare the submission packet, but these steps still belong
to an operator or platform owner:

1. create or refresh the real marketplace / registry entry
2. publish or attach the Docker image
3. complete any platform review flow
4. rerun fresh verification after the live publish before changing public copy
