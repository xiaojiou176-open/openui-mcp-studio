import process from "node:process";

const DEFAULT_E2E_RETRIES = 2;
const MAX_E2E_RETRIES = 2;
// Browser matrix artifacts live under:
// - .runtime-cache/runs/<run_id>/artifacts/playwright-firefox
// - .runtime-cache/runs/<run_id>/artifacts/playwright-webkit
// - .runtime-cache/runs/<run_id>/artifacts/visual

function parseE2ERetriesFromEnv() {
	const raw = process.env.OPENUI_E2E_MAX_RETRIES?.trim();
	if (!raw) {
		return DEFAULT_E2E_RETRIES;
	}
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) {
		return DEFAULT_E2E_RETRIES;
	}
	return Math.min(MAX_E2E_RETRIES, parsed);
}

const EXTERNAL_READONLY_GATE_ENFORCED_COMMAND =
	"node tooling/run-external-readonly-gate.mjs --enforce";
const EXTERNAL_READONLY_ENFORCED_BY_DEFAULT = false;

function resolvePlaywrightArtifactRoot() {
	return `.runtime-cache/runs/${
		process.env.OPENUI_CI_GATE_RUN_KEY?.trim() || "ci-gate-missing-run-id"
	}/artifacts`;
}

function buildChromiumCommand() {
	return `npx playwright test --project=chromium --retries=${parseE2ERetriesFromEnv()} --fail-on-flaky-tests`;
}

function buildFirefoxCommand() {
	return `npx playwright test --project=firefox --retries=${parseE2ERetriesFromEnv()} --fail-on-flaky-tests --output=${resolvePlaywrightArtifactRoot()}/playwright-firefox`;
}

function buildWebkitCommand() {
	return `npx playwright test --project=webkit --retries=${parseE2ERetriesFromEnv()} --fail-on-flaky-tests --output=${resolvePlaywrightArtifactRoot()}/playwright-webkit`;
}

function buildDefaultStages(options = {}) {
	const shouldEnforceExternalReadonly =
		typeof options.enforceExternalReadonly === "boolean"
			? options.enforceExternalReadonly
				: EXTERNAL_READONLY_ENFORCED_BY_DEFAULT;
		const stage3Tasks = [
			Object.freeze({
				id: "testE2EFirefox",
				category: "test",
				command: buildFirefoxCommand(),
			hint: "Check Playwright Firefox failures and inspect trace/video/screenshot artifacts. Runs in parallel with WebKit using isolated output directories.",
		}),
			Object.freeze({
				id: "testE2EWebkit",
				category: "test",
				command: buildWebkitCommand(),
			hint: "Check Playwright WebKit failures and inspect trace/video/screenshot artifacts. Runs in parallel with Firefox using isolated output directories.",
		}),
	];
	if (shouldEnforceExternalReadonly) {
		stage3Tasks.unshift(
				Object.freeze({
					id: "externalReadonlyE2E",
					category: "upstream",
					command: EXTERNAL_READONLY_GATE_ENFORCED_COMMAND,
				hint: "External readonly E2E is opt-in only. Use the explicit ci:gate flag or dedicated nightly/report-only workflow when you intentionally want third-party network checks.",
			}),
		);
	}
		return Object.freeze([
			Object.freeze({
				id: "stage0",
			name: "Security Audit",
			mode: "sequential",
			tasks: Object.freeze([
					Object.freeze({
						id: "audit",
						category: "infra",
						command: "npm run audit",
					hint: "Resolve vulnerable dependencies and re-run npm run audit.",
				}),
				]),
			}),
			Object.freeze({
				id: "repoGovernanceHardGate",
				name: "Repo Governance Hard Gate",
				mode: "parallel",
				tasks: Object.freeze([
						Object.freeze({
							id: "governanceRoot",
							category: "infra",
							command: "npm run -s governance:root:check",
						hint: "Fix root allowlist drift before continuing.",
					}),
						Object.freeze({
							id: "governanceDeps",
							category: "infra",
							command: "npm run -s governance:deps:check",
						hint: "Fix dependency-boundary drift before continuing.",
					}),
						Object.freeze({
							id: "governanceRuntime",
							category: "infra",
							command: "npm run -s governance:runtime:check",
							hint: "Align runtime path registry, cleanup rules, and artifact roots with the single .runtime-cache truth surface.",
						}),
						Object.freeze({
							id: "governanceLogSchema",
							category: "infra",
							command: "npm run -s governance:log-schema:check",
						hint: "Fix structured logging schema drift before continuing.",
					}),
						Object.freeze({
							id: "governanceNoWildLog",
							category: "infra",
							command: "npm run -s governance:no-wild-log:check",
						hint: "Fix wild log path leakage before continuing.",
					}),
						Object.freeze({
							id: "governanceUpstream",
							category: "upstream",
							command: "npm run -s governance:upstream:check",
						hint: "Fix upstream inventory or compatibility drift before continuing.",
					}),
						Object.freeze({
							id: "iacConsistency",
							category: "infra",
							command: "npm run iac:check",
						hint: "Fix IaC baseline drift (.devcontainer/docker-compose/nix) and re-run npm run iac:check.",
					}),
				]),
			}),
			Object.freeze({
				id: "stage1",
				name: "Fast Quality Gates",
			mode: "parallel",
			tasks: Object.freeze([
					Object.freeze({
						id: "lint",
						category: "infra",
						command: "npm run lint -- --max-warnings=0",
					hint: "Fix lint violations (try npm run lint:fix first if safe).",
				}),
					Object.freeze({
						id: "envContract",
						category: "infra",
						command: "npm run env:check",
					hint: "Align packages/contracts/src/env-contract.ts, .env.example, and README env section before retrying.",
				}),
					Object.freeze({
						id: "envGovernance",
						category: "infra",
						command: "npm run env:governance:check",
					hint: "Register runtime env keys in contract/non-contract governance registry and keep deprecation metadata complete.",
				}),
						Object.freeze({
							id: "governanceContract",
							category: "infra",
							command: "npm run governance:contract:check",
						hint: "Fix governance contract version/file/script drift before continuing.",
					}),
						Object.freeze({
							id: "resourceLeakAudit",
							category: "test",
							command: "node tooling/check-resource-leaks.mjs --ci",
					hint: "Fix async teardown anti-patterns in tests (afterEach/afterAll cleanup must await or return cleanup promises).",
				}),
					Object.freeze({
						id: "typecheck",
						category: "infra",
						command: "npm run typecheck",
					hint: "Fix TypeScript type errors before proceeding.",
				}),
					Object.freeze({
						id: "testFastGate",
						category: "test",
						command: "npm run -s test:fast:gate",
					hint: "Fast unit/integration/acceptance gate failed. Fix deterministic test failures before deep checks.",
				}),
						Object.freeze({
							id: "uiuxReviewContract",
							category: "test",
							command: "npm run -s uiux:audit:strict:gate",
							advisory: true,
						hint: "UIUX strict gate is advisory in ci:gate because Gemini-backed review output can drift. Investigate semantic/a11y issues, but keep deterministic checks as the blocking path.",
					}),
			]),
		}),
		Object.freeze({
			id: "stage1b",
			name: "Deep Quality Gates",
			mode: "sequential",
			tasks: Object.freeze([
					Object.freeze({
						id: "test",
						category: "test",
						command: "node tooling/run-test-coverage-once.mjs --mode=required",
					hint: "Fix failing unit/integration tests before proceeding.",
				}),
					Object.freeze({
						id: "testCoverageAdvisory",
						category: "test",
						command: "node tooling/run-test-coverage-once.mjs --mode=advisory",
					advisory: true,
					hint: "Coverage check is advisory in ci:gate (non-blocking). Investigate regressions, but coverage hard-gate decisions come from coreCoverageGate.",
				}),
					Object.freeze({
						id: "coreCoverageGate",
						category: "test",
						command:
						"node tooling/check-core-coverage.mjs --wait-for-fresh-ms=120000",
					hint: "Core coverage hard gate failed. Ensure packages/shared-runtime/src/** and services/mcp-server/src/tools/** meet minimum thresholds.",
				}),
					Object.freeze({
						id: "build",
						category: "infra",
						command: "npm run build",
					hint: "Fix build-time errors and verify production output.",
				}),
			]),
		}),
		Object.freeze({
			id: "stage2",
			name: "App Prepare + Fast Runtime Gates",
			mode: "sequential",
			tasks: Object.freeze([
					Object.freeze({
						id: "appPrepare",
						category: "infra",
						command: "npm run prepare:next-app",
					resourceLocks: Object.freeze(["next-app-build"]),
					hint: "Prepare the default Next app runtime (apps/web) and build output before browser/runtime checks.",
				}),
					Object.freeze({
						id: "smokeE2E",
						category: "test",
						command: "npm run smoke:e2e",
					resourceLocks: Object.freeze(["next-app-build"]),
					hint: "Check smoke:e2e failures and validate the critical user journey on apps/web.",
				}),
					Object.freeze({
						id: "testE2EResilience",
						category: "test",
						command: "npm run test:e2e:resilience",
					resourceLocks: Object.freeze(["next-app-build"]),
					hint: "Check resilience flow failures and validate offline->recovery path stays deterministic against the default app runtime.",
				}),
					Object.freeze({
						id: "testE2E",
						category: "test",
						command: buildChromiumCommand(),
					resourceLocks: Object.freeze(["next-app-build"]),
					hint: "Check Playwright Chromium failures and inspect trace/video/screenshot artifacts. This long browser run stays after smoke/resilience fast runtime checks.",
				}),
			]),
		}),
			Object.freeze({
				id: "stage3",
				name: "Long Browser Matrix",
				mode: "parallel",
				tasks: Object.freeze(stage3Tasks),
			}),
		Object.freeze({
			id: "stage4",
			name: "Visual QA",
			mode: "sequential",
			tasks: Object.freeze([
					Object.freeze({
						id: "visualQa",
						category: "test",
						command: "npm run visual:qa",
					advisory: true,
					resourceLocks: Object.freeze(["next-app-build"]),
					hint: "Inspect visual diff artifacts under .runtime-cache/runs/<run_id>/artifacts/visual and update golden only when intended. CI runner-image rendering drift can surface here; review before promoting any baseline update.",
				}),
			]),
		}),
	]);
}

const DEFAULT_STAGES = buildDefaultStages({
	enforceExternalReadonly: EXTERNAL_READONLY_ENFORCED_BY_DEFAULT,
});
const VALID_STAGE_MODES = new Set(["parallel", "sequential"]);

export {
	buildDefaultStages,
	EXTERNAL_READONLY_ENFORCED_BY_DEFAULT,
	DEFAULT_STAGES,
	VALID_STAGE_MODES,
};
