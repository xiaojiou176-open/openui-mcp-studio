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
  5. heuristic PII scan for tracked text files
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
node tooling/pii-audit.mjs

echo "oss-security-audit: OK"
