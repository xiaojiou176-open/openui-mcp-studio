#!/usr/bin/env bash
set -euo pipefail

report_path=".runtime-cache/reports/history-audit/gitleaks-history.json"

if [[ ! -f "$report_path" ]]; then
  echo "history-hygiene-check: history report missing; running fresh history audit"
  if ! bash tooling/history-secrets-audit.sh --report-path "$report_path"; then
    if [[ ! -f "$report_path" ]]; then
      echo "history-hygiene-check: history audit failed before producing a report" >&2
      exit 1
    fi
    echo "history-hygiene-check: history audit reported findings; continuing with contract classification" >&2
  fi
fi

node tooling/check-history-hygiene.mjs
