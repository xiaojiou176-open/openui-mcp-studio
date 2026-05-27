import { defineConfig, devices } from "playwright/test";

const DEFAULT_E2E_RETRIES = 2;
const MAX_E2E_RETRIES = 2;
const DEFAULT_E2E_WORKERS = 1;
const MAX_E2E_WORKERS = 8;
const EXTERNAL_READONLY_SUITE_GLOB = "**/external-site-readonly.spec.ts";
const PLAYWRIGHT_RUN_ROOT = `.runtime-cache/runs/${
	process.env.OPENUI_RUNTIME_RUN_ID?.trim() || "playwright-local"
}`;

function resolvePlaywrightRetries(): number {
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

function resolvePlaywrightWorkers(): number {
  const raw = process.env.OPENUI_E2E_WORKERS?.trim();
  if (!raw) {
    return DEFAULT_E2E_WORKERS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_E2E_WORKERS;
  }
  return Math.min(MAX_E2E_WORKERS, parsed);
}

function resolveFullyParallel(): boolean {
  const raw = process.env.OPENUI_E2E_FULLY_PARALLEL?.trim().toLowerCase();
  if (!raw) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  return false;
}

function shouldIncludeExternalReadonlySuite(): boolean {
	return process.env.RUN_EXTERNAL_E2E === "1";
}

function resolveDefaultE2ETestIgnore(): string[] {
	if (shouldIncludeExternalReadonlySuite()) {
		return [];
	}
	return [EXTERNAL_READONLY_SUITE_GLOB];
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: resolvePlaywrightRetries(),
  forbidOnly: Boolean(process.env.CI),
  expect: {
    timeout: 5_000,
  },
  fullyParallel: resolveFullyParallel(),
  workers: resolvePlaywrightWorkers(),
  outputDir: `${PLAYWRIGHT_RUN_ROOT}/artifacts/playwright`,
  use: {
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: resolveDefaultE2ETestIgnore(),
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox",
      testIgnore: resolveDefaultE2ETestIgnore(),
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "webkit",
      testIgnore: resolveDefaultE2ETestIgnore(),
      use: {
        ...devices["Desktop Safari"],
      },
    },
    {
      name: "mobile-chromium",
      testIgnore: resolveDefaultE2ETestIgnore(),
      use: {
        ...devices["Pixel 5"],
      },
    },
    {
      name: "mobile-webkit",
      testIgnore: resolveDefaultE2ETestIgnore(),
      use: {
        ...devices["iPhone 12"],
      },
    },
  ],
});
