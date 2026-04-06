#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/log_audit.sh [--path <dir>] [--help]

Checks:
  1) Lists .log files that are outside .runtime-cache/logs/
  2) Warns if .runtime-cache/ is not ignored in .gitignore
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

scan_path="."
path_from_cli=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --path)
      if [[ -z "${2:-}" ]]; then
        echo "error: --path requires a value" >&2
        exit 2
      fi
      scan_path="$2"
      path_from_cli=1
      shift 2
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$path_from_cli" -eq 1 ]] && [[ "$scan_path" == -* ]]; then
  echo "error: --path must not start with '-'" >&2
  exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "error: ripgrep (rg) is required" >&2
  exit 2
fi

echo "log_audit: scanning log placement in ${scan_path}"

misplaced_logs="$(
  rg --files -- "$scan_path" \
    | rg -- '\.log$' \
    | rg -v -- '(^|/)(\.runtime-cache/logs/)' \
    || true
)"
if [[ -n "$misplaced_logs" ]]; then
  echo "log_audit: misplaced log files detected:"
  printf '%s\n' "$misplaced_logs"
  exit 1
fi

if [[ ! -f .gitignore ]]; then
  echo "log_audit: warning: .gitignore not found"
  exit 1
fi

missing_rules=0
if ! rg -n -- '^\.runtime-cache/$' .gitignore >/dev/null; then
  echo "log_audit: missing ignore rule: .runtime-cache/"
  missing_rules=1
fi

if [[ "$missing_rules" -ne 0 ]]; then
  exit 1
fi

echo "log_audit: OK (log placement and ignore rules look good)"
