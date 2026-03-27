# Contributing

## Before You Start

This repository is a local `stdio` MCP server plus a governed workspace for the
default product frontend at `apps/web`.

Please read these entry points before making changes:

- `README.md`
- `docs/index.md`
- `docs/architecture.md`
- `docs/governance-runbook.md`
- `AGENTS.md`

## Development Baseline

Recommended local setup:

```bash
npm install
cp .env.example .env
npx playwright install chromium firefox webkit
npm run build
npm start
```

Recommended container parity path:

```bash
npm run repo:verify:full
```

## Change Discipline

Please keep changes surgical:

- make the smallest defensible change
- update documentation when commands, workflows, env behavior, or runtime
  contracts change
- avoid unrelated refactors
- do not commit real secrets or `.env` files

## Validation Expectations

At minimum, contributors should run the smallest relevant verification set for
their change:

```bash
npm run lint
npm run typecheck
npm run test
```

UI, route, or interaction changes should also run:

```bash
npm run test:e2e
npm run smoke:e2e
```

Release-quality or broad governance changes should also run:

```bash
npm run ci:gate
```

## Commit and PR Expectations

- use Conventional Commits where possible
- include verification notes in pull requests
- explain rollback expectations for risky changes
- call out environment, runtime, or upstream impacts explicitly

The repository includes a pull request template under
`.github/pull_request_template.md`. Follow it instead of inventing a custom
format.

## Contribution License Boundary

Unless a maintainer explicitly agrees otherwise in writing for a specific
change, any contribution submitted to this repository is understood to be
offered under the same license that governs the repository at merge time.

That means:

- do not contribute code, assets, or data unless you have the right to submit it
- do not paste third-party proprietary material into issues, pull requests, or
  commits
- call out any upstream import, vendored code, or license-sensitive material in
  the PR description instead of assuming it is safe by default

## Security and Sensitive Data

- report sensitive vulnerabilities according to `SECURITY.md`
- never paste secrets into issues, docs, logs, or screenshots
- keep example env files non-secret

## Scope Boundaries

This repository is responsible for:

- OpenUI integration
- Gemini-only execution and provider orchestration
- safe file application and quality gate orchestration
- governed runtime, docs, and CI surfaces

This repository is not responsible for:

- operating the upstream OpenUI service itself
- arbitrary shell execution as a product feature
- long-lived parallel implementations of upstream behavior

## Support Model

Contributions are reviewed on a best-effort basis. Large architectural changes
should start with a design discussion before implementation. Use GitHub
Discussions for early ideas and issue tracker entries for confirmed repository
bugs or workflow failures.
