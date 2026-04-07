# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Rebuilt the public repository history into a modular six-commit mainline.
- Reduced the tracked documentation surface to the ultra-thin public set.
- Added repo-local tracked-surface, history-hygiene, OSS security, and heuristic
  PII audit entrypoints.
- Added `npm run demo:ship` as a reproducible front-door command for generating
  one real ship payload from a sample brief.
- Added public proof assets for the repository homepage, including a workbench
  screenshot, animated demo, workflow overview, and comparison visual.
- Added `docs/proof-and-faq.md` and `docs/release-template.md` to support
  first-time visitors and release-ready public storytelling.

### Changed
- Tightened the storefront and proof-doc split so README stays the storefront,
  `docs/proof-and-faq.md` stays the canonical proof ledger, and the first-minute
  route no longer overstates what one quick command proves.
- Added an explicit CI lane-truth table to `docs/testing.md` so deterministic,
  advisory, manual-live, and manual-maintenance paths are easier to explain.
- Fixed `prepare:next-app` / `smoke:e2e` readiness detection so hoisted workspace
  runtime packages do not trigger a false local install path.
- Forced the proof-path Next build to use `--webpack` so smoke validation does
  not depend on Turbopack native bindings being available on the host.
- Fixed the `apps/web` PostCSS bridge for Tailwind 4 by moving to
  `@tailwindcss/postcss`, so webpack smoke builds stop failing on the default
  proof target.
- Updated `demo:ship` to prefer the fast Gemini route when available and accept
  `--timeout-ms` so first-run demos are less likely to fail on slow live model
  responses.
- Re-aligned TypeScript to a `typescript-eslint`-compatible version so fresh
  `npm install` succeeds again.
- Renamed the remaining repository identity hotspots from
  `openui-mcp-ui-generator` to `openui-mcp-studio`.
- Replaced the previous remote history with a new canonical public `main`.
- Re-created the canonical GitHub repository under `xiaojiou176-open/openui-mcp-studio`.
- Re-enabled branch protection, secret scanning, push protection, and private
  vulnerability reporting on the rebuilt remote.
- Rebuilt `README.md` into a product-style public landing page with stronger
  CTA links, richer visualization, and clearer proof-driven onboarding.
- Updated the GitHub public surface with sharper description, topics,
  Discussions, homepage routing, and a user-facing release.

## [0.3.1] - 2026-03-24

### Added
- First public release tag for the rebuilt modular history.
