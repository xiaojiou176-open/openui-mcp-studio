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

## Recovery Validation

At minimum, rerun:

```bash
npm run lint
npm run typecheck
npm run test
npm run release:public-safe:check
```
