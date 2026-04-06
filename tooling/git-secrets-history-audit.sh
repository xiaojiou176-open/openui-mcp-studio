#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/git-secrets-history-audit.sh [--help]

Options:
  --help  Show this help.
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v git-secrets >/dev/null 2>&1; then
  echo "error: git-secrets is required for history audit" >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: git-secrets history audit must run inside a git worktree" >&2
  exit 2
fi

echo "git-secrets-history-audit: scanning full git history"
git-secrets --scan-history
echo "git-secrets-history-audit: OK (no findings)"
