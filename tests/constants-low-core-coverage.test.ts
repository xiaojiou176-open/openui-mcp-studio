import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
	"GEMINI_API_KEY",
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"GEMINI_MODEL_EMBEDDING",
	"GEMINI_DEFAULT_THINKING_LEVEL",
	"GEMINI_DEFAULT_TEMPERATURE",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MCP_CHILD_ENV_ALLOWLIST",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_MCP_LOG_LEVEL",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_MCP_LOG_DIR",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_LOG_RETENTION_DAYS",
	"OPENUI_MCP_LOG_MAX_FILE_MB",
	"OPENUI_TIMEOUT_MS",
	"OPENUI_MAX_RETRIES",
	"OPENUI_RETRY_BASE_MS",
	"OPENUI_QUEUE_CONCURRENCY",
	"OPENUI_QUEUE_MAX_PENDING",
	"OPENUI_IDEMPOTENCY_TTL_MINUTES",
	"OPENUI_GEMINI_PYTHON_BIN",
	"OPENUI_GEMINI_SIDECAR_PATH",
	"OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES",
	"OPENUI_MCP_CACHE_RETENTION_DAYS",
	"OPENUI_MCP_CACHE_MAX_BYTES",
	"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
	"OPENUI_TOOL_CACHE_ROOT",
	"OPENUI_TOOL_CACHE_RETENTION_DAYS",
	"OPENUI_TOOL_CACHE_MAX_BYTES",
	"OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES",
	"OPENUI_CHROME_USER_DATA_DIR",
	"OPENUI_CHROME_PROFILE_DIRECTORY",
	"OPENUI_CHROME_CHANNEL",
	"OPENUI_CHROME_EXECUTABLE_PATH",
	"OPENUI_CHROME_CDP_PORT",
] as const;

const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];

function restoreEnv(): void {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

function makeTempWorkspace(prefix: string): string {
	const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(workspaceRoot);
	return workspaceRoot;
}

async function loadConstants() {
	vi.resetModules();
	return import("../services/mcp-server/src/constants.js");
}

afterEach(() => {
	restoreEnv();
	vi.restoreAllMocks();
	vi.resetModules();
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("constants low-core coverage", () => {
	it("covers runtime getters and validates full runtime config", async () => {
		const workspaceRoot = makeTempWorkspace("openui-constants-low-core-");
		process.env.GEMINI_API_KEY = "test-key"; // pragma: allowlist secret
		process.env.GEMINI_MODEL = "gemini-primary";
		process.env.GEMINI_MODEL_FAST = "gemini-fast";
		process.env.GEMINI_MODEL_STRONG = "gemini-strong";
		process.env.GEMINI_MODEL_EMBEDDING = "gemini-embedding-custom";
		process.env.GEMINI_DEFAULT_THINKING_LEVEL = "high";
		process.env.GEMINI_DEFAULT_TEMPERATURE = "0.8";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST = "PATH, HOME";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_LOG_LEVEL = "info";
		process.env.OPENUI_MCP_LOG_OUTPUT = "both";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";
		process.env.OPENUI_MCP_LOG_DIR = ".runtime-cache/logs/runtime";
		process.env.OPENUI_MCP_CACHE_DIR = ".runtime-cache/cache";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "9";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "5";
		process.env.OPENUI_TIMEOUT_MS = "32100";
		process.env.OPENUI_MAX_RETRIES = "3";
		process.env.OPENUI_RETRY_BASE_MS = "350";
		process.env.OPENUI_QUEUE_CONCURRENCY = "4";
		process.env.OPENUI_QUEUE_MAX_PENDING = "77";
		process.env.OPENUI_IDEMPOTENCY_TTL_MINUTES = "25";
		process.env.OPENUI_GEMINI_PYTHON_BIN = "python3.12";
		process.env.OPENUI_GEMINI_SIDECAR_PATH =
			"services/gemini-sidecar/bridge.py";
		process.env.OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES = "131072";
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "6";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "2048";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "15";

		const constants = await loadConstants();
		expect(constants.getGeminiApiKey()).toBe("test-key");
		expect(constants.getGeminiModelEmbedding()).toBe("gemini-embedding-custom");
		expect(constants.getGeminiDefaultThinkingLevel()).toBe("high");
		expect(constants.getGeminiDefaultTemperature()).toBe(0.8);
		expect(constants.getOpenuiModel()).toBe("gemini-primary");
		expect(constants.getOpenuiModelFast()).toBe("gemini-fast");
		expect(constants.getOpenuiModelStrong()).toBe("gemini-strong");
		expect(constants.getOpenuiTimeoutMs()).toBe(32100);
		expect(constants.getOpenuiQueueConcurrency()).toBe(4);
		expect(constants.getOpenuiIdempotencyTtlMinutes()).toBe(25);
		expect(constants.getGeminiSidecarPythonBin()).toBe("python3.12");
		expect(constants.getGeminiSidecarPath()).toBe(
			path.resolve("services/gemini-sidecar/bridge.py"),
		);
		expect(constants.getOpenuiMcpCacheRetentionDays()).toBe(6);
		expect(constants.getOpenuiMcpCacheMaxBytes()).toBe(2048);
		expect(constants.getOpenuiMcpCacheCleanIntervalMinutes()).toBe(15);
		expect(constants.getWorkspaceRoot()).toBe(constants.getWorkspaceRoot());
		expect(constants.validateOpenuiRuntimeConfig()).toBeUndefined();
		expect(constants.buildDefaultShadcnStyleGuide("@/components/ui")).toContain(
			'Import shadcn primitives from "@/components/ui/..."',
		);
	});

	it("rejects invalid key runtime env values", async () => {
		const constants = await loadConstants();

		process.env.GEMINI_API_KEY = "   ";
		expect(() => constants.getGeminiApiKey()).toThrow(
			"GEMINI_API_KEY must be configured and non-empty.",
		);

		process.env.GEMINI_DEFAULT_THINKING_LEVEL = "mid";
		expect(() => constants.getGeminiDefaultThinkingLevel()).toThrow(
			/GEMINI_DEFAULT_THINKING_LEVEL must be "low" or "high"/,
		);

		process.env.GEMINI_DEFAULT_TEMPERATURE = "0";
		expect(() => constants.getGeminiDefaultTemperature()).toThrow(
			/GEMINI_DEFAULT_TEMPERATURE must be a positive number/,
		);

		process.env.OPENUI_QUEUE_CONCURRENCY = "1.5";
		expect(() => constants.getOpenuiQueueConcurrency()).toThrow(
			/OPENUI_QUEUE_CONCURRENCY must be a positive integer/,
		);
	});

	it("falls back to defaults for optional envs and accepts low thinking level", async () => {
		const constants = await loadConstants();

		delete process.env.GEMINI_MODEL_EMBEDDING;
		delete process.env.OPENUI_GEMINI_PYTHON_BIN;
		process.env.GEMINI_DEFAULT_THINKING_LEVEL = "low";

		expect(constants.getGeminiModelEmbedding()).toBe(
			constants.DEFAULT_GEMINI_MODEL_EMBEDDING,
		);
		expect(constants.getGeminiSidecarPythonBin()).toBe("python3");
		expect(constants.getGeminiDefaultThinkingLevel()).toBe("low");
	});

	it("validates routing and log-level fallback branches", async () => {
		const constants = await loadConstants();

		delete process.env.OPENUI_MODEL_ROUTING;
		expect(constants.getOpenuiModelRoutingMode()).toBe(
			constants.DEFAULT_OPENUI_MODEL_ROUTING,
		);

		process.env.OPENUI_MODEL_ROUTING = "sideways";
		expect(() => constants.getOpenuiModelRoutingMode()).toThrow(
			/OPENUI_MODEL_ROUTING must be "on" or "off"/,
		);

		delete process.env.OPENUI_MCP_LOG_LEVEL;
		expect(constants.getOpenuiMcpLogLevel()).toBe(
			constants.DEFAULT_OPENUI_MCP_LOG_LEVEL,
		);

		process.env.OPENUI_MCP_LOG_LEVEL = "verbose";
		expect(() => constants.getOpenuiMcpLogLevel()).toThrow(
			/OPENUI_MCP_LOG_LEVEL must be one of/,
		);

		delete process.env.OPENUI_MCP_LOG_OUTPUT;
		expect(constants.getOpenuiMcpLogOutput()).toBe("both");

		process.env.OPENUI_MCP_LOG_OUTPUT = "printer";
		expect(() => constants.getOpenuiMcpLogOutput()).toThrow(
			/OPENUI_MCP_LOG_OUTPUT must be one of/,
		);

		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "-5";
		expect(() => constants.getOpenuiMcpCacheCleanIntervalMinutes()).toThrow(
			/positive integer/,
		);
	});

	it("resolves tool-cache roots and chrome profile getters across default, relative, home, and absolute branches", async () => {
		const workspaceRoot = makeTempWorkspace("openui-tool-cache-constants-");
		const chromeDataRoot = makeTempWorkspace("openui-chrome-data-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;

		const constants = await loadConstants();

		delete process.env.OPENUI_TOOL_CACHE_ROOT;
		expect(constants.getOpenuiToolCacheRoot()).toContain(
			path.join(".cache", "openui-mcp-studio", "tooling"),
		);

		process.env.OPENUI_TOOL_CACHE_ROOT = ".cache/openui-local-tooling";
		expect(constants.getOpenuiToolCacheRoot()).toBe(
			path.join(constants.getWorkspaceRoot(), ".cache/openui-local-tooling"),
		);

		process.env.OPENUI_TOOL_CACHE_ROOT = "~/.cache/openui-home-tooling";
		expect(constants.getOpenuiToolCacheRoot()).toBe(
			path.join(os.homedir(), ".cache/openui-home-tooling"),
		);

		process.env.OPENUI_TOOL_CACHE_ROOT = "/tmp/openui-absolute-tooling";
		expect(constants.getOpenuiToolCacheRoot()).toBe(
			path.resolve("/tmp/openui-absolute-tooling"),
		);

		delete process.env.OPENUI_CHROME_USER_DATA_DIR;
		delete process.env.OPENUI_CHROME_PROFILE_DIRECTORY;
		delete process.env.OPENUI_CHROME_CHANNEL;
		delete process.env.OPENUI_CHROME_EXECUTABLE_PATH;
		delete process.env.OPENUI_CHROME_CDP_PORT;
		expect(constants.getOpenuiChromeUserDataDir()).toBeNull();
		expect(constants.getOpenuiChromeProfileDirectory()).toBeNull();
		expect(constants.getOpenuiChromeChannel()).toBe("chrome");
		expect(constants.getOpenuiChromeExecutablePath()).toBeNull();
		expect(constants.getOpenuiChromeCdpPort()).toBe(9343);

		process.env.OPENUI_CHROME_USER_DATA_DIR = chromeDataRoot;
		process.env.OPENUI_CHROME_PROFILE_DIRECTORY = "Profile 29";
		process.env.OPENUI_CHROME_CHANNEL = "chrome-beta";
		process.env.OPENUI_CHROME_EXECUTABLE_PATH =
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
		process.env.OPENUI_CHROME_CDP_PORT = "9666";
		expect(constants.getOpenuiChromeUserDataDir()).toBe(chromeDataRoot);
		expect(constants.getOpenuiChromeProfileDirectory()).toBe("Profile 29");
		expect(constants.getOpenuiChromeChannel()).toBe("chrome-beta");
		expect(constants.getOpenuiChromeExecutablePath()).toBe(
			path.resolve(
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			),
		);
		expect(constants.getOpenuiChromeCdpPort()).toBe(9666);
	});

	it("validates tool-cache numeric overrides through runtime config", async () => {
		const workspaceRoot = makeTempWorkspace("openui-tool-cache-runtime-");
		process.env.GEMINI_API_KEY = "test-key";
		process.env.GEMINI_MODEL = "gemini-primary";
		process.env.GEMINI_MODEL_FAST = "gemini-fast";
		process.env.GEMINI_MODEL_STRONG = "gemini-strong";
		process.env.GEMINI_MODEL_EMBEDDING = "gemini-embedding";
		process.env.GEMINI_DEFAULT_THINKING_LEVEL = "high";
		process.env.GEMINI_DEFAULT_TEMPERATURE = "1";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_LOG_LEVEL = "info";
		process.env.OPENUI_MCP_LOG_OUTPUT = "both";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";
		process.env.OPENUI_MCP_LOG_DIR =
			".runtime-cache/runs/<run_id>/logs/runtime.jsonl";
		process.env.OPENUI_MCP_CACHE_DIR = ".runtime-cache/cache";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_TIMEOUT_MS = "45000";
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "450";
		process.env.OPENUI_QUEUE_CONCURRENCY = "1";
		process.env.OPENUI_QUEUE_MAX_PENDING = "128";
		process.env.OPENUI_IDEMPOTENCY_TTL_MINUTES = "1440";
		process.env.OPENUI_GEMINI_PYTHON_BIN = "python3";
		process.env.OPENUI_GEMINI_SIDECAR_PATH =
			"services/gemini-sidecar/server.py";
		process.env.OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES = "262144";
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "104857600";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "60";
		process.env.OPENUI_TOOL_CACHE_ROOT = "~/.cache/openui-mcp-studio/tooling";
		process.env.OPENUI_TOOL_CACHE_RETENTION_DAYS = "3";
		process.env.OPENUI_TOOL_CACHE_MAX_BYTES = "5368709120";
		process.env.OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES = "60";

		const constants = await loadConstants();
		expect(constants.validateOpenuiRuntimeConfig()).toBeUndefined();
		expect(constants.getOpenuiToolCacheRetentionDays()).toBe(3);
		expect(constants.getOpenuiToolCacheMaxBytes()).toBe(5368709120);
		expect(constants.getOpenuiToolCacheCleanIntervalMinutes()).toBe(60);

		process.env.OPENUI_TOOL_CACHE_RETENTION_DAYS = "0";
		expect(() => constants.getOpenuiToolCacheRetentionDays()).toThrow(
			/positive integer/,
		);
		process.env.OPENUI_TOOL_CACHE_RETENTION_DAYS = "3";
		process.env.OPENUI_TOOL_CACHE_MAX_BYTES = "-1";
		expect(() => constants.getOpenuiToolCacheMaxBytes()).toThrow(
			/positive integer/,
		);
		process.env.OPENUI_TOOL_CACHE_MAX_BYTES = "5368709120";
		process.env.OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES = "nope";
		expect(() => constants.getOpenuiToolCacheCleanIntervalMinutes()).toThrow(
			/positive integer/,
		);
	});
});
