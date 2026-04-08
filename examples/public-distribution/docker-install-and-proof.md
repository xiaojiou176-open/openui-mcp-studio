# Docker Runtime Submission Packet

Status: `submission-ready-unlisted`

This note is the operator-facing Docker lane for OpenUI MCP Studio.

It answers one narrow question:

> If you want to prepare a truthful Docker distribution packet today, what is
> already packaged in the repo and what still requires a human publish step?

## Current Truth

- the canonical image name is `ghcr.io/xiaojiou176-open/openui-mcp-studio`
- the repo already ships the runtime/build contract under
  `ops/ci-container/run-in-container.sh`
- the repo can prove its local/front-door/readiness surfaces without claiming a
  live public image

## Suggested Operator Flow

1. confirm repo-owned truth first:
   - `npm run repo:doctor`
   - `npm run public:remote:check`
   - `npm run release:public-safe:check`
2. review the distribution contract:
   - `manifest.yaml`
   - `DISTRIBUTION.md`
3. use the container build wrapper or the pinned CI image path as the build
   reference:
   - `bash ops/ci-container/run-in-container.sh --command "npm run ci:gate:container"`
4. only after a real registry publish should public copy say the image is live

## What This Packet Does Not Claim

- it does not claim that `ghcr.io/xiaojiou176-open/openui-mcp-studio` is
  already published
- it does not claim that Docker is the main product front door
- it does not replace the repo-first install and proof story
