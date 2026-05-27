#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/scancode-keyfiles-audit.sh [--report-path <path>] [--help]

Options:
  --report-path <path>  JSON report destination.
  --help                Show this help.
EOF
}

report_path=".runtime-cache/reports/security/scancode-keyfiles.json"
scancode_processes="${SCANCODE_PROCESSES:-1}"
scancode_timeout="${SCANCODE_TIMEOUT_SECONDS:-5}"

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

scancode_cmd=()
if command -v scancode >/dev/null 2>&1; then
  scancode_cmd=(scancode)
elif command -v uvx >/dev/null 2>&1; then
  scancode_cmd=(uvx --from scancode-toolkit scancode)
else
  echo "error: scancode is required for keyfile audit (install scancode or uvx)" >&2
  exit 2
fi

inputs=(
  "LICENSE"
  "README.md"
  "SECURITY.md"
  "CONTRIBUTING.md"
  "CODE_OF_CONDUCT.md"
  "SUPPORT.md"
  "package.json"
  "apps/web/package.json"
  "packages/contracts/package.json"
  "packages/shared-runtime/package.json"
  "packages/runtime-observability/package.json"
  "services/mcp-server/package.json"
)

existing_inputs=()
for input_path in "${inputs[@]}"; do
  if [[ -f "$input_path" ]]; then
    existing_inputs+=("$input_path")
  fi
done

if [[ "${#existing_inputs[@]}" -eq 0 ]]; then
  echo "error: no ScanCode input files found" >&2
  exit 2
fi

mkdir -p "$(dirname "$report_path")"

echo "scancode-keyfiles-audit: scanning key legal and manifest surfaces"
"${scancode_cmd[@]}" \
  -l \
  -p \
  -c \
  -e \
  -u \
  --classify \
  --processes "$scancode_processes" \
  --summary \
  --timeout "$scancode_timeout" \
  --strip-root \
  --json-pp "$report_path" \
  "${existing_inputs[@]}"

echo "scancode-keyfiles-audit: OK (report written to $report_path)"
