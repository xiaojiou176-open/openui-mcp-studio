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
GITLEAKS_VERSION="8.24.2"

compute_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return 0
  fi
  echo "error: sha256 tool is required to verify gitleaks archive" >&2
  exit 2
}

resolve_gitleaks_asset() {
  local os_name
  local arch_name
  os_name="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch_name="$(uname -m)"

  case "$os_name" in
    linux) os_name="linux" ;;
    darwin) os_name="darwin" ;;
    *)
      echo "error: unsupported OS for gitleaks bootstrap: $os_name" >&2
      exit 2
      ;;
  esac

  case "$arch_name" in
    x86_64|amd64) arch_name="x64" ;;
    arm64|aarch64) arch_name="arm64" ;;
    *)
      echo "error: unsupported architecture for gitleaks bootstrap: $arch_name" >&2
      exit 2
      ;;
  esac

  printf 'gitleaks_%s_%s_%s.tar.gz' "$GITLEAKS_VERSION" "$os_name" "$arch_name"
}

ensure_gitleaks() {
  if command -v gitleaks >/dev/null 2>&1; then
    local system_gitleaks
    local system_version
    system_gitleaks="$(command -v gitleaks)"
    system_version="$("$system_gitleaks" version 2>/dev/null | awk 'NR==1 {print $NF}')"
    if [[ "$system_version" == "$GITLEAKS_VERSION" ]]; then
      printf '%s\n' "$system_gitleaks"
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
  local checksum_urls

  asset_name="$(resolve_gitleaks_asset)"
  external_tool_cache_root="$(
    node --input-type=module -e '
      import { resolveDefaultExternalToolCacheRoot } from "./tooling/shared/tool-cache-env.mjs";
      console.log(resolveDefaultExternalToolCacheRoot(process.cwd()));
    '
  )"
  install_root="$external_tool_cache_root/install/gitleaks/$GITLEAKS_VERSION"
  binary_path="$install_root/gitleaks"

  if [[ -x "$binary_path" ]]; then
    printf '%s\n' "$binary_path"
    return 0
  fi

  temp_root="$(mktemp -d)"
  archive_path="$temp_root/$asset_name"
  checksums_path="$temp_root/checksums.txt"
  checksum_urls=(
    "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/gitleaks_${GITLEAKS_VERSION}_checksums.txt"
    "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/checksums.txt"
  )

  echo "history-secrets-audit: bootstrapping gitleaks $GITLEAKS_VERSION" >&2
  curl -fsSL \
    "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/$asset_name" \
    -o "$archive_path"
  for checksum_url in "${checksum_urls[@]}"; do
    if curl -fsSL "$checksum_url" -o "$checksums_path"; then
      break
    fi
  done

  if [[ ! -f "$checksums_path" ]]; then
    echo "error: could not download checksum file for gitleaks $GITLEAKS_VERSION" >&2
    rm -rf "$temp_root"
    exit 2
  fi

  expected_sha="$(awk -v asset="$asset_name" '$2 == asset { print $1; exit }' "$checksums_path")"
  if [[ -z "$expected_sha" ]]; then
    echo "error: could not find checksum for $asset_name" >&2
    rm -rf "$temp_root"
    exit 2
  fi

  actual_sha="$(compute_sha256 "$archive_path")"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "error: gitleaks checksum mismatch for $asset_name" >&2
    rm -rf "$temp_root"
    exit 2
  fi

  mkdir -p "$install_root"
  tar -xzf "$archive_path" -C "$install_root" gitleaks
  chmod 0755 "$binary_path"
  rm -rf "$temp_root"

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

gitleaks_bin="$(ensure_gitleaks)"

mkdir -p "$(dirname "$report_path")"

echo "history-secrets-audit: scanning full git history"
"$gitleaks_bin" detect \
  --source . \
  --config .gitleaks.toml \
  --redact \
  --report-format json \
  --report-path "$report_path" \
  --log-opts="--all"

echo "history-secrets-audit: OK (no historical leaks found)"
