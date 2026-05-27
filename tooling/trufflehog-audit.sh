#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/trufflehog-audit.sh [--report-path <path>] [--exclude-paths <path>] [--help]

Options:
  --report-path <path>    JSON report destination.
  --exclude-paths <path>  Newline-delimited regex file for excluded paths.
  --help                  Show this help.
EOF
}

report_path=".runtime-cache/reports/security/trufflehog-filesystem.json"
exclude_path="tooling/trufflehog-exclude.txt"

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
    --exclude-paths)
      if [[ -z "${2:-}" ]]; then
        echo "error: --exclude-paths requires a value" >&2
        exit 2
      fi
      exclude_path="$2"
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

if ! command -v trufflehog >/dev/null 2>&1; then
  echo "error: trufflehog is required for filesystem audit" >&2
  exit 2
fi

if [[ ! -f "$exclude_path" ]]; then
  echo "error: exclude-paths file not found: $exclude_path" >&2
  exit 2
fi

mkdir -p "$(dirname "$report_path")"

echo "trufflehog-audit: scanning repository surface with verification"
set +e
trufflehog filesystem \
  --exclude-paths="$exclude_path" \
  --json \
  --fail \
  . >"$report_path"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  echo "trufflehog-audit: OK (no findings)"
  exit 0
fi

if [[ "$status" -eq 183 ]]; then
  echo "trufflehog-audit: findings detected (see $report_path)" >&2
  exit 1
fi

echo "trufflehog-audit: tool failed with exit code $status" >&2
exit "$status"
