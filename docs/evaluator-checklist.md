# Evaluator Checklist

Use this page when you want a short, decision-friendly way to evaluate whether
OpenUI MCP Studio is worth trying, sharing, or keeping on your radar.

Use `docs/proof-and-faq.md` as the canonical proof explanation.
Use this page as the shorter yes/no checklist.

## Fast Read

You are probably in the right place if you want all four of these:

- natural-language UI input
- one reproducible generated result without wiring your own harness first
- files applied into a real workspace
- a visible proof surface
- quality gates that stay part of the story

## Visual Checklist

![Use cases showing why evaluators keep OpenUI MCP Studio bookmarked](./assets/openui-mcp-studio-use-cases.png)

![Trust stack showing proof surface, quality gates, public routing, and governance evidence](./assets/openui-mcp-studio-trust-stack.png)

## Evaluation Questions

### 1. Can I understand what the repository does quickly?

Check:

- `README.md`
- `docs/discovery-surfaces.md`
- the frontdoor-to-workbench bridge visual
- the animated demo

If you still cannot explain the product in one sentence, the public story is
not strong enough yet.

### 2. Is there a real proof surface?

Check:

- `npm run demo:ship`
- `apps/web`
- `npm run smoke:e2e`
- `docs/proof-and-faq.md`

If the repository only talks about what it can do but does not show a visible
target or a reproducible ship result, treat the evaluation as incomplete.

Also check whether you are looking at the right proof tier:

- `demo:ship` is the warm-start visible proof
- `README.md#cold-start-quick-start` is the clean-machine setup path
- `repo:doctor` is the front-door health lane
- `repo:verify:fast` is the deterministic local structural lane
- `repo:verify:full` is the manual local parity lane
- `release:public-safe:check` is the strict public-safe lane

### 3. Does trust come from evidence instead of vibes?

Check:

- `npm run repo:doctor`
- `npm run repo:verify:fast`
- optionally `npm run repo:verify:full` when you intentionally want the slow local parity lane
- `npm run release:public-safe:check`
- the trust stack visual and proof FAQ

If the repository cannot explain why its output is reviewable, you are looking
at a weaker public story.

### 4. Can I see how it differs from a generic code generator?

Check:

- the comparison visual
- the `What Makes It Different` section in `README.md`
- Discussions and Release assets

If the difference still feels vague, the messaging is not specific enough yet.

## What To Read Next

If questions 1 and 2 are still fuzzy, go back to `README.md`.
If question 3 is where you are stuck, go to `docs/proof-and-faq.md`.
If question 4 is where you are stuck, compare `README.md` with the comparison
visual and the release assets.
If you are stuck on builder or machine-readable entry order, go to
`docs/discovery-surfaces.md`.
