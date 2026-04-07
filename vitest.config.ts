import path from "node:path";
import { defineConfig } from "vitest/config";

const isBatchCoverageRun = /^(1|true|yes|on)$/i.test(
	process.env.OPENUI_BATCH_COVERAGE ?? "",
);

export const VITEST_COVERAGE_THRESHOLDS = {
	statements: 95,
	functions: 95,
	lines: 95,
	branches: 95,
	"packages/shared-runtime/src/child-env.ts": {
		statements: 95,
		functions: 95,
		lines: 95,
		branches: 95,
	},
	"packages/shared-runtime/src/job-queue.ts": {
		statements: 95,
		functions: 95,
		lines: 95,
		branches: 95,
	},
	"packages/shared-runtime/src/path-utils.ts": {
		statements: 95,
		functions: 95,
		lines: 95,
		branches: 95,
	},
	"services/mcp-server/src/tools/generate.ts": {
		statements: 95,
		functions: 95,
		lines: 95,
		branches: 95,
	},
	"services/mcp-server/src/tools/refine.ts": {
		statements: 95,
		functions: 95,
		lines: 95,
		branches: 95,
	},
} as const;

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(process.cwd(), "apps/web"),
		},
	},
	test: {
		include: [
			"tests/**/*.test.ts",
			"services/mcp-server/src/**/*.test.ts",
			"packages/**/*.test.ts",
		],
		exclude: ["tests/e2e/**", "tests/artifacts/**", "dist/**"],
		setupFiles: ["tests/setup/coverage-child-process-env.ts"],
		coverage: {
			provider: "istanbul",
			// Coverage is disabled by default for fast local iteration.
			// CI enables it via: npm run test:coverage (--coverage flag).
			// Thresholds below are enforced only when coverage is enabled.
			enabled: false,
			all: true,
			clean: true,
			cleanOnRerun: true,
			skipFull: false,
			reporter: ["text", "json-summary", "lcov"],
			reportsDirectory: ".runtime-cache/coverage/vitest",
			include: [
				"services/mcp-server/src/**/*.ts",
				"packages/contracts/src/**/*.ts",
				"packages/shared-runtime/src/**/*.ts",
				"packages/runtime-observability/src/**/*.ts",
			],
			exclude: [
				"services/mcp-server/src/**/*.test.ts",
				"services/mcp-server/src/main.ts",
				"services/mcp-server/src/**/*.d.ts",
				"services/mcp-server/src/**/*.spec.ts",
				"services/mcp-server/src/types.ts",
				"services/mcp-server/src/providers/types.ts",
				// Integration-heavy runtime wrappers are validated by smoke/e2e gates instead of unit coverage.
				"services/mcp-server/src/providers/gemini-python-sidecar.ts",
				"services/mcp-server/src/path-detection.ts",
				"services/mcp-server/src/next-smoke/**",
				"packages/**/package.json",
			],
			thresholds: isBatchCoverageRun ? undefined : VITEST_COVERAGE_THRESHOLDS,
				},
			},
	});
