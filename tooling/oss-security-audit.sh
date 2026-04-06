#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/oss-security-audit.sh [--help]

Runs the repository-local open-source security audit bundle:
  1. Gitleaks full-history audit
  2. TruffleHog filesystem audit
  3. git-secrets history audit
  4. ScanCode keyfile/license audit
  5. dependency-review local preflight + workflow wiring audit
  6. zizmor workflow audit
  7. Trivy filesystem audit
  8. heuristic current-tree sensitive-surface audit for tracked text files
  9. heuristic current-tree PII scan for tracked text files
 10. heuristic local heads/tags history sensitive-surface audit
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

bash tooling/history-secrets-audit.sh
bash tooling/trufflehog-audit.sh
bash tooling/git-secrets-history-audit.sh
bash tooling/scancode-keyfiles-audit.sh
node tooling/dependency-review-local.mjs
node tooling/check-supplemental-security-wiring.mjs
bash tooling/zizmor-audit.sh
bash tooling/trivy-audit.sh
node tooling/sensitive-surface-audit.mjs
node tooling/pii-audit.mjs
node tooling/history-sensitive-surface-audit.mjs

echo "oss-security-audit: OK"
