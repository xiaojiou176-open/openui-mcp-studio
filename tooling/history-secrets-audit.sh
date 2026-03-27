#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/history-secrets-audit.sh [--report-path <path>] [--help]

Options:
  --report-path <path>  JSON report destination.
  --help                Show this help.
EOF
}

report_path=".runtime-cache/reports/history-audit/gitleaks-history.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-path)
      if [[ -z "${2:-}" ]]; then
        echo "error: --report-path requires a value" >&2
        exit 2
      fi
      report_path="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "error: gitleaks is required for history audit" >&2
  exit 2
fi

mkdir -p "$(dirname "$report_path")"

echo "history-secrets-audit: scanning full git history"
gitleaks detect \
  --source . \
  --config .gitleaks.toml \
  --redact \
  --report-format json \
  --report-path "$report_path" \
  --log-opts="--all"

echo "history-secrets-audit: OK (no historical leaks found)"
