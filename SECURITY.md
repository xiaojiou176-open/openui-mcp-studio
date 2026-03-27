# Security Policy

## Supported Scope

This repository is a local `stdio` MCP server and governance workspace for:

- Gemini-only model execution
- Next.js App Router + React + Tailwind + shadcn output flows
- repository-local quality gates, runtime governance, and CI container orchestration

Security reports are most useful when they include a clear reproduction path,
the affected files or commands, and the expected impact.

## Reporting a Vulnerability

This repository is currently **public**.
GitHub private vulnerability reporting is enabled for this
repository, and this repository does **not** currently provide a separate
security mailbox or external intake form.

Current reporting path:

1. Use GitHub private vulnerability reporting for this repository.
2. If GitHub private reporting is temporarily unavailable to you, use the
   repository owner contact surface designated in `CODEOWNERS` to request a
   maintainer-confirmed private conversation.
3. If you already have repository access, keep the first report to the minimum
   details needed to establish the correct maintainer route.
4. If you do **not** already have repository access, use the owner or
   organization contact surface first. Do not assume the repository issue
   tracker is an appropriate intake path for external security reports.
5. Do **not** include exploit details, secrets, private infrastructure data, or
   proof-of-concept payloads until a maintainer confirms the correct private
   route for the full report.

If you cannot establish a non-public channel, wait before disclosing exploit
details publicly. Public reports should be limited to non-sensitive hardening
ideas, configuration questions, or already remediated issues.

## What to Include

Please include:

- affected version, branch, or commit
- impacted command, workflow, or file path
- reproduction steps
- expected vs actual behavior
- security impact assessment
- whether secrets, credentials, or private infrastructure details are involved

## Scope Exclusions

This policy does not cover:

- feature requests
- documentation typos without security impact
- upstream vulnerabilities that are already tracked by the upstream project and
  are not caused by this repository's integration layer

## Response Expectations

This repository is maintained on a best-effort basis. Acknowledgment and fix
timelines are not guaranteed.

## Public-Readiness Boundary

Repository-local secret scanning is not enough to claim that public release is
safe.

Before any future visibility change or public-release claim, maintainers should
also run a full-history audit and review the findings:

```bash
npm run security:history:audit
npm run governance:history-hygiene:check
npm run security:oss:audit
npm run release:public-safe:check
```

Important boundary:

- a passing current-tree scan does not prove historical Git data is clean
- a failing history audit must be treated as a release blocker until maintainers
  classify or remediate the findings
- `governance:history-hygiene:check` proves the current history report is
  classified; it does not prove provider-side revocation or rewritten history
- public repository visibility does not waive this requirement
- `security:oss:audit` adds repo-local TruffleHog, git-secrets, and ScanCode keyfile coverage on top of the history audit
- `security:pii:audit` is a separate heuristic tracked-content sweep for email addresses and phone-like contact data; it complements secret scanning but does not replace legal/privacy review
