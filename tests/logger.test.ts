import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOGGER_ENV_KEYS = [
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
const TEST_RUN_ID = "logger-test-run";

const originalEnv = new Map<string, string | undefined>(
	LOGGER_ENV_KEYS.map((key) => [key, process.env[key]]),
);
const createdLogDirs = new Set<string>();

function restoreEnv() {
	for (const key of LOGGER_ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

function createTempLogDir(): string {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openui-mcp-logger-"));
	createdLogDirs.add(tempDir);
	return tempDir;
}

function createTempWorkspaceRoot(): string {
	const tempDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "openui-mcp-workspace-"),
	);
	createdLogDirs.add(tempDir);
	return fs.realpathSync(tempDir);
}

function resolveLogDir(workspaceRoot: string): string {
	return path.join(
		workspaceRoot,
		".runtime-cache",
		"runs",
		TEST_RUN_ID,
		"logs",
	);
}

describe("logger", () => {
	beforeEach(() => {
		vi.resetModules();
		const workspaceRoot = createTempWorkspaceRoot();
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_RUNTIME_RUN_ID = TEST_RUN_ID;
		process.env.OPENUI_MCP_CACHE_DIR = path.join(
			workspaceRoot,
			".runtime-cache",
			"cache",
		);
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "104857600";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "60";
	});

	afterEach(() => {
		restoreEnv();
		vi.restoreAllMocks();
		for (const dir of createdLogDirs) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		createdLogDirs.clear();
	});

	it("detects no-follow append support by platform and flag availability", async () => {
		const logger = await import("../services/mcp-server/src/logger.js");
		expect(
			logger.isNoFollowAppendProtectionSupported({
				platform: "linux",
				oNoFollow: 256,
			}),
		).toBe(true);
		expect(
			logger.isNoFollowAppendProtectionSupported({
				platform: "darwin",
				oNoFollow: 256,
			}),
		).toBe(true);
		expect(
			logger.isNoFollowAppendProtectionSupported({
				platform: "win32",
				oNoFollow: 256,
			}),
		).toBe(false);
		expect(
			logger.isNoFollowAppendProtectionSupported({
				platform: "linux",
				oNoFollow: 0,
			}),
		).toBe(false);
	});

	it("fails closed with explicit error when no-follow append protection is unsupported", async () => {
		const logger = await import("../services/mcp-server/src/logger.js");
		expect(() =>
			logger.getAppendNoFollowFlagsOrThrow({
				platform: "win32",
				oNoFollow: 256,
			}),
		).toThrow(/unsupported on platform win32/i);
	});

	it("applies threshold to debug/info/warn/error consistently", async () => {
		process.env.OPENUI_MCP_LOG_LEVEL = "warn";
		process.env.OPENUI_MCP_LOG_OUTPUT = "stderr";

		const logger = await import("../services/mcp-server/src/logger.js");
		const writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logDebug("debug-hidden");
		logger.logInfo("info-hidden");
		logger.logWarn("warn-visible");
		logger.logError("error-visible");

		expect(writeSpy).toHaveBeenCalledTimes(2);

		const payloads = writeSpy.mock.calls.map(([line]) =>
			JSON.parse(String(line)),
		);
		expect(payloads.map((payload) => payload.event)).toEqual([
			"warn-visible",
			"error-visible",
		]);
	});

	it("redacts sensitive keys in nested meta payloads", async () => {
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "stderr";

		const logger = await import("../services/mcp-server/src/logger.js");
		const writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("meta-redaction", {
			token: "token-value",
			apiKey: "apikey-value",
			password: "password-value",
			authorization: "auth-value",
			cookie: "cookie-value",
			secret: "secret-value",
			key: "generic-key-value",
			nested: {
				userToken: "nested-token-value",
				safeField: "ok",
			},
			list: [
				{
					secretKey: "list-secret-value",
					normal: "normal-value",
				},
			],
			normalField: "safe",
			valuePatternProbeOne: "Bearer abc.def.ghi",
			valuePatternProbeTwo: "gh" + "s_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
			valuePatternProbeThree: "AIza" + "A".repeat(35),
			valuePatternProbeFour:
				"dummy-openai-like-prefix-" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
		});

		expect(writeSpy).toHaveBeenCalledTimes(1);

		const payload = JSON.parse(String(writeSpy.mock.calls[0][0]));
		expect(payload.token).toBe("[REDACTED]");
		expect(payload.apiKey).toBe("[REDACTED]");
		expect(payload.password).toBe("[REDACTED]");
		expect(payload.authorization).toBe("[REDACTED]");
		expect(payload.cookie).toBe("[REDACTED]");
		expect(payload.secret).toBe("[REDACTED]");
		expect(payload.key).toBe("[REDACTED]");
		expect(payload.nested).toEqual({
			userToken: "[REDACTED]",
			safeField: "ok",
		});
		expect(payload.list).toEqual([
			{
				secretKey: "[REDACTED]",
				normal: "normal-value",
			},
		]);
		expect(payload.normalField).toBe("safe");
		expect(payload.valuePatternProbeOne).toBe("[REDACTED]");
		expect(payload.valuePatternProbeTwo).toBe("[REDACTED]");
		expect(payload.valuePatternProbeThree).toBe("[REDACTED]");
		expect(payload.valuePatternProbeFour).toBe(
			"dummy-openai-like-prefix-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
		);
	});

	it("keeps structured tracing fields and redacts sensitive error text", async () => {
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "stderr";

		const logger = await import("../services/mcp-server/src/logger.js");
		const writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logError("structured-error", {
			requestId: "req-123",
			traceId: "trace-123",
			stage: "provider_call",
			errorType: "SIDECAR_REMOTE_ERROR",
			error: "Authorization: Bearer top-secret-value",
		});

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const payload = JSON.parse(String(writeSpy.mock.calls[0][0]));
		expect(payload.requestId).toBe("req-123");
		expect(payload.traceId).toBe("trace-123");
		expect(payload.stage).toBe("provider_call");
		expect(payload.errorType).toBe("SIDECAR_REMOTE_ERROR");
		expect(payload.error).toBe("[REDACTED]");
	});

	it("writes JSONL logs to file sink when OPENUI_MCP_LOG_OUTPUT=file", async () => {
		const workspaceRoot = createTempWorkspaceRoot();
		const logDir = resolveLogDir(workspaceRoot);
		const cacheDir = path.join(workspaceRoot, ".runtime-cache", "cache");
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";

		const logger = await import("../services/mcp-server/src/logger.js");
		const writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("file-sink-write", { phase: "test" });

		expect(writeSpy).toHaveBeenCalledTimes(0);

		const activeFilePath = path.join(logDir, ACTIVE_LOG_FILE);
		expect(fs.existsSync(activeFilePath)).toBe(true);
		const fileLines = fs
			.readFileSync(activeFilePath, "utf8")
			.split("\n")
			.filter(Boolean);
		expect(fileLines).toHaveLength(1);

		const payload = JSON.parse(fileLines[0]);
		expect(payload.event).toBe("file-sink-write");
		expect(payload.phase).toBe("test");
	});

	it("refuses writing through explicit symlinked active log file", async () => {
		const workspaceRoot = createTempWorkspaceRoot();
		const logDir = resolveLogDir(workspaceRoot);
		const cacheDir = path.join(workspaceRoot, ".runtime-cache", "cache");
		const outsideDir = createTempLogDir();
		const outsideFile = path.join(outsideDir, "outside-target.log");
		const activeFilePath = path.join(logDir, ACTIVE_LOG_FILE);
		fs.mkdirSync(logDir, { recursive: true });

		fs.writeFileSync(outsideFile, "outside\n", "utf8");
		try {
			fs.symlinkSync(outsideFile, activeFilePath);
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "EPERM") {
				return;
			}
			throw error;
		}

		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";

		const logger = await import("../services/mcp-server/src/logger.js");
		const writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("blocked-symlink-write", { phase: "test" });

		expect(fs.readFileSync(outsideFile, "utf8")).toBe("outside\n");
		const internalErrors = writeSpy.mock.calls
			.map(([line]) => {
				try {
					return JSON.parse(String(line)) as {
						event?: string;
						context?: string;
					};
				} catch {
					return {};
				}
			})
			.filter((payload) => payload.event === "logger_internal_error");
		expect(
			internalErrors.some((payload) => payload.context === "write_file_sink"),
		).toBe(true);
	});

	it("keeps stderr output when OPENUI_MCP_LOG_OUTPUT=both", async () => {
		const workspaceRoot = createTempWorkspaceRoot();
		const logDir = resolveLogDir(workspaceRoot);
		const cacheDir = path.join(workspaceRoot, ".runtime-cache", "cache");
		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "both";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";

		const logger = await import("../services/mcp-server/src/logger.js");
		const writeSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		logger.logInfo("both-sink-write");

		expect(writeSpy).toHaveBeenCalledTimes(1);
		const activeFilePath = path.join(logDir, ACTIVE_LOG_FILE);
		expect(fs.existsSync(activeFilePath)).toBe(true);
	});

	it("rotates oversized startup log and prunes expired files", async () => {
		const workspaceRoot = createTempWorkspaceRoot();
		const logDir = resolveLogDir(workspaceRoot);
		const cacheDir = path.join(workspaceRoot, ".runtime-cache", "cache");
		fs.mkdirSync(logDir, { recursive: true });
		const activeFilePath = path.join(logDir, ACTIVE_LOG_FILE);
		const expiredFilePath = path.join(
			logDir,
			"runtime.2000-01-01T00-00-00-000Z.jsonl",
		);

		fs.writeFileSync(activeFilePath, "x".repeat(2_048), "utf8");
		fs.writeFileSync(expiredFilePath, "expired\n", "utf8");
		const oldTime = Date.now() - 2 * 24 * 60 * 60 * 1000;
		fs.utimesSync(expiredFilePath, oldTime / 1000, oldTime / 1000);

		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "0.001";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "1";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";

		const logger = await import("../services/mcp-server/src/logger.js");
		logger.logInfo("startup-rotation");

		expect(fs.existsSync(expiredFilePath)).toBe(false);
		expect(fs.existsSync(activeFilePath)).toBe(true);

		const activePayloads = fs
			.readFileSync(activeFilePath, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		expect(activePayloads[0]?.event).toBe("startup-rotation");

		const rotatedFiles = fs.readdirSync(logDir).filter((entry) => {
			return (
				entry.startsWith("runtime.") &&
				entry.endsWith(".jsonl") &&
				entry !== ACTIVE_LOG_FILE
			);
		});
		expect(rotatedFiles.length).toBeGreaterThanOrEqual(1);
	});

	it("prunes expired and oversized cache files before writing logs", async () => {
		const workspaceRoot = createTempWorkspaceRoot();
		const cacheDir = path.join(workspaceRoot, ".runtime-cache", "cache");
		const expiredFilePath = path.join(cacheDir, "expired", "a.cache");
		const oldFilePath = path.join(cacheDir, "old", "b.cache");
		const freshFilePath = path.join(cacheDir, "fresh", "c.cache");
		const now = Date.now();

		fs.mkdirSync(path.dirname(expiredFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(oldFilePath), { recursive: true });
		fs.mkdirSync(path.dirname(freshFilePath), { recursive: true });
		fs.writeFileSync(expiredFilePath, "x".repeat(40), "utf8");
		fs.writeFileSync(oldFilePath, "x".repeat(70), "utf8");
		fs.writeFileSync(freshFilePath, "x".repeat(70), "utf8");
		fs.utimesSync(
			expiredFilePath,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
			(now - 3 * 24 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			oldFilePath,
			(now - 2 * 60 * 60 * 1000) / 1000,
			(now - 2 * 60 * 60 * 1000) / 1000,
		);
		fs.utimesSync(
			freshFilePath,
			(now - 60 * 60 * 1000) / 1000,
			(now - 60 * 60 * 1000) / 1000,
		);

		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "1";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "100";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "60";

		const logger = await import("../services/mcp-server/src/logger.js");
		logger.logInfo("cache-cleanup-trigger");

		expect(fs.existsSync(expiredFilePath)).toBe(false);
		expect(fs.existsSync(oldFilePath)).toBe(false);
		expect(fs.existsSync(freshFilePath)).toBe(true);
	});

	it("respects cache cleanup interval between log writes", async () => {
		const workspaceRoot = createTempWorkspaceRoot();
		const cacheDir = path.join(workspaceRoot, ".runtime-cache", "cache");
		const firstExpiredFilePath = path.join(cacheDir, "first-expired.cache");
		const secondExpiredFilePath = path.join(cacheDir, "second-expired.cache");
		const oldTimeSeconds = (Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000;

		fs.mkdirSync(path.dirname(firstExpiredFilePath), { recursive: true });
		fs.writeFileSync(firstExpiredFilePath, "old-cache", "utf8");
		fs.utimesSync(firstExpiredFilePath, oldTimeSeconds, oldTimeSeconds);

		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		process.env.OPENUI_MCP_LOG_OUTPUT = "file";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "10";
		process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_CACHE_RETENTION_DAYS = "1";
		process.env.OPENUI_MCP_CACHE_MAX_BYTES = "104857600";
		process.env.OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = "120";

		const logger = await import("../services/mcp-server/src/logger.js");
		logger.logInfo("cache-cleanup-first");
		expect(fs.existsSync(firstExpiredFilePath)).toBe(false);

		fs.mkdirSync(path.dirname(secondExpiredFilePath), { recursive: true });
		fs.writeFileSync(secondExpiredFilePath, "old-cache-2", "utf8");
		fs.utimesSync(secondExpiredFilePath, oldTimeSeconds, oldTimeSeconds);

		logger.logInfo("cache-cleanup-second");
		expect(fs.existsSync(secondExpiredFilePath)).toBe(true);
	});
});
