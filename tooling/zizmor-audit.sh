#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/zizmor-audit.sh [--report-path <path>] [--help]

Options:
  --report-path <path>  Plain-text report destination.
  --help                Show this help.
EOF
}

report_path=".runtime-cache/reports/security/zizmor-audit.txt"
ZIZMOR_VERSION="1.23.1"

resolve_external_tool_cache_root() {
  node --input-type=module -e '
    import { resolveDefaultExternalToolCacheRoot } from "./tooling/shared/tool-cache-env.mjs";
    console.log(resolveDefaultExternalToolCacheRoot(process.cwd()));
  '
}

ensure_zizmor() {
  local external_tool_cache_root
  local install_root
  local venv_dir
  local binary_path

  external_tool_cache_root="$(resolve_external_tool_cache_root)"
  install_root="$external_tool_cache_root/install/zizmor/$ZIZMOR_VERSION"
  venv_dir="$install_root/venv"
  binary_path="$venv_dir/bin/zizmor"

  if [[ -x "$binary_path" ]]; then
    printf '%s\n' "$binary_path"
    return 0
  fi

  mkdir -p "$install_root"
  python3 -m venv "$venv_dir"
  "$venv_dir/bin/python" -m pip install --quiet --upgrade pip
  "$venv_dir/bin/python" -m pip install --quiet "zizmor==$ZIZMOR_VERSION"

  printf '%s\n' "$binary_path"
}

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

mkdir -p "$(dirname "$report_path")"
zizmor_bin="$(ensure_zizmor)"

echo "zizmor-audit: scanning closeout-managed workflow surfaces and Dependabot config"
set +e
"$zizmor_bin" \
  .github/workflows/build-ci-image.yml \
  .github/workflows/security-supplemental.yml \
  .github/dependabot.yml \
  --offline \
  --min-severity high \
  --format plain | tee "$report_path"
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "zizmor-audit: findings detected (see $report_path)" >&2
  exit "$status"
fi

echo "zizmor-audit: OK"
