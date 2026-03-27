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
| `npm run repo:doctor` | current repository health across identity, language, tracked-surface hygiene, runtime, evidence, upstream, and release-readiness inputs | not a replacement for the full CI gate |
| `npm run repo:verify:fast` | fast structural truth for identity, English-only tracked docs, tracked-surface hygiene, runtime, evidence, and docs alignment | not a replacement for authoritative container parity |
| `npm run repo:verify:full` | local authoritative container-parity path | not proof of trusted remote CI supply-chain closure by itself |
| `npm run repo:upstream:check` | upstream inventory, compatibility, patch governance, and post-fetch history hygiene | not approval for whole-repo merge or rebase |
| `npm run release:public-safe:check` | strict repository-side public-safe verdict across release evidence, remote governance, and history hygiene | does not rotate credentials or rewrite Git history |

## Security Entrypoints

| Command | What it proves | What it does not prove |
| --- | --- | --- |
| `npm run security:history:audit` | full Git-history gitleaks sweep | not proof that provider-side secrets were rotated |
| `npm run security:trufflehog:audit` | repository-surface secret scan with verification | not classification of historical findings |
| `npm run security:git-secrets:history` | alternate history secret scan | not a replacement for gitleaks history audit |
| `npm run security:scancode:keyfiles` | package, license, email, and URL scan across legal and manifest keyfiles | not a full legal review |
| `npm run security:pii:audit` | heuristic tracked-text scan for email addresses and phone-like contact fields | not a formal DLP or privacy review |
| `npm run security:oss:audit` | repo-local security bundle across all of the commands above | not automatic remediation |

## Docs Truth Rules

- `docs/index.md` is the docs routing layer.
- The minimal docs profile keeps only the essential tracked guides.
- No tracked generated markdown docs are required in this profile.
- `docs:check` must stay green after docs are reduced.

## CI And Execution Truth

- Mainline CI uses host orchestration plus container execution for the main
  quality gate.
- External readonly validation remains report-only and stays separate from the
  default blocking path.
- Long-running tasks must keep heartbeat output and preserve run-scoped evidence.

## Tracked-Surface Rules

- `.agents/`, `.agent/`, `.codex/`, `.claude/`, `.runtime-cache/`, `logs/`, and
  tracked log outputs must never be committed.
- `AGENTS.md` and `CLAUDE.md` remain tracked on purpose.
- The repository enforces tracked-surface hygiene through a dedicated governance
  check, not just through `.gitignore`.

## Docs And Code Co-Change

When these change, update docs in the same wave:

1. package scripts or front-door commands
2. test and gate meanings
3. runtime/env behavior
4. upstream maintenance workflow
5. security reporting or public-safe release rules
