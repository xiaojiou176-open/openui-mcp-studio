# Secrets Incident Runbook

Use this runbook when a secret or tracked personal contact field is discovered
in repository content, history, logs, or issue/PR text.

## Immediate Response

1. revoke or rotate exposed credentials first
2. stop public discussion of sensitive payloads
3. remove or contain the repository-side exposure
4. rerun the required verification commands

## Reporting Path

- Use GitHub private vulnerability reporting for security-sensitive disclosures.
- If that path is unavailable, use the fallback route described in `SECURITY.md`.
- Do not post exploit details, secrets, or private infrastructure data in public
  issues.

## Repository Commands

```bash
npm run security:history:audit
npm run security:trufflehog:audit
npm run security:git-secrets:history
npm run security:scancode:keyfiles
npm run security:pii:audit
npm run security:sensitive-surface:audit
npm run security:history:sensitive:audit
npm run security:github:public:audit
npm run security:oss:audit
npm run governance:history-hygiene:check
```

## Meaning Of Each Gate

- `security:history:audit`
  - raw gitleaks history report
- `governance:history-hygiene:check`
  - machine-readable classification of the current history report
  - refreshes the raw report first when the artifact is missing
- `security:pii:audit`
  - heuristic tracked-text scan for email addresses and phone-like contact
    fields
  - not a formal DLP or privacy review
- `security:sensitive-surface:audit`
  - heuristic tracked-text scan for personal contact fields and host-local
    absolute paths
  - tracked log files still belong to tracked-surface hygiene
- `security:history:sensitive:audit`
  - heuristic local heads/tags history scan for personal contact fields and
    host-local absolute paths
  - does not inspect GitHub-managed read-only refs such as `refs/pull/*`
- `security:github:public:audit`
  - read-only GitHub public-surface review across open secret-scanning alerts,
    open code-scanning alerts, code search, comment surfaces, and fetchable
    pull refs
  - if this gate fails only on `refs/pull/*`, GitHub Support is required for
    final cleanup

## If GitHub Still Shows Old Sensitive Data After A Rewrite

- First separate the surfaces:
  - local `main` / local tags
  - remote `main` / remote tags
  - GitHub-managed read-only refs such as `refs/pull/*`
  - code-search or cache lag
- If only `refs/pull/*` still contain the old data, normal `git push` and the
  Git refs delete API will not clear them.
- In that state, open a GitHub Support request and include:
  - repository name
  - proof that `main` is already sanitized
  - proof that the remaining residue is in read-only PR refs
  - the failed delete-ref response showing `refs/pull/* is read-only`
- If Support-side cleanup is not acceptable and you need immediate hard-cut
  removal, the only stronger operator move is deleting and recreating the
  repository from the sanitized history.

## Recovery Validation

At minimum, rerun:

```bash
npm run lint
npm run typecheck
npm run test
npm run release:public-safe:check
```
