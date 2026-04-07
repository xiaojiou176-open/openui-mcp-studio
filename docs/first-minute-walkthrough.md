# Warm-Start Walkthrough

This file keeps the old "first minute" URL for link stability, but the route
below is the **warm-start** path. It assumes your machine is already prepared.

Use this page when you want the fastest honest answer to one question:

> Is OpenUI MCP Studio worth another minute of attention?

Use this route only if you already have:

- Node available locally
- `GEMINI_API_KEY` configured in `.env` or your shell
- a working repo checkout with dependencies installed

If you do **not** have that yet, start with the
[README Cold Start Quick Start](../README.md#cold-start-quick-start).
That path is slower, but it is the honest clean-machine route.

## 0 to 20 Seconds

Run:

```bash
npm run demo:ship
```

If that command cannot show you generated file output for the built-in prompt,
the repository is still asking for too much trust up front.

If your live provider is slow, rerun with:

```bash
npm run demo:ship -- --timeout-ms 120000
```

What this proves:

- one real ship-tool payload from the current repo
- not a placeholder screenshot
- not the full clean-room or release story

What this does **not** prove:

- that the repository already passed `repo:verify:full`
- that the result is production-ready
- that the public-safe release lane is clear

## 20 to 40 Seconds

Open the [README](../README.md) and look only at:

- the front-door hero
- the animated demo
- the workflow overview
- the route split between `/` and `/workbench`
- the discovery guide at [docs/discovery-surfaces.md](./discovery-surfaces.md)

If the repository still feels vague after that, the public story is not doing
its job.

## 40 to 60 Seconds

Open [Demo Proof and FAQ](./proof-and-faq.md) and check:

- whether `apps/web` is a real visible proof target
- whether the front door and `/workbench` explain different jobs clearly
- whether quality gates are part of the explanation
- whether the repository can explain why it is more than a simple generator

## 60 to 90 Seconds

If you want the fastest honest repo-side proof, run:

```bash
npm run repo:doctor
npm run repo:verify:fast
npm run smoke:e2e
```

What you are looking for:

- `demo:ship` tells you whether the repo can produce one real ship payload fast
- `repo:doctor` tells you whether the repository is in a healthy public-ready state
- `repo:verify:fast` tells you whether the deterministic local structural lane still holds
- `smoke:e2e` tells you the front door app still behaves like a real app
- `test:e2e` tells you the `/workbench` interaction contract still holds
- `docs/proof-and-faq.md` remains the canonical page for what each proof command
  does and does **not** prove

## If You Need The Manual Local Parity Path

Use this command when you intentionally want more than the fast local path:

```bash
npm run repo:verify:full
```

That path is slower and heavier by design. It is the manual local parity lane,
not the default front-door path.

## If You Want More Than One Minute

- Use [Evaluator Checklist](./evaluator-checklist.md) if you are comparing tools.
- Use [Discovery Surfaces](./discovery-surfaces.md) if you are deciding how to
  read `/llms.txt`, `/api/frontdoor`, or the current builder order.
- Use [Public Surface Guide](./public-surface-guide.md) if you are maintaining the public story.
- Use [Discussions](https://github.com/xiaojiou176-open/openui-mcp-studio/discussions) if you want to see how the repo is meant to be talked about in public.
