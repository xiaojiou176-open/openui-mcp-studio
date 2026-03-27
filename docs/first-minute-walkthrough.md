# First Minute Walkthrough

Use this page when you want the fastest honest answer to one question:

> Is OpenUI MCP Studio worth another minute of attention?

Use this route only if you already have:

- Node available locally
- `GEMINI_API_KEY` configured in `.env` or your shell
- a working repo checkout with dependencies installed

If you do **not** have that yet, start with the [README Quick Start](../README.md#quick-start).
That path is slower, but it is the honest cold-start route.

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

## 20 to 40 Seconds

Open the [README](../README.md) and look only at:

- the workbench hero
- the animated demo
- the workflow overview

If the repository still feels vague after that, the public story is not doing
its job.

## 40 to 60 Seconds

Open [Demo Proof and FAQ](./proof-and-faq.md) and check:

- whether `apps/web` is a real visible proof target
- whether quality gates are part of the explanation
- whether the repository can explain why it is more than a simple generator

## 60 to 90 Seconds

If you want the fastest honest repo-side proof, run:

```bash
npm run repo:doctor
npm run smoke:e2e
```

What you are looking for:

- `demo:ship` tells you whether the repo can produce one real ship payload fast
- `repo:doctor` tells you whether the repository is in a healthy public-ready state
- `smoke:e2e` tells you the default proof target still behaves like a real app
- `docs/proof-and-faq.md` remains the canonical page for what each proof command
  does and does **not** prove

## If You Want More Than One Minute

- Use [Evaluator Checklist](./evaluator-checklist.md) if you are comparing tools.
- Use [Public Surface Guide](./public-surface-guide.md) if you are maintaining the public story.
- Use [Discussions](https://github.com/xiaojiou176-open/openui-mcp-studio/discussions) if you want to see how the repo is meant to be talked about in public.
