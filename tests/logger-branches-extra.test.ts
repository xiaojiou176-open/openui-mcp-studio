import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
	"OPENUI_MCP_LOG_LEVEL",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_MCP_LOG_RETENTION_DAYS",
	"OPENUI_MCP_LOG_MAX_FILE_MB",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_RUNTIME_RUN_ID",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_CACHE_RETENTION_DAYS",
	"OPENUI_MCP_CACHE_MAX_BYTES",
	"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
] as const;

const ACTIVE_LOG_FILE = "runtime.jsonl";
const TEST_RUN_ID = "logger-branches-run";
const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function resolveLogDir(workspaceRoot: string): string {
	const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
	return path.join(
		canonicalWorkspaceRoot,
		".runtime-cache",
		"runs",
		TEST_RUN_ID,
		"logs",
	);
}

function restoreEnv(): void {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

afterEach(() => {
	restoreEnv();
	vi.restoreAllMocks();
	vi.resetModules();
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("logger extra branch coverage", () => {
	it("rotates active file when current bytes exceed max during append", async () => {
		const workspaceRoot = mkTempDir("openui-logger-rotate-write-");
		const logDir = resolveLogDir(workspaceRoot);
		fs.mkdirSync(logDir, { recursive: true });
		const activePath = path.join(logDir, ACTIVE_LOG_FILE);
		fs.writeFileSync(activePath, "x".repeat(120), "utf8");
		const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);

		process.env.OPENUI_MCP_WORKSPACE_ROOT = canonicalWorkspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = TEST_RUN_ID;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			canonicalWorkspaceRoot,
			".runtime-cache",
			"cache",
		);
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "104857600";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "60";
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "0.0001";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";

		const logger = await import("../services/mcp-server/src/logger.js");
		logger.logInfo("rotate-on-append", {
			payload: "y".repeat(64),
		});

		const files = fs.readdirSync(logDir);
		const rotated = files.filter(
			(name) =>
				name.startsWith("runtime.") &&
				name.endsWith(".jsonl") &&
				name !== ACTIVE_LOG_FILE,
		);
		expect(rotated.length).toBeGreaterThanOrEqual(1);
		expect(fs.existsSync(activePath)).toBe(true);
	});

	it("emits internal error when cache retention config parsing fails", async () => {
		const workspaceRoot = mkTempDir("openui-logger-cache-config-");
		const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = canonicalWorkspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = TEST_RUN_ID;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			canonicalWorkspaceRoot,
			".runtime-cache",
			"cache",
		);
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";

		vi.doMock("../packages/runtime-observability/src/cache-retention.js", () => ({
			isCacheCleanupDue: vi.fn(() => true),
			pruneCacheDirectorySync: vi.fn(),
			resolveCacheRetentionConfigFromEnv: vi.fn(() => {
				throw new Error("broken-cache-config");
			}),
		}));

		const logger = await import("../services/mcp-server/src/logger.js");
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("cache-config-failure");

		const internalPayloads = stderrSpy.mock.calls
			.map(([line]) => JSON.parse(String(line)) as { context?: string })
			.filter(
				(payload) => payload.context === "resolve_cache_retention_config",
			);
		expect(internalPayloads.length).toBeGreaterThanOrEqual(1);
	});

	it("emits internal error when cache pruning throws", async () => {
		const workspaceRoot = mkTempDir("openui-logger-cache-prune-");
		const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = canonicalWorkspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = TEST_RUN_ID;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			canonicalWorkspaceRoot,
			".runtime-cache",
			"cache",
		);
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";

		vi.doMock("../packages/runtime-observability/src/cache-retention.js", () => ({
			isCacheCleanupDue: vi.fn(() => true),
			pruneCacheDirectorySync: vi.fn(() => {
				throw new Error("forced-prune-failure");
			}),
			resolveCacheRetentionConfigFromEnv: vi.fn(() => ({
				cacheDir: "/tmp/cache",
				nowMs: Date.now(),
				cleanIntervalMinutes: 10,
				maxBytes: 1000,
				retentionDays: 7,
			})),
		}));

		const logger = await import("../services/mcp-server/src/logger.js");
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("cache-prune-failure");

		const internalPayloads = stderrSpy.mock.calls
			.map(([line]) => JSON.parse(String(line)) as { context?: string })
			.filter((payload) => payload.context === "prune_cache_directory");
		expect(internalPayloads.length).toBeGreaterThanOrEqual(1);
	});

	it("disables file sink after first write failure and short-circuits later writes", async () => {
		const workspaceRoot = mkTempDir("openui-logger-disable-sink-");
		const canonicalWorkspaceRoot = fs.realpathSync(workspaceRoot);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = canonicalWorkspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = TEST_RUN_ID;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			canonicalWorkspaceRoot,
			".runtime-cache",
			"cache",
		);
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "104857600";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "60";
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";

		const openSpy = vi.spyOn(fs, "openSync").mockImplementationOnce(() => {
			throw new Error("open-failed");
		});

		const logger = await import("../services/mcp-server/src/logger.js");
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("first-write-fails");
		logger.logInfo("second-write-skips");

		expect(openSpy).toHaveBeenCalledTimes(1);
		const writeSinkErrors = stderrSpy.mock.calls
			.map(([line]) => JSON.parse(String(line)) as { context?: string })
			.filter((payload) => payload.context === "write_file_sink");
		expect(writeSinkErrors).toHaveLength(1);
	});
});
