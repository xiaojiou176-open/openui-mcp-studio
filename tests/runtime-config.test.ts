import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildChildEnvFromAllowlist,
	OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST,
	parseChildEnvAllowlist,
} from "../packages/shared-runtime/src/child-env.js";

const RUNTIME_ENV_KEYS = [
	"GEMINI_API_KEY",
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"GEMINI_MODEL_EMBEDDING",
	"GEMINI_DEFAULT_THINKING_LEVEL",
	"GEMINI_DEFAULT_TEMPERATURE",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MCP_LOG_LEVEL",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_MCP_CHILD_ENV_ALLOWLIST",
	"OPENUI_MCP_LOG_DIR",
	"OPENUI_RUNTIME_RUN_ID",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_LOG_RETENTION_DAYS",
	"OPENUI_MCP_LOG_MAX_FILE_MB",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_TIMEOUT_MS",
	"OPENUI_MAX_RETRIES",
	"OPENUI_RETRY_BASE_MS",
	"OPENUI_QUEUE_CONCURRENCY",
	"OPENUI_IDEMPOTENCY_TTL_MINUTES",
	"OPENUI_GEMINI_PYTHON_BIN",
	"OPENUI_GEMINI_SIDECAR_PATH",
] as const;

const originalEnv = new Map<string, string | undefined>(
	RUNTIME_ENV_KEYS.map((key) => [key, process.env[key]]),
);

async function loadConstantsModule() {
	vi.resetModules();
	return import("../services/mcp-server/src/constants.js");
}

function setValidRuntimeEnv() {
	process.env.GEMINI_API_KEY = "gemini-test-key";
	process.env.GEMINI_MODEL = "gemini-default";
	process.env.GEMINI_MODEL_FAST = "gemini-fast";
	process.env.GEMINI_MODEL_STRONG = "gemini-strong";
	process.env.GEMINI_MODEL_EMBEDDING = "gemini-embedding-001";
	process.env.GEMINI_DEFAULT_THINKING_LEVEL = "high";
	process.env.GEMINI_DEFAULT_TEMPERATURE = "1.0";
	process.env.OPENUI_MODEL_ROUTING = "on";
	process.env.OPENUI_MCP_LOG_LEVEL = "info";
	process.env.OPENUI_MCP_LOG_OUTPUT = "both";
	process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";
	process.env.OPENUI_MCP_LOG_DIR =
		".runtime-cache/runs/<run_id>/logs/runtime.jsonl";
	process.env.OPENUI_RUNTIME_RUN_ID = "runtime-config-run";
	process.env.OPENUI_MCP_CACHE_DIR = ".runtime-cache/cache";
	process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
	process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
	process.env.OPENUI_MCP_WORKSPACE_ROOT = process.cwd();
	process.env.OPENUI_TIMEOUT_MS = "45000";
	process.env.OPENUI_MAX_RETRIES = "2";
	process.env.OPENUI_RETRY_BASE_MS = "450";
	process.env.OPENUI_QUEUE_CONCURRENCY = "1";
	process.env.OPENUI_IDEMPOTENCY_TTL_MINUTES = "1440";
	process.env.OPENUI_GEMINI_PYTHON_BIN = "python3";
	process.env.OPENUI_GEMINI_SIDECAR_PATH = "services/gemini-sidecar/server.py";
}

afterEach(() => {
	for (const key of RUNTIME_ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
	vi.resetModules();
});

describe("runtime config guardrails", () => {
	it.each([
		{
			envKey: "GEMINI_DEFAULT_THINKING_LEVEL",
			value: "minimal",
			expectedMessage:
				'GEMINI_DEFAULT_THINKING_LEVEL must be "low" or "high", received: "minimal".',
		},
		{
			envKey: "GEMINI_DEFAULT_TEMPERATURE",
			value: "0",
			expectedMessage:
				'GEMINI_DEFAULT_TEMPERATURE must be a positive number, received: "0".',
		},
		{
			envKey: "OPENUI_QUEUE_CONCURRENCY",
			value: "0",
			expectedMessage:
				'OPENUI_QUEUE_CONCURRENCY must be a positive integer, received: "0".',
		},
		{
			envKey: "OPENUI_IDEMPOTENCY_TTL_MINUTES",
			value: "0",
			expectedMessage:
				'OPENUI_IDEMPOTENCY_TTL_MINUTES must be a positive integer, received: "0".',
		},
		{
			envKey: "OPENUI_MCP_LOG_LEVEL",
			value: "verbose",
			expectedMessage:
				'OPENUI_MCP_LOG_LEVEL must be one of "debug" | "info" | "warn" | "error", received: "verbose".',
		},
	])("throws explicit error for invalid env: $envKey=$value", async ({
		envKey,
		value,
		expectedMessage,
	}) => {
		setValidRuntimeEnv();
		process.env[envKey] = value;

		const { validateOpenuiRuntimeConfig } = await loadConstantsModule();
		expect(() => validateOpenuiRuntimeConfig()).toThrowError(expectedMessage);
	});

	it("requires GEMINI_API_KEY", async () => {
		setValidRuntimeEnv();
		delete process.env.GEMINI_API_KEY;

		const { validateOpenuiRuntimeConfig } = await loadConstantsModule();
		expect(() => validateOpenuiRuntimeConfig()).toThrowError(
			"GEMINI_API_KEY must be configured and non-empty.",
		);
	});

	it("resolves fast route only for explicit useFast", async () => {
		setValidRuntimeEnv();

		const { resolveOpenuiModel } = await loadConstantsModule();
		expect(resolveOpenuiModel({ routeKey: "strong" }).resolvedModel).toBe(
			"gemini-strong",
		);
		expect(resolveOpenuiModel({ useFast: true }).resolvedModel).toBe(
			"gemini-fast",
		);
	});
});

describe("child env allowlist helper", () => {
	it("merges baseline keys and custom allowlist tokens", () => {
		const parsed = parseChildEnvAllowlist("OPENUI_*,GEMINI_*,GEMINI_*");

		expect(parsed).toEqual(
			expect.arrayContaining([
				...OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST,
				"OPENUI_*",
				"GEMINI_*",
			]),
		);
	});

	it("throws when allowlist contains invalid token", () => {
		expect(() => parseChildEnvAllowlist("OPENUI_*,INVALID-TOKEN")).toThrowError(
			'OPENUI_MCP_CHILD_ENV_ALLOWLIST contains invalid token: "INVALID-TOKEN".',
		);
	});

	it("filters env values while blocking denylisted sensitive secrets", () => {
		const sourceEnv = {
			PATH: "/usr/bin",
			HOME: "/home/dev",
			OPENUI_MODEL_ROUTING: "on",
			OPENUI_TIMEOUT_MS: "45000",
			GEMINI_MODEL: "gemini-3-flash-preview",
			GEMINI_API_KEY: "AIza-test",
			TEST_ONLY_UNRELATED_SECRET: "blocked",
		};

		const childEnv = buildChildEnvFromAllowlist(sourceEnv, "OPENUI_*,GEMINI_*");

		expect(childEnv.PATH).toBe("/usr/bin");
		expect(childEnv.HOME).toBe("/home/dev");
		expect(childEnv.OPENUI_MODEL_ROUTING).toBe("on");
		expect(childEnv.OPENUI_TIMEOUT_MS).toBe("45000");
		expect(childEnv.GEMINI_MODEL).toBe("gemini-3-flash-preview");
		expect(childEnv.GEMINI_API_KEY).toBeUndefined();
		expect(childEnv.TEST_ONLY_UNRELATED_SECRET).toBeUndefined();
	});
});
