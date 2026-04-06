#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  tooling/secrets_scan.sh [--staged] [--path <dir>] [--help]

Options:
  --staged      Scan only staged files.
  --path <dir>  Scan files under a specific directory.
  --help        Show this help.
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

scan_mode="workspace"
scan_path="."
path_from_cli=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      scan_mode="staged"
      shift
      ;;
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

has_rg=0
if command -v rg >/dev/null 2>&1; then
  has_rg=1
fi

if [[ "$scan_mode" == "staged" ]] && ! command -v git >/dev/null 2>&1; then
  echo "error: git is required for --staged scans" >&2
  exit 2
fi

if [[ "$scan_mode" == "staged" ]] && ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: --staged scans must run inside a git worktree" >&2
  exit 2
fi

secret_pattern='(AIza[0-9A-Za-z_-]{35}|sk-proj-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{36}|xox[bpoa]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)'

tmp_list="$(mktemp)"
cleanup() {
  rm -f "$tmp_list"
}
trap cleanup EXIT
staged_files=()

if [[ "$scan_mode" == "staged" ]]; then
  while IFS= read -r -d '' file; do
    staged_files+=("$file")
  done < <(git diff --cached --name-only --diff-filter=ACMR -z)
else
  if [[ "$has_rg" -eq 1 ]]; then
    rg --files --hidden \
      -g '!.git' \
      -g '!node_modules' \
      -g '!.next' \
      -g '!dist' \
      -g '!build' \
      -- "$scan_path" >"$tmp_list"
  else
    find -- "$scan_path" \
      -type d \( -name .git -o -name node_modules -o -name .next -o -name dist -o -name build \) -prune \
      -o -type f -print >"$tmp_list"
  fi
  if [[ ! -s "$tmp_list" ]]; then
    echo "secrets_scan: no files to scan"
    exit 0
  fi
fi

if [[ "$scan_mode" == "staged" ]]; then
  if [[ "${#staged_files[@]}" -eq 0 ]]; then
    echo "secrets_scan: no files to scan"
    exit 0
  fi
  echo "secrets_scan: scanning ${#staged_files[@]} files (${scan_mode})"
else
  echo "secrets_scan: scanning $(wc -l <"$tmp_list" | tr -d ' ') files (${scan_mode})"
fi

search_text() {
  if [[ "$has_rg" -eq 1 ]]; then
    if [[ $# -gt 0 ]]; then
      rg -n --no-heading -e "$secret_pattern" -- "$@"
    else
      rg -n --no-heading -e "$secret_pattern"
    fi
  else
    if [[ $# -gt 0 ]]; then
      grep -nE "$secret_pattern" -- "$@"
    else
      grep -nE "$secret_pattern"
    fi
  fi
}

mask_secrets_in_line() {
  printf '%s' "$1" | sed -E "s/${secret_pattern}/[REDACTED]/g"
}

found=0
if [[ "$scan_mode" == "staged" ]]; then
  for file in "${staged_files[@]}"; do
    if ! git cat-file -e ":$file" 2>/dev/null; then
      continue
    fi
    matches="$(
      {
        git show ":$file" 2>/dev/null ||
        git cat-file -p ":$file" 2>/dev/null ||
        true
      } | LC_ALL=C tr -d '\000' | search_text || true
    )"
    if [[ -n "$matches" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] || continue
        printf '%s:%s\n' "$file" "$(mask_secrets_in_line "$line")"
      done <<<"$matches"
      found=1
    fi
  done
else
  while IFS= read -r file; do
    [[ -f "$file" ]] || continue
    matches="$(search_text "$file" || true)"
    if [[ -n "$matches" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] || continue
        mask_secrets_in_line "$line"
      done <<<"$matches"
      found=1
    fi
  done <"$tmp_list"
fi

if [[ "$found" -ne 0 ]]; then
  echo "secrets_scan: potential secrets found" >&2
  exit 1
fi

echo "secrets_scan: OK (no known secret patterns detected)"
