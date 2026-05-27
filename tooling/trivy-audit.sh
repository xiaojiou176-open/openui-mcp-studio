#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/trivy-audit.sh [--report-path <path>] [--help]

Options:
  --report-path <path>  JSON report destination.
  --help                Show this help.
EOF
}

report_path=".runtime-cache/reports/security/trivy-fs.json"
TRIVY_VERSION="0.69.3"

compute_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return 0
  fi
  echo "error: sha256 tool is required to verify trivy archive" >&2
  exit 2
}

resolve_trivy_asset() {
  local os_name
  local arch_name
  os_name="$(uname -s)"
  arch_name="$(uname -m)"

  case "$os_name" in
    Linux) os_name="Linux" ;;
    Darwin) os_name="macOS" ;;
    *)
      echo "error: unsupported OS for trivy bootstrap: $os_name" >&2
      exit 2
      ;;
  esac

  case "$arch_name" in
    x86_64|amd64) arch_name="64bit" ;;
    arm64|aarch64) arch_name="ARM64" ;;
    *)
      echo "error: unsupported architecture for trivy bootstrap: $arch_name" >&2
      exit 2
      ;;
  esac

  printf 'trivy_%s_%s-%s.tar.gz' "$TRIVY_VERSION" "$os_name" "$arch_name"
}

resolve_external_tool_cache_root() {
  node --input-type=module -e '
    import { resolveDefaultExternalToolCacheRoot } from "./tooling/shared/tool-cache-env.mjs";
    console.log(resolveDefaultExternalToolCacheRoot(process.cwd()));
  '
}

ensure_trivy() {
  if command -v trivy >/dev/null 2>&1; then
    local system_trivy
    system_trivy="$(command -v trivy)"
    if "$system_trivy" --version 2>/dev/null | grep -q "Version: ${TRIVY_VERSION}"; then
      printf '%s\n' "$system_trivy"
      return 0
    fi
  fi

  local asset_name
  local external_tool_cache_root
  local install_root
  local binary_path
  local temp_root
  local archive_path
  local checksums_path
  local expected_sha
  local actual_sha

  asset_name="$(resolve_trivy_asset)"
  external_tool_cache_root="$(resolve_external_tool_cache_root)"
  install_root="$external_tool_cache_root/install/trivy/$TRIVY_VERSION"
  binary_path="$install_root/trivy"

  if [[ -x "$binary_path" ]]; then
    printf '%s\n' "$binary_path"
    return 0
  fi

  temp_root="$(mktemp -d)"
  archive_path="$temp_root/$asset_name"
  checksums_path="$temp_root/checksums.txt"

  echo "trivy-audit: bootstrapping trivy $TRIVY_VERSION" >&2
  curl -fsSL \
    "https://github.com/aquasecurity/trivy/releases/download/v$TRIVY_VERSION/$asset_name" \
    -o "$archive_path"
  curl -fsSL \
    "https://github.com/aquasecurity/trivy/releases/download/v$TRIVY_VERSION/trivy_${TRIVY_VERSION}_checksums.txt" \
    -o "$checksums_path"

  expected_sha="$(awk -v asset="$asset_name" '$2 == asset { print $1; exit }' "$checksums_path")"
  if [[ -z "$expected_sha" ]]; then
    echo "error: could not find checksum for $asset_name" >&2
    rm -rf "$temp_root"
    exit 2
  fi

  actual_sha="$(compute_sha256 "$archive_path")"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "error: trivy checksum mismatch for $asset_name" >&2
    rm -rf "$temp_root"
    exit 2
  fi

  mkdir -p "$install_root"
  tar -xzf "$archive_path" -C "$install_root" trivy
  chmod 0755 "$binary_path"
  rm -rf "$temp_root"

  printf '%s\n' "$binary_path"
}

stage_tracked_surface() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$target_dir"
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
trivy_bin="$(ensure_trivy)"
external_tool_cache_root="$(resolve_external_tool_cache_root)"
trivy_cache_dir="$external_tool_cache_root/trivy/cache"
scan_root="$(mktemp -d)"
trap 'rm -rf "$scan_root"' EXIT

stage_tracked_surface "$scan_root"

echo "trivy-audit: scanning tracked repository surface"
"$trivy_bin" fs \
  --cache-dir "$trivy_cache_dir" \
  --quiet \
  --scanners vuln \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --format json \
  --output "$report_path" \
  --exit-code 1 \
  "$scan_root"

echo "trivy-audit: OK"
