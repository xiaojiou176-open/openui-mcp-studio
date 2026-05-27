# Starter Contract

This contract is a recipe card for future Skills packaging.
It answers one practical question:

> If a maintainer wants to describe a skill-shaped integration honestly today,
> which fields must be present so the contract is understandable, bounded, and
> easy to extend later?

## Required Fields

| Field | Why it exists |
| --- | --- |
| `id` | Stable identifier for the starter contract draft |
| `label` | Human-readable name maintainers can scan quickly |
| `summary` | One-sentence explanation of the skill-shaped slice |
| `invocation` | The current call path and bridge order |
| `inputs` | What the caller must provide |
| `outputs` | What the caller should expect back |
| `limitations` | Honest current boundaries and non-goals |
| `proofAnchors` | Repo files or commands that justify the contract wording |
| `nextActivationBoundary` | What must happen before this draft can graduate into a stronger surface |

## Authoring Rules

- Prefer current repo truth over future-product wording.
- Start from local `stdio` MCP when describing execution.
- Mention the OpenAPI file only as a compatibility bridge.
- Mention repo-local packets only as maintainer-facing surfaces.
- Use `limitations` to say what the starter contract does not prove.
- Use `nextActivationBoundary` to separate "useful draft" from "shipped surface".

## Minimal Review Questions

Before a maintainer extends one of these starter files, they should be able to
answer:

1. Is this still anchored in the current local MCP reality?
2. Is the OpenAPI mention still framed as bridge-only?
3. Is the repo-local packet still framed as maintainer-facing?
4. Would a zero-context reader mistake this for a shipped Skills product?

If the answer to question 4 is "yes", the contract needs to be tightened before
it is shared.
