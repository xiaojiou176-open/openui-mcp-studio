# Environment Governance

## Scope

This repository is an MCP server with Gemini-only model execution.
Provider secrets are loaded at MCP runtime (not committed in this repo).

Runtime baseline for CI parity:
- Canonical Node version: `22.22.0`.
- CI execution mode: host orchestration + container execution (main quality gates run inside repository CI image).
- Local recommended front-door path: `npm run repo:doctor`, `npm run repo:verify:fast`, and targeted proof commands such as `npm run smoke:e2e`.
- Manual local parity path: devcontainer or `npm run repo:verify:full`.
- Local CI image bootstrap is opt-in only: use `npm run ci:local:container:bootstrap` only when you intentionally want this machine to build the locked CI image.

## Source of Truth

- `packages/contracts/src/env-contract.ts`: canonical env key list and metadata.
- `services/mcp-server/src/constants.ts`: runtime schema and fail-fast validation behavior.
- `.env.example`: committed non-secret template values.
- `.env.development.example` / `.env.staging.example` / `.env.production.example`: committed profile examples with non-secret values.
- `.env`: local-only runtime file (never committed).
- Shell/CI env: highest-priority source for automation and production.
- Governance constraint: default values and validation rules in this document must follow `packages/contracts/src/env-contract.ts` and `services/mcp-server/src/constants.ts`; any new key must update this table in the same change.
- Keyset constraint: all `*.env*.example` files must keep the full `OPENUI_ENV_KEYS` keyset (same keys, different values allowed).
- Git tracking constraint: `.gitignore` keeps `.env*` ignored by default and whitelists only `.env.example` + three profile examples.

Maintenance note (2026-03-03): `services/mcp-server/src/constants.ts` had formatting-only refactors (no runtime env behavior change).

Template whitelist (version-controlled) is fixed to:
- `.env.example`
- `.env.development.example`
- `.env.staging.example`
- `.env.production.example`

`.env.sample` is not a tracked template in this repository and must not be used as a governance source.

## Python Sidecar Dependency Governance

- `services/gemini-sidecar/requirements.txt` remains the compatibility intent
  file for direct Python sidecar dependencies.
- `services/gemini-sidecar/constraints.txt` is the locked resolution for the
  default repo sidecar install path and must move in the same change as any
  sidecar dependency update.
- `requirements.txt` must include `-c constraints.txt` so the default install
  path consumes the locked resolution instead of floating on ranges alone.
- `node tooling/check-python-sidecar-lock.mjs` is the minimum parity check. It
  verifies that every direct requirement is pinned in `constraints.txt`, that
  each pin still satisfies the declared version window, and that constraints use
  exact `==` pins only.
- Refresh evidence command:

```bash
python3 -m pip install --dry-run --ignore-installed --report /tmp/python-sidecar-lock-report.json -r services/gemini-sidecar/requirements.txt
node tooling/check-python-sidecar-lock.mjs
```

## Resolution Priority (Default)

1. Explicit shell/CI environment variables.
2. `.env` loaded by `--env-file-if-exists`.
3. Code defaults from `packages/contracts/src/env-contract.ts` (applied by `services/mcp-server/src/constants.ts`).

Unified policy: keep `.env` as the single maintained runtime file for local dev/start/CI.
Secret-source hard rule: `GEMINI_API_KEY` is allowed only from local `.env` or shell/CI environment variables.
No-compat/no-alias hard rule: runtime reads canonical keys only; deprecated alias/fallback keys are not accepted.
Do not place real keys in source code, docs, fixtures, scripts, example env files, or committed `.env*.example` files.
Local override env files are out of the default governance path and must not be treated as standard runtime sources.

## Tiered Policy (Env Source + Usage)

1. Tier 1 (Required runtime minimum): `GEMINI_API_KEY`.
2. Tier 2 (Optional Runtime Knobs): runtime tuning values for models, retries, logs, cache, queue, and sidecar.
3. Tier 3 (Test/CI-only): pipeline/test controls that should be set only in CI job env or one-off shell commands.

## Script Load Matrix

The following behavior is the source of truth from `package.json`:

| Command | Env file behavior |
| --- | --- |
| `npm run dev` | loads `.env` |
| `npm start` | loads `.env` |
| `npm run ci:gate` | loads `.env` |
| `npm run test` | loads `.env` |
| `npm run test:coverage` | loads `.env` |
| `npm run test:acceptance:gate` | loads `.env` |
| `npm run py:health` | loads `.env`; `--smoke` first verifies outbound HTTPS reachability to `generativelanguage.googleapis.com` / `ai.google.dev`, then runs the sidecar smoke RPC |
| `npm run py:smoke` | loads `.env`; equivalent to `py:health -- --smoke`; failures return a structured probe result |

## Runtime Variables

| Variable | Required | Default | Validation |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Yes | empty | trimmed non-empty string |
| `GEMINI_MODEL` | No | `gemini-3.1-pro-preview` | trimmed non-empty string |
| `GEMINI_MODEL_FAST` | No | `gemini-3-flash-preview` | trimmed non-empty string |
| `GEMINI_MODEL_STRONG` | No | `gemini-3.1-pro-preview` | trimmed string; empty falls back to `GEMINI_MODEL` |
| `GEMINI_MODEL_EMBEDDING` | No | `gemini-embedding-001` | trimmed non-empty string |
| `GEMINI_DEFAULT_THINKING_LEVEL` | No | `high` | `low` or `high` |
| `GEMINI_DEFAULT_TEMPERATURE` | No | `1.0` | positive number |
| `NEXT_PUBLIC_SITE_URL` | No | empty | empty disables canonical-site SEO outputs; when set, must be an absolute `http` or `https` URL |
| `OPENUI_MODEL_ROUTING` | No | `on` | `on` or `off` |
| `OPENUI_MCP_WORKSPACE_ROOT` | No | current working directory | must resolve to an existing directory |
| `OPENUI_TIMEOUT_MS` | No | `45000` | positive number |
| `OPENUI_MAX_RETRIES` | No | `2` | non-negative integer |
| `OPENUI_RETRY_BASE_MS` | No | `450` | positive number |
| `OPENUI_MCP_LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |
| `OPENUI_MCP_LOG_OUTPUT` | No | `both` | `stderr` \| `file` \| `both` |
| `OPENUI_MCP_LOG_ROTATE_ON_START` | No | `on` | `on` or `off` |
| `OPENUI_MCP_CHILD_ENV_ALLOWLIST` | No | empty | comma-separated env keys (`^[A-Z_][A-Z0-9_]*$`) or prefix wildcard ending with `*` |

Additional note: standard proxy variables `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` (including lowercase variants) are already included in the child-process baseline allowlist, so the sidecar and child processes inherit them by default without needing `OPENUI_MCP_CHILD_ENV_ALLOWLIST`.

Gemini sidecar runtime note:

- `packages/shared-runtime/src/child-env.ts` forwards standard proxy variables to child processes and the Python sidecar by default.
- `tooling/python-sidecar-health.py --smoke` emits a structured JSON probe result plus proxy guidance before stopping when outbound network checks fail.
| `OPENUI_MCP_LOG_DIR` | No | `.runtime-cache/runs/<run_id>/logs/runtime.jsonl` | governed run-scoped path; no arbitrary override semantics |
| `OPENUI_MCP_LOG_RETENTION_DAYS` | No | `7` | positive integer |
| `OPENUI_MCP_LOG_MAX_FILE_MB` | No | `10` | positive number |
| `OPENUI_MCP_CACHE_DIR` | No | `.runtime-cache/cache` | non-empty path string |
| `OPENUI_MCP_CACHE_RETENTION_DAYS` | No | `7` | positive integer |
| `OPENUI_MCP_CACHE_MAX_BYTES` | No | `104857600` | positive integer |
| `OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES` | No | `60` | positive integer |
| `OPENUI_TOOL_CACHE_ROOT` | No | `~/.cache/openui-mcp-studio/tooling` | non-empty path string; per-workspace cache root is derived under this base root |
| `OPENUI_TOOL_CACHE_RETENTION_DAYS` | No | `3` | positive integer |
| `OPENUI_TOOL_CACHE_MAX_BYTES` | No | `5368709120` | positive integer |
| `OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES` | No | `60` | positive integer |
| `OPENUI_CHROME_USER_DATA_DIR` | No | empty | absolute path to an existing Chrome user data directory when real-profile mode is enabled |
| `OPENUI_CHROME_PROFILE_DIRECTORY` | No | empty | trimmed non-empty Chrome profile directory name when real-profile mode is enabled |
| `OPENUI_CHROME_CHANNEL` | No | `chrome` | trimmed non-empty string |
| `OPENUI_CHROME_EXECUTABLE_PATH` | No | empty | absolute executable path when overriding the default Chrome channel |
| `OPENUI_CHROME_CDP_PORT` | No | `9343` | positive integer |
| `OPENUI_QUEUE_CONCURRENCY` | No | `1` | positive integer |
| `OPENUI_QUEUE_MAX_PENDING` | No | `128` | positive integer; empty/invalid value falls back to default |
| `OPENUI_IDEMPOTENCY_TTL_MINUTES` | No | `1440` | positive integer |
| `OPENUI_GEMINI_PYTHON_BIN` | No | `python3` | trimmed non-empty string |
| `OPENUI_GEMINI_SIDECAR_PATH` | No | `services/gemini-sidecar/server.py` | executable python script path |
| `OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES` | No | `262144` | positive integer; empty/invalid value falls back to default |
| `OPENUI_HOSTED_API_HOST` | No | `127.0.0.1` | trimmed non-empty string |
| `OPENUI_HOSTED_API_PORT` | No | `7878` | positive integer |
| `OPENUI_HOSTED_API_BEARER_TOKEN` | No | empty | trimmed non-empty string when the hosted API runtime is started |
| `OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE` | No | `60` | positive integer |

## Non-contract Registry (Single Source of Truth)

The non-contract list is governed by `tooling/env-contract/deprecation-registry.json`.
`npm run env:governance:check` validates that this doc block stays in sync with the registry.

<!-- NON_CONTRACT_REGISTRY:START -->
`OPENUI_RUNTIME_RUN_ID`
<!-- NON_CONTRACT_REGISTRY:END -->

Additional governed keysets (same registry file):

- `ciOnlyKeys`: `CI`, `RUN_EXTERNAL_E2E`, `OPENUI_E2E_MAX_RETRIES`, `OPENUI_COVERAGE_SUMMARY_PATH`, `OPENUI_MUTATION_SUMMARY_PATH`, `OPENUI_MUTATION_MIN_SCORE`, `OPENUI_MUTATION_MIN_SAMPLES_PER_MODULE`, `OPENUI_MUTATION_MIN_SAMPLES_PER_OPERATOR`, `OPENUI_MUTATION_MIN_TOTAL`, `OPENUI_MUTATION_MIN_MODULE_KILL_RATIO`, `OPENUI_MUTATION_MIN_OPERATOR_KILL_RATIO`, `OPENUI_MUTATION_ENFORCE_MIN_SAMPLES`, `OPENUI_ALLOW_MUTATION_SKIP`, `OPENUI_MUTATION_HEARTBEAT_INTERVAL_MS`, `OPENUI_MUTATION_FORCE_KILL_GRACE_MS`, `CI_GATE_TIMEOUT_MS`, `CI_GATE_TASK_TIMEOUT_MS`, `CI_GATE_HEARTBEAT_INTERVAL_MS`, `CI_GATE_MAX_STDOUT_BYTES`, `CI_GATE_MAX_STDERR_BYTES`, `CI_GATE_SUMMARY_PATH`, `OPENUI_CI_GATE_RUN_KEY`, `FILE_GOVERNANCE_INCLUDE_ROOTS`, `FILE_GOVERNANCE_EXCLUDE_DIRS`.
- `testOnlyKeys`: `OPENUI_GEMINI_SIDECAR_HEALTH_TIMEOUT_MS`, `OPENUI_SMOKE_TARGET_ROOT`, `OPENUI_ENABLE_LIVE_GEMINI_SMOKE`, `OPENUI_LIVE_TEST_RUN_ID`, `LIVE_TEST_MAX_RETRIES`, `LIVE_TEST_HEARTBEAT_INTERVAL_MS`, `LIVE_TEST_RETRY_BASE_DELAY_MS`, `LIVE_TEST_RETRY_MAX_DELAY_MS`.
- `deprecatedKeys`: none (must stay empty). Any non-empty value is a hard-fail in `npm run env:check`; retired key history belongs outside the tracked minimal docs set.
- `LIVE_TEST_RETRY_BASE_DELAY_MS` / `LIVE_TEST_RETRY_MAX_DELAY_MS` are consumed by `tooling/run-live-tests.mjs` only (exponential backoff + jitter), not by runtime config in `services/mcp-server/src/constants.ts`.
- Permanent-ban scanning excludes governance implementation files (`tooling/verify-env-governance.mjs`, `tooling/env-governance/core.mjs`) to avoid self-referential false positives while keeping runtime/docs/tests enforcement strict.

`CI_GATE_SUMMARY_PATH` and CLI `--summary-file` are both restricted to `.runtime-cache/runs/<run_id>/summary.json` (must be workspace-relative, `.json` extension, and inside allowed root).

## Profile Templates

- `.env.example`: baseline default contract with metadata comments.
- Deprecated key plaintext must stay out of templates.
- `.env.development.example`: development-biased non-secret sample values.
- `.env.staging.example`: staging-biased non-secret sample values.
- `.env.production.example`: production-biased non-secret sample values.
- All templates are Gemini-only and must not contain real secrets.
- Profile examples are version-controlled by design (explicit `.gitignore` allowlist), and must stay non-secret.

## Cache Governance (Runtime + Cleanup)

- Default runtime cache directory: `.runtime-cache/cache` (`OPENUI_MCP_CACHE_DIR`).
- Runtime logs default to `.runtime-cache/runs/<run_id>/logs/runtime.jsonl`; tests/ci/upstream channels live under the same run-scoped `logs/` directory.
- `npm run clean:runtime` resets runtime logs by purging the run-scoped `.runtime-cache/runs` root from `contracts/runtime/path-registry.json`; it must not infer cleanup targets from `OPENUI_MCP_LOG_DIR`.
- Retention policy knobs: `OPENUI_MCP_CACHE_RETENTION_DAYS` + `OPENUI_MCP_CACHE_MAX_BYTES`.
- Repo-specific external tool-cache knobs:
  - `OPENUI_TOOL_CACHE_ROOT` (default `~/.cache/openui-mcp-studio/tooling`)
  - `OPENUI_TOOL_CACHE_RETENTION_DAYS` (default `3`)
  - `OPENUI_TOOL_CACHE_MAX_BYTES` (default `5368709120`)
  - `OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES` (default `60`)
- Full cleanup: `npm run repo:clean` (resets runtime log/cache/build roots and purges registered artifact/evidence directories declared in `contracts/runtime/path-registry.json`).
- Retention-only cleanup: `npm run clean:runtime -- --cache-retention-only` (only prunes expired or oversized cache files).
- Repo-local transient coordination locks must stay under `.runtime-cache/locks/`;
  they are governed as temporary run state instead of being treated as an
  unknown runtime subtree.
- Space-governance reporting is separate from cleanup:
  - `npm run repo:space:report` writes snapshots under `.runtime-cache/reports/space-governance/`
    and now splits output into repo-local managed surfaces, repo-specific external cache roots, persistent browser assets, and machine-wide shared layers
  - `npm run repo:space:check` is the front-door repo-local gate and enforces hard-fail pollution plus unknown heavy non-canonical runtime subtree rules from `contracts/runtime/space-governance.json`
  - `npm run repo:space:verify` reports contract verification candidates plus repo-local maintenance candidates, including age, active refs, cleanup class, and skip reason
    while keeping repo-specific external cache roots and the persistent browser lane in separate read-only blocks with janitor/exclusion readback
  - `npm run repo:space:maintain:dry-run` generates the current repo-local maintenance plan without deleting files
    and includes the projected repo-specific external cache janitor reclaim plan
  - `npm run repo:space:maintain` applies the explicit repo-local maintenance wave and writes `maintenance-latest.json` / `maintenance-latest.md` under `.runtime-cache/reports/space-governance/`
    plus the latest repo-specific external cache janitor receipt
  - `npm run repo:space:clean:dry-run` only enumerates repo-local allowlist targets and must not target shared layers
- Security and release evidence reporting is separate from runtime operation:
  - `npm run security:evidence:final` writes final repo-side evidence summaries under `.runtime-cache/reports/security/`
  - `npm run governance:remote:review` writes remote canonical review summaries under `.runtime-cache/reports/release-readiness/`
- Local container-parity helper state defaults to `.runtime-cache/ci-local-host/`
  so repo-owned full verification stays inside the registered runtime surface
  instead of leaving root-level marker directories behind.
- `ci-local-host` is now an explicit maintenance target instead of a
  report-only surface:
  - `.runtime-cache/ci-local-host/ms-playwright` -> disposable-generated
  - `.runtime-cache/ci-local-host/node_modules` -> disposable-generated
  - `.runtime-cache/ci-local-host/openui-home` -> disposable-generated
  - `.runtime-cache/ci-local-host/tmp` -> scratch
- The default maintenance TTL for `ci-local-host` is `3` days. Container
  parity runs now do two best-effort cleanup passes by default:
  - before runs, they TTL-prune aged `ci-local-host` subtrees such as
    `ms-playwright`, `node_modules`, `openui-home`, and `tmp`
  - after successful runs, they immediately reset the `tmp/` scratch subtree
- `repo:space:maintain` remains the canonical repo-local maintenance lane for
  explicit cleanup waves, drift reconciliation, and aged residue that helper
  TTL pruning did not remove.
- Space-governance hard rule: repo-local runtime truth remains `.runtime-cache/*`; shared layers such as Docker, `~/.npm`, `~/.cache/pre-commit`, and Playwright browser caches stay outside repo-local cleanup scope unless separately approved as machine-level maintenance.
- Tool cache hard rule: pre-commit and Go tooling caches must resolve outside the workspace; only canonical repo-local runtime evidence remains under `.runtime-cache/*`.
- Repo-local verification tmp roots that execute from `.runtime-cache/tmp/*` must reuse the external workspace-token tooling cache under `~/.cache/openui-mcp-studio/tooling/<workspaceToken>/` for Playwright browsers, managed install surfaces, npm cache, repo-owned pre-commit/Go homes, and light overlay state.
- Repo-specific external cache roots stay in the middle layer between repo-local runtime truth and machine-wide shared layers:
  - they are derived from `OPENUI_TOOL_CACHE_ROOT` plus the workspace token
  - they remain recognizable as repo-attributable cache roots
  - they are janitor-managed by default with TTL-first plus capacity-prune semantics
  - they must never include the real Chrome login profile; that profile is a local-only identity asset and stays outside cache cleanup
- The repo-owned real Chrome lane is a separate permanent layer:
  - recommended root: `~/.cache/openui-mcp-studio/browser/chrome-user-data`
  - recommended profile directory: `Profile 1`
  - fixed local CDP port: `9343`
  - the lane is single-instance by policy; tooling must attach to the same Chrome process instead of second-launching the same root
  - it is janitor-excluded by contract and never participates in `OPENUI_TOOL_CACHE_*` TTL/cap pruning

## Real Chrome Profile Contract

- Real local browser-driving flows use these env keys:
  - `OPENUI_CHROME_USER_DATA_DIR`
  - `OPENUI_CHROME_PROFILE_DIRECTORY`
  - `OPENUI_CHROME_CHANNEL` (default `chrome`)
  - optional `OPENUI_CHROME_EXECUTABLE_PATH`
  - `OPENUI_CHROME_CDP_PORT` (default `9343`)
- These env keys are for the local-only repo-owned single-instance real Chrome lane used by DOM inspection, Console inspection, network/API reverse engineering, and login-state-dependent browsing.
- Missing `OPENUI_CHROME_USER_DATA_DIR` or `OPENUI_CHROME_PROFILE_DIRECTORY` is a configuration blocker for real-profile flows; repo tooling must fail fast instead of silently falling back to Playwright Chromium.
- The canonical local lane is:
  - `OPENUI_CHROME_USER_DATA_DIR=~/.cache/openui-mcp-studio/browser/chrome-user-data`
  - `OPENUI_CHROME_PROFILE_DIRECTORY=Profile 1`
  - `OPENUI_CHROME_CDP_PORT=9343`
- Bootstrap uses the default Chrome root only as a one-time copy source. Ongoing runtime must not keep using `the user-profile Chrome root` as the live root for this repo.
- Hermetic CI and deterministic non-login browser lanes keep using ephemeral/containerized Playwright contexts.
- Login-state-dependent browser tests must stay disabled in cloud CI unless a future explicit CI design introduces a separate remote state package.

## Operational Examples

### Local development

1. Copy defaults: `cp .env.example .env`
2. Fill `GEMINI_API_KEY` in `.env`.
3. Optional but recommended for truthful canonical metadata: set `NEXT_PUBLIC_SITE_URL` to the real public URL when you are verifying crawl/share semantics instead of a local-only run.
4. Start server: `npm run dev`

### One-off CI override

```bash
GEMINI_MODEL=gemini-3.1-pro-preview npm run ci:gate
```

### Contract drift guard

Run this before commit when env docs/config changed:

```bash
npm run env:check
```

When Python sidecar dependencies change, run this additional lock-parity check:

```bash
node tooling/check-python-sidecar-lock.mjs
```

Run governance gate explicitly (CI-equivalent strict mode):

```bash
npm run env:governance:check -- --ci
```

If the gate fails, logs include a `remediation map (key -> action)` section to show exact key-level fix actions.

### Env inventory audit (read-only)

Use this read-only audit helper to print the current contract and runtime env inventory:

```bash
node tooling/env-inventory.mjs
```

Output sections:
- `contractVars`: env keys defined in `packages/contracts/src/env-contract.ts`
- `runtimeVars`: currently exported runtime keys (`OPENUI_*`, `GEMINI_*`)
- `nonContractVars`: runtime keys not in contract (for drift review)

### Env governance report

Generate a compact governance report (JSON + Markdown) by combining:

- `tooling/env-inventory.mjs` output
- `tooling/env-contract/deprecation-registry.json`

```bash
npm run -s env:governance:report
```

Default output paths:

- `.runtime-cache/env-governance/report.json`
- `.runtime-cache/env-governance/report.md`
- CI inventory snapshots also live under `.runtime-cache/env-governance/`
  so the runtime-governance gate does not flag them as an unregistered subtree.

GitHub Actions uploads both files as artifact `env-governance-<run_id>-<run_attempt>`.

### Secrets guard before commit

Pre-commit enforces:

1. Block staging `.env` / local override env files / other non-example `.env*` files.
2. Scan staged content for Gemini key fingerprints (`GEMINI_API_KEY`, `x-goog-api-key`, `AIza...`).
3. Run `tooling/secrets_scan.sh --staged`, and `gitleaks protect --staged` when `gitleaks` is installed.
4. If using local `pre-commit` hooks, rely on the repository secret-scan path (`gitleaks`, tracked-surface hygiene, and the OSS audit bundle) instead of a tracked baseline file.
5. Run `node tooling/check-iac-consistency.mjs` to ensure at least one executable IaC baseline remains valid.

## Change Policy

Gate criteria for env-related PRs:

1. `npm run env:check` passes.
2. `tests/runtime-config.test.ts` still passes.
3. `tests/env-governance.test.ts` still passes.
4. CI quality + secret scan jobs both pass.
