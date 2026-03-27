# Demo Proof And FAQ

This page gives the shortest public answer to a practical question:

> Does OpenUI MCP Studio actually do more than produce a pretty screenshot?

The short answer is yes. The repository is built around a workflow that can
generate UI, apply files, and validate the result through repository-owned
checks.

Think of this page as the repository's proof desk:

- `README.md` is the storefront
- this page is the canonical proof explanation
- `docs/evaluator-checklist.md` is the scorecard you can skim quickly

## Fastest Reproducible Prompt

If you want one command that proves the repository can do more than show
screenshots, run:

```bash
npm run demo:ship
```

That command executes the real `openui_ship_react_page` tool with a built-in
pricing-page prompt and prints the generated file payload as JSON. It stays in
`dryRun` mode by default so you can inspect the result before writing files.
It also prefers `GEMINI_MODEL_FAST` when available and supports
`--timeout-ms 120000` if your live Gemini route needs a wider request window.

If your machine is not ready yet, go back to the [README Quick Start](../README.md#quick-start)
first. This page explains proof semantics; it does not replace first-time setup.

## What Each Proof Command Proves

| Command | What it proves | What it does not prove |
| --- | --- | --- |
| `npm run demo:ship` | one rerunnable ship-tool payload from the current repo | not a replacement for smoke, UI/UX, or release checks |
| `npm run repo:doctor` | front-door repository health across governance, runtime, evidence, upstream, and release-readiness inputs | not a full CI substitute and not a hosted-platform uptime guarantee |
| `npm run smoke:e2e` | the default proof target still boots and behaves like a real app | not proof that every generated UI is production-ready |
| `npm run release:public-safe:check` | the strict repo-side public-safe verdict across docs, release-readiness, remote evidence, and history hygiene | not legal sign-off, product judgment, or rollout approval |

## Demo Proof

![OpenUI MCP Studio workbench screenshot used as the public proof surface](./assets/openui-mcp-studio-workbench.png)

![Animated OpenUI MCP Studio demo showing brief, review, and ship stages](./assets/openui-mcp-studio-demo.gif)

![Workflow overview showing brief, generate, apply, and verify stages](./assets/openui-mcp-studio-workflow-overview.png)

![Comparison showing how OpenUI MCP Studio differs from a pure code generator and a generic UI demo repo](./assets/openui-mcp-studio-comparison.png)

![Trust stack showing proof surface, quality gates, public routing, and governance evidence](./assets/openui-mcp-studio-trust-stack.png)

## Generated, Applied, And Verified

Use this repository when you want one path that covers all three layers:

1. **Generated**
   A natural-language brief is converted into React and shadcn-oriented output.
2. **Applied**
   The repository applies files into the target workspace instead of stopping at
   a raw text response.
3. **Verified**
   Smoke, visual, UI/UX, and release-readiness checks give you evidence that the
   result is worth reviewing.

## Why `apps/web` Matters

`apps/web` is the default proof target. That means the repository keeps a real
page surface ready for smoke, E2E, visual, and UI/UX checks instead of asking
you to imagine the workflow in the abstract.

It does **not** mean `apps/web` is a second marketing site. The README and docs
router remain the public story. `apps/web` exists to prove the workflow on a
real surface.

## Trust Stack

If you want the short version of why this repository feels more trustworthy
than a plain generator, it comes down to four visible layers:

1. a real proof surface
2. quality gates that stay in the loop
3. public routing that helps evaluators start in the right place
4. governance that shows up as evidence instead of marketing fog

That is the short version of the product claim:

> OpenUI MCP Studio is for teams who want UI generation to end in inspectable
> project state, not just model output.

## FAQ

### What is the relationship to OpenUI?

This repository is a long-lived productized fork. It keeps upstream OpenUI
visible for selective adoption, but its day-to-day identity is a governed MCP
studio for UI shipping.

### Why is it called a studio instead of a generator?

Because the repository owns more of the journey. It starts from a brief, but it
also owns file application, proof surfaces, and quality gates.

### Is this just a Next.js demo?

No. The runtime entrypoint is the local MCP server. The Next.js app is the
default proof target, not the system entrypoint.

### Why is it more trustworthy than a plain code-generation demo?

Because it keeps explicit validation paths such as `repo:doctor`,
`smoke:e2e`, and `release:public-safe:check`. In plain language, it has a
"show me the evidence" layer rather than asking you to trust the prompt alone.

### What is the fastest way to see one generated result?

Use `npm run demo:ship`. It runs the real ship tool, prints generated files, and
lets you add `--apply` later if you want to write into `apps/web`.

### Is it ready for production use as-is?

Treat it as a strong evaluation and workflow foundation, not as a promise that
every generated UI should ship unchanged. You still own product judgment,
accessibility review, and rollout decisions.
