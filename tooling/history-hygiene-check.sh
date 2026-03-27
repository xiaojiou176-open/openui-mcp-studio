#!/usr/bin/env bash
set -euo pipefail

report_path=".runtime-cache/reports/history-audit/gitleaks-history.json"

if [[ ! -f "$report_path" ]]; then
  echo "history-hygiene-check: history report missing; running fresh history audit"
  bash tooling/history-secrets-audit.sh --report-path "$report_path"
fi

node tooling/check-history-hygiene.mjs
