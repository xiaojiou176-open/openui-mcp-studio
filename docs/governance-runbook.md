# Governance Runbook

This runbook describes the default operating path for humans and AI agents that
work in this repository.

English is the canonical source of truth for repository governance and
maintenance.

## Entry Order

1. Read `README.md`.
2. Read `docs/index.md`.
3. Read `docs/architecture.md`.
4. Read `docs/testing.md`.
5. Read `docs/environment-governance.md`.

## Front-Door Commands

These commands are the repository front desk.

| Command | What it proves | What it does not prove |
| --- | --- | --- |
| `npm run demo:ship` | one reproducible ship result from the real `openui_ship_react_page` tool | not a replacement for smoke, UI/UX, or release gates |
| `npm run repo:doctor` | current repository health across identity, language, tracked-surface hygiene, runtime, repo-local space governance, evidence, upstream, and release-readiness inputs | not a replacement for the full CI gate |
| `npm run repo:space:report` | current repo-local disk footprint, runtime canonical vs non-canonical split, and shared-layer defer map | not authorization to delete anything by itself |
| `npm run repo:space:check` | front-door repo-local space-governance gate: no hard-fail pollution and no unknown heavy non-canonical runtime subtree above threshold | not a replacement for runtime/evidence/public-safe gates |
| `npm run repo:space:verify` | current `verificationCandidates` cleanup eligibility across existence, canonicality, active refs, and rebuild-path knowledge | not permission to delete outside the controlled repo-local workflow |
| `npm run repo:verify:fast` | fast structural truth for identity, English-only tracked docs, tracked-surface hygiene, runtime, evidence, and docs alignment | not a replacement for authoritative container parity |
| `npm run repo:verify:full` | local authoritative container-parity path | not proof of trusted remote CI supply-chain closure by itself |
| `npm run repo:upstream:check` | upstream inventory, compatibility, patch governance, post-fetch history hygiene, and a non-blocking clone-local sync-preflight readout | not approval for whole-repo merge or rebase, and not proof that the current clone already has `upstream` attached |
| `npm run release:public-safe:check` | strict repository-side public-safe verdict across release evidence, dependency-review local preflight, Zizmor audit, Trivy filesystem audit, remote governance, canonical history hygiene, local heads/tags sensitive-surface history, and GitHub public-surface review | does not rotate credentials or rewrite Git history or clear GitHub read-only refs by itself |

## Security Entrypoints

| Command | What it proves | What it does not prove |
| --- | --- | --- |
| `npm run security:history:audit` | full Git-history gitleaks sweep | not proof that provider-side secrets were rotated |
| `npm run security:trufflehog:audit` | repository-surface secret scan with verification | not classification of historical findings |
| `npm run security:git-secrets:history` | alternate history secret scan | not a replacement for gitleaks history audit |
| `npm run security:scancode:keyfiles` | package, license, email, and URL scan across legal and manifest keyfiles | not a full legal review |
| `npm run security:pii:audit` | heuristic tracked-text scan for email addresses and phone-like contact fields | not a formal DLP or privacy review |
| `npm run security:sensitive-surface:audit` | heuristic tracked-text scan for personal contact fields and host-local absolute paths | not a replacement for tracked-surface log hygiene or remote GitHub review |
| `npm run security:history:sensitive:audit` | heuristic local heads/tags history scan for personal contact fields and host-local absolute paths | does not inspect GitHub-managed read-only refs such as `refs/pull/*` |
| `npm run security:github:public:audit` | read-only GitHub public-surface review across open secret-scanning alerts, open code-scanning alerts, code search, comment surfaces, and fetchable pull refs | does not remove read-only PR refs by itself |
| `npm run security:dependency-review:local` | local dependency-delta preflight for changed manifests before the GitHub PR dependency-review workflow runs | not a replacement for the GitHub pull-request dependency graph verdict |
| `npm run security:zizmor:audit` | local Zizmor workflow audit across tracked workflows, local composite actions, and Dependabot config | not a replacement for the live GitHub Zizmor workflow run |
| `npm run security:trivy:audit` | local Trivy filesystem audit over the tracked repository surface | not a replacement for the live GitHub Trivy workflow run |
| `npm run security:evidence:final` | consolidated repo-side PII + sensitive-surface + local history-sensitive + ScanCode final evidence pack under `.runtime-cache/reports/security/` | not a replacement for formal DLP, legal sign-off, or GitHub Support cleanup |
| `npm run security:oss:audit` | repo-local security bundle across all of the commands above, including dependency-review preflight, Zizmor, and Trivy | not automatic remediation |
| `npm run governance:remote:review` | remote canonical review plus fresh mirror audit summary | not proof that upstream repositories are also clean |

## Platform Security Surface

- GitHub secret scanning, push protection, private vulnerability reporting, and
  CodeQL code scanning must stay enabled on the canonical public repository.
- `.github/workflows/codeql.yml` is the repository-owned CodeQL entrypoint for
  GitHub code-scanning alerts.
- `.github/workflows/security-supplemental.yml` is the tracked entrypoint for
  pull-request Dependency Review, Zizmor, and Trivy filesystem scanning.

## Docs Truth Rules

- `docs/index.md` is the docs routing layer.
- The minimal docs profile keeps only the essential tracked guides.
- No tracked generated markdown docs are required in this profile.
- `docs:check` must stay green after docs are reduced.
- `docs:check` is the deterministic front-door docs lane.
- `docs:check:strict` is reserved for release or explicit manual governance
  review when manual-fact and proof-pack evidence need to be revalidated.
- The current minimal docs profile no longer treats generated markdown as a
  maintained repository surface. If a future wave reintroduces generated docs,
  that wave must also declare the generated outputs and their authoritative
  inputs explicitly.

## CI And Execution Truth

- Mainline CI uses host orchestration plus container execution for the main
  quality gate.
- The current stable required-check target on `main` is:
  - `Quality (Node 22.22.0)`
  - `Workflow Lint`
  - `secret_scan`
- Treat that set as the merge gate surface, not as the full public-safe or
  release-ready verdict by itself.
- Containerized CI jobs resolve their canonical image from
  `.github/ci-image.lock.json`; when that lock rotates, the workflow and lock
  file must stay in sync.
- If the locked digest stops pulling, rotate it from a fresh `Build CI Image`
  artifact instead of leaving PRs pinned to a dead GHCR reference.
- GitHub-hosted workflows that execute through the shared
  `run-in-ci-container` action also keep a governed local-bootstrap fallback
  enabled. If the locked digest becomes temporarily unavailable, the action may
  build the tracked Dockerfile locally to keep deterministic governance and lint
  lanes runnable while the canonical lock rotation is being repaired.
- GitHub Actions jobs that execute through the locked CI container also require
  `packages: read` permission so the workflow token can pull the GHCR image
  declared in `.github/ci-image.lock.json`.
- Workflow steps that run commands inside the CI container must pass any
  required PR or push range environment variables through explicitly, or commit
  range tooling inside the container will drift from the outer GitHub workflow
  context.
- The shared `run-in-ci-container` composite action is part of that contract:
  if PR or push range variables are needed inside the container, the action must
  explicitly carry them through as action inputs instead of assuming ambient env
  inheritance.
- Branch-aware CI helper steps must also tolerate missing GitHub branch-name
  env inside the container bridge. If `GITHUB_REF_NAME` or `GITHUB_HEAD_REF`
  are absent, non-branch-specific checks should skip cleanly instead of
  crashing under `set -u`.
- Branch-aware container logic should prefer a repo-local helper script over a
  multiline shell snippet embedded directly in the `run-in-ci-container`
  `command:` string. That keeps quoting predictable across the container bridge
  and avoids turning shell parsing drift into the primary CI blocker.
- The external runtime `node_modules` volume used by the container bridge must
  be cleared before a marker-driven reinstall. Otherwise stale workspace links
  can survive across waves and turn `npm ci` into a false parity blocker.
- Containerized pre-commit helpers must invoke `python3 -m venv` explicitly,
  because the locked CI image does not guarantee a bare `python` shim.
- The `postinstall` patch bootstrap is now patch-aware:
  if `ops/upstream/patches/patch-package/` contains no `.patch` files, the
  bootstrap path must short-circuit instead of invoking `patch-package` just to
  prove an empty patch surface.
- The `Pre-commit Gate` is intentionally host-runner based: the all-files
  pre-commit path currently needs a host compiler toolchain for the `oxipng`
  Rust hook, while the locked CI container remains the source of truth for the
  downstream main quality gate.
- PNG-producing maintenance flows should end with repo-owned lossless
  normalization instead of waiting for CI to discover stale screenshots.
  `npm run public:assets:render` and `npm run visual:qa:update` now both finish
  by running the tracked `oxipng` normalization step.
- Repository-wide `biome check --write` runs may reflow `package.json` together
  with test and fixture files as part of tracked formatting hygiene; treat that
  as a docs-synced governance change instead of silently reclassifying it as a
  dependency semantics change.
- Always-run evidence generation and uploads in CI are advisory
  evidence-preservation steps. Missing prerequisites such as a missing
  `summary.json` after an earlier hard-gate failure must skip cleanly instead of
  becoming the primary blocker or masking the first real error.
- The CI env inventory artifact is part of that governed evidence surface.
  Keep CI inventory snapshots under `.runtime-cache/env-governance/` so they
  stay inside the registered tool-metadata surface instead of tripping
  runtime-governance as an unknown runtime root.
- Gemini-backed UI/UX review must stay off the default hard-blocking hot path.
  Keep deterministic checks such as lint, typecheck, smoke/e2e, contract gates,
  and explicit a11y assertions as blockers; treat `uiux:audit:strict:gate` as
  advisory unless you are running a release or manual review lane on purpose.
- Local `pre-commit` and `pre-push` stay in the deterministic lane.
  Do not require `GEMINI_API_KEY` just to run repo-front-door hygiene, staged
  docs checks, lint, typecheck, or the fast local gate profile.
- The deterministic local lane and the default CI hot path both run
  `node tooling/check-host-safety.mjs`.
  That gate blocks negative-pid or process-group signals plus host-GUI
  automation primitives such as `killall`, `pkill`, `osascript`,
  `System Events`, `loginwindow`, raw `AppleEvent` flows, and
  `showForceQuitPanel`.
- The CI `required_env_hard_gate` should protect live-capable lanes, not the
  default PR front door.
  Ordinary PR and push paths should keep running deterministic workflow/docs/test
  gates even when no live Gemini credential is being exercised in that lane;
  manual maintenance lanes should opt into the key only when explicitly
  dispatched.
- The live Gemini hard gate also stays off the default PR hot path.
  Keep it manual-only behind `workflow_dispatch` plus an explicit
  `run_live_gemini` opt-in, rather than auto-running on `main`, `release/*`, or
  scheduled coverage lanes.
  Bind that lane to the protected `live-gemini-manual` environment so a
  reviewer must approve the secret-bearing run before it starts.
- Gemini-backed maintenance workflows stay manual-only as well.
  Mutation, quality-trend, and weekly env audit remain available for explicit
  operator review, but they should not auto-run on a time-based schedule in the
  canonical default posture.
- Mutation full runs also stay off the default `ci:gate` hot path.
  Keep them in explicit manual workflows or release-depth review lanes instead
  of making every routine PR pay the highest-cost verification bill.
- Docs co-change classification also stays off the default blocking lane.
  Keep routine docs checks deterministic, and reserve strict docs evidence
  checks for the release/manual path.
- Commit message range validation is intentionally host-runner based: it depends
  on GitHub event range variables and should not rely on extra container env
  bridging just to resolve `from` / `to`.
- Keep the host-runner commitlint job syntactically simple: once it no longer
  uses the container action, remove any leftover `with:` block so
  `workflow_dispatch` remains parseable on fresh branches.
- External readonly validation remains report-only and stays separate from the
  default blocking path.
- Long-running tasks must keep heartbeat output and preserve run-scoped evidence.
- Local container-parity runs should keep their host-side runtime/cache mounts
  under `.runtime-cache/ci-local-host/` by default so full verification does
  not spill machine-managed marker directories into the repository root.
- `ci-local-host` is part of the repo-local maintenance contract now, not just
  the report layer. Treat the subtree with four fixed classes:
  - `ms-playwright` -> disposable-generated
  - `node_modules` -> disposable-generated
  - `openui-home` -> disposable-generated
  - `tmp` -> scratch
- The default policy is:
  - before runs, container parity TTL-prunes disposable-generated
    `ci-local-host` subtrees with a `3 day` TTL
  - success-path container parity runs immediately reset `ci-local-host/tmp/`
  - `repo:space:maintain` / `repo:space:maintain:dry-run` remain the explicit
    repo-local maintenance lane and apply the same `3 day` TTL plus `72 hour`
    quiet window during planned cleanup waves
- `root-pristine` means allowlisted root hygiene. It is not a promise that the
  visible repository root stays empty after normal runtime activity.
- Space governance is a separate maintenance lane:
  - `repo:space:report` writes machine-readable snapshots under `.runtime-cache/reports/space-governance/`
  - `repo:space:check` is now part of the front-door governance path through `repo:doctor`, `repo:verify:fast`, and `governance:final:check`
  - `repo:space:check` fails on hard-fail pollution such as literal `$HOME/`, repo-local Go caches, and repo-local pre-commit tool homes, plus unknown heavy non-canonical runtime subtrees
  - `repo:space:verify` reports contract verification candidates plus repo-local maintenance candidates, including active refs, age, cleanup class, and skip reason
  - `repo:space:maintain:dry-run` is the explicit no-delete planning lane for repo-local maintenance
  - `repo:space:maintain` is the default repo-local bulk-maintenance lane and writes `maintenance-latest.*` under `.runtime-cache/reports/space-governance/`
  - `repo:space:clean:dry-run` is allowlist-only and must not target shared layers or the `.runtime-cache` root
  - machine-level shared layers such as Docker.raw, `~/.npm`, `~/.cache/pre-commit`, Playwright browser caches, and editor global stores remain report-only in repo-local governance and require separate operator approval

## Tracked-Surface Rules

- `.agents/`, `.agent/`, `.serena/`, `.codex/`, `.claude/`, `.runtime-cache/`,
  `logs/`, and tracked log outputs must never be committed.
- `AGENTS.md` and `CLAUDE.md` remain tracked on purpose.
- `examples/` is an allowlisted tracked root surface for repo-side starter kits
  and smokeable integration examples. Treat it like product-supporting source,
  not like scratch space.
- The repository enforces tracked-surface hygiene through a dedicated governance
  check, not just through `.gitignore`.

## Docs And Code Co-Change

When these change, update docs in the same wave:

1. package scripts or front-door commands
2. test and gate meanings
3. runtime/env behavior
4. upstream maintenance workflow
5. security reporting or public-safe release rules

## Remote Governance Freshness

- `tooling/contracts/remote-governance-evidence.contract.json` must be refreshed
  in the current execution wave before strict release-facing claims.
- A stale remote-governance snapshot is historical evidence, not current truth.
