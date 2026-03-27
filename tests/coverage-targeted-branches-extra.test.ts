import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	evaluateTouchTargetHeuristic,
	hasFocusIndicatorSuppressedHeuristic,
	hasInsufficientStaticNonTextContrastHeuristic,
	hasInsufficientStaticTextContrastHeuristic,
	hasMissingSkipLinkHeuristic,
	hasNonScaleSpacingHeuristic,
	hasPrimaryActionOverloadHeuristic,
	__test__ as reviewHeuristicsInternals,
} from "../services/mcp-server/src/uiux/review-heuristics.js";
import {
	evaluateDialogHeuristics,
	hasAssociatedControlLabel,
} from "../services/mcp-server/src/uiux/review-heuristics-dialog.js";

const ENV_KEYS = [
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"GEMINI_DEFAULT_THINKING_LEVEL",
	"GEMINI_DEFAULT_TEMPERATURE",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MCP_LOG_LEVEL",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_MCP_LOG_MAX_FILE_MB",
	"OPENUI_MCP_LOG_RETENTION_DAYS",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_RUNTIME_RUN_ID",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_CACHE_RETENTION_DAYS",
	"OPENUI_MCP_CACHE_MAX_BYTES",
	"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
	"OPENUI_MAX_RETRIES",
	"OPENUI_GEMINI_SIDECAR_PATH",
] as const;

const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];
const TEST_RUN_ID = "coverage-logger-run";

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

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function mkRuntimeWorkspaceRoot(prefix: string): string {
	return fs.realpathSync(mkTempDir(prefix));
}

function mkRuntimeLogDir(prefix: string): string {
	const workspaceRoot = mkRuntimeWorkspaceRoot(prefix);
	return path.join(
		workspaceRoot,
		".runtime-cache",
		"runs",
		TEST_RUN_ID,
		"logs",
	);
}

async function loadConstants() {
	vi.resetModules();
	return import("../services/mcp-server/src/constants.js");
}

async function loadLogger() {
	vi.resetModules();
	return import("../services/mcp-server/src/logger.js");
}

function setupLoggerEnv(workspaceRoot: string): void {
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
	process.env.OPENUI_MCP_LOG_LEVEL = "debug";
	process.env.OPENUI_MCP_LOG_OUTPUT = "file";
	process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "5";
	process.env.OPENUI_MCP_LOG_RETENTION_DAYS = "7";
	process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "off";
}

afterEach(() => {
	restoreEnv();
	vi.doUnmock("../packages/runtime-observability/src/cache-retention.js");
	vi.restoreAllMocks();
	vi.resetModules();
	vi.useRealTimers();
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("constants targeted branch coverage", () => {
	it("covers default fallback branches for model/routing/thinking getters", async () => {
		const constants = await loadConstants();

		process.env.GEMINI_MODEL = "   ";
		process.env.GEMINI_MODEL_FAST = "";
		delete process.env.GEMINI_MODEL_STRONG;
		delete process.env.GEMINI_DEFAULT_THINKING_LEVEL;
		delete process.env.OPENUI_MODEL_ROUTING;

		expect(constants.getGeminiModel()).toEqual({
			model: constants.DEFAULT_GEMINI_MODEL,
			source: "default",
		});
		expect(constants.getGeminiModelFast()).toEqual({
			model: constants.DEFAULT_GEMINI_MODEL_FAST,
			source: "default",
		});
		expect(constants.getGeminiModelStrong()).toEqual({
			model: constants.DEFAULT_GEMINI_MODEL_STRONG,
			source: "default",
		});
		expect(constants.getGeminiDefaultThinkingLevel()).toBe(
			constants.DEFAULT_GEMINI_DEFAULT_THINKING_LEVEL,
		);
		expect(constants.getOpenuiModelRoutingMode()).toBe(
			constants.DEFAULT_OPENUI_MODEL_ROUTING,
		);
	});

	it("covers numeric env fallback and negative-guard branches", async () => {
		const constants = await loadConstants();

		delete process.env.GEMINI_DEFAULT_TEMPERATURE;
		delete process.env.OPENUI_MAX_RETRIES;
		delete process.env.OPENUI_MCP_LOG_RETENTION_DAYS;

		expect(constants.getGeminiDefaultTemperature()).toBe(
			constants.DEFAULT_GEMINI_DEFAULT_TEMPERATURE,
		);
		expect(constants.getOpenuiMaxRetries()).toBe(
			constants.DEFAULT_OPENUI_MAX_RETRIES,
		);
		expect(constants.getOpenuiMcpLogRetentionDays()).toBe(
			constants.DEFAULT_OPENUI_MCP_LOG_RETENTION_DAYS,
		);

		process.env.OPENUI_MAX_RETRIES = "-1";
		expect(() => constants.getOpenuiMaxRetries()).toThrow(
			/OPENUI_MAX_RETRIES must be a non-negative integer/,
		);
	});

	it("covers log level default/enum branches and invalid guard", async () => {
		const constants = await loadConstants();

		delete process.env.OPENUI_MCP_LOG_LEVEL;
		expect(constants.getOpenuiMcpLogLevel()).toBe(
			constants.DEFAULT_OPENUI_MCP_LOG_LEVEL,
		);

		process.env.OPENUI_MCP_LOG_LEVEL = "warn";
		expect(constants.getOpenuiMcpLogLevel()).toBe("warn");

		process.env.OPENUI_MCP_LOG_LEVEL = "error";
		expect(constants.getOpenuiMcpLogLevel()).toBe("error");

		process.env.OPENUI_MCP_LOG_LEVEL = "trace";
		expect(() => constants.getOpenuiMcpLogLevel()).toThrow(
			/OPENUI_MCP_LOG_LEVEL must be one of/,
		);
	});

	it("covers workspace cache-key fallback and sidecar path default branch", async () => {
		const constants = await loadConstants();
		delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
		delete process.env.OPENUI_GEMINI_SIDECAR_PATH;

		vi.spyOn(fs, "statSync").mockReturnValue({
			isDirectory: () => true,
		} as fs.Stats);
		vi.spyOn(fs, "realpathSync").mockReturnValue("/tmp/openui-default-root");

		expect(constants.getWorkspaceRoot()).toBe("/tmp/openui-default-root");
		expect(constants.getGeminiSidecarPath().length).toBeGreaterThan(0);
	});
});

describe("logger targeted branch coverage", () => {
	it("throws when secure no-follow append is unsupported", async () => {
		const logger = await loadLogger();
		expect(() =>
			logger.getAppendNoFollowFlagsOrThrow({ platform: "win32", oNoFollow: 0 }),
		).toThrow(/unsupported on platform win32/);
	});

	it("uses incremented rotated suffix when first timestamped candidate already exists", async () => {
		const logger = await loadLogger();
		const logDir = mkRuntimeLogDir("openui-logger-coverage-suffix-");
		fs.mkdirSync(logDir, { recursive: true });
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

		fs.writeFileSync(
			path.join(logDir, "runtime.2026-01-01T00-00-00-000Z.jsonl"),
			"taken",
			"utf8",
		);

		const rotatedPath = logger.__test__.buildRotatedLogFilePath(logDir);
		expect(path.basename(rotatedPath)).toBe(
			"runtime.2026-01-01T00-00-00-000Z.1.jsonl",
		);
	});

	it("covers rotateOnStart true branch when active log exceeds max size", async () => {
		const workspaceRoot = mkRuntimeWorkspaceRoot("openui-logger-coverage-rotate-");
		const logDir = path.join(
			workspaceRoot,
			".runtime-cache",
			"runs",
			TEST_RUN_ID,
			"logs",
		);
		fs.mkdirSync(logDir, { recursive: true });
		const activePath = path.join(logDir, "runtime.jsonl");
		fs.writeFileSync(activePath, "x".repeat(256), "utf8");
		setupLoggerEnv(workspaceRoot);
		process.env.OPENUI_MCP_LOG_ROTATE_ON_START = "on";
		process.env.OPENUI_MCP_LOG_MAX_FILE_MB = "0.0001";

		const logger = await loadLogger();
		logger.logInfo("rotate-on-start-branch");

		const rotatedFiles = fs
			.readdirSync(logDir)
			.filter((entry) => /^runtime\..+\.jsonl$/.test(entry));
		expect(rotatedFiles.some((entry) => entry !== "runtime.jsonl")).toBe(
			true,
		);
	});

	it("covers cache cleanup short-circuit when cleanup is not due", async () => {
		const workspaceRoot = mkRuntimeWorkspaceRoot(
			"openui-logger-coverage-cache-not-due-",
		);
		setupLoggerEnv(workspaceRoot);

		const isCacheCleanupDue = vi.fn(() => false);
		const pruneCacheDirectorySync = vi.fn();
		const resolveCacheRetentionConfigFromEnv = vi.fn(() => ({
			cacheDir: path.join(workspaceRoot, ".runtime-cache", "cache"),
			nowMs: Date.now(),
			cleanIntervalMinutes: 30,
			maxBytes: 1024 * 1024,
			retentionDays: 7,
		}));

		vi.doMock("../packages/runtime-observability/src/cache-retention.js", () => ({
			isCacheCleanupDue,
			pruneCacheDirectorySync,
			resolveCacheRetentionConfigFromEnv,
		}));

		const logger = await loadLogger();
		logger.logInfo("cache-not-due");

		expect(isCacheCleanupDue).toHaveBeenCalledTimes(1);
		expect(pruneCacheDirectorySync).not.toHaveBeenCalled();
	});

	it("covers symlink guard path in file sink writes", async () => {
		const workspaceRoot = mkRuntimeWorkspaceRoot("openui-logger-coverage-symlink-");
		const logDir = path.join(
			workspaceRoot,
			".runtime-cache",
			"runs",
			TEST_RUN_ID,
			"logs",
		);
		fs.mkdirSync(logDir, { recursive: true });
		setupLoggerEnv(workspaceRoot);

		const target = path.join(logDir, "target.log");
		const activePath = path.join(logDir, "runtime.jsonl");
		fs.writeFileSync(target, "target", "utf8");
		fs.symlinkSync(target, activePath);

		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);

		const logger = await loadLogger();
		logger.logInfo("symlink-guard");

		const payloads = stderrSpy.mock.calls
			.map(([line]) => JSON.parse(String(line)) as { context?: string })
			.filter((payload) => payload.context === "write_file_sink");
		expect(payloads.length).toBeGreaterThanOrEqual(1);
	});

	it("covers shouldLog false and stderr/both output branches", async () => {
		const workspaceRoot = mkRuntimeWorkspaceRoot("openui-logger-coverage-output-");
		const logDir = path.join(
			workspaceRoot,
			".runtime-cache",
			"runs",
			TEST_RUN_ID,
			"logs",
		);
		setupLoggerEnv(workspaceRoot);
		process.env.OPENUI_MCP_LOG_LEVEL = "error";
		process.env.OPENUI_MCP_LOG_OUTPUT = "stderr";

		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const logger = await loadLogger();

		logger.logInfo("below-threshold-ignored");
		expect(stderrSpy).toHaveBeenCalledTimes(0);

		process.env.OPENUI_MCP_LOG_LEVEL = "debug";
		logger.logInfo("stderr-only");
		expect(stderrSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

		process.env.OPENUI_MCP_LOG_OUTPUT = "both";
		logger.logInfo("stderr-and-file");
		expect(fs.existsSync(path.join(logDir, "runtime.jsonl"))).toBe(true);
	});
});

describe("review heuristics dialog targeted branches", () => {
	it("covers dialog fallback paths for missing close tag and missing focus clues", () => {
		const result = evaluateDialogHeuristics(
			"<section><div role='dialog'>No focusables and no close tag",
		);
		expect(result).toEqual({
			missingEscClosePath: true,
			missingInitialFocusClue: true,
			focusTrapRisk: false,
		});
	});

	it("covers default control name fallback when control tag parsing fails", () => {
		expect(hasAssociatedControlLabel("<div></div>", "", 0)).toBe(false);
	});
});

describe("review heuristics targeted branches", () => {
	it("covers rgb alpha default branch and explicit border-color branch", () => {
		expect(
			reviewHeuristicsInternals.parseRgbFunctionColor("rgb(10, 20, 30)"),
		).toEqual({
			r: 10,
			g: 20,
			b: 30,
		});
		expect(
			reviewHeuristicsInternals.readInlineCssBorderColor(
				"border-color:#111; border: 1px solid #fff;",
			),
		).toEqual({ r: 17, g: 17, b: 17 });
	});

	it("covers touch-target fallback chain for width/height attributes and class tokens", () => {
		expect(
			evaluateTouchTargetHeuristic(`
				<button width="26" height="26">Attr fallback</button>
				<button class="w-6 h-6">Tailwind fallback</button>
				<button>No explicit size</button>
			`),
		).toEqual({
			wcagFailure: false,
			recommendedGap: true,
		});
		expect(evaluateTouchTargetHeuristic("<div>no interactive</div>")).toEqual({
			wcagFailure: false,
			recommendedGap: false,
		});
	});

	it("covers focus and skip-link guard branches", () => {
		expect(hasFocusIndicatorSuppressedHeuristic("<div>plain</div>")).toBe(
			false,
		);
		expect(
			hasFocusIndicatorSuppressedHeuristic(
				"<button style='outline:none'>x</button>",
			),
		).toBe(true);
		expect(hasFocusIndicatorSuppressedHeuristic("<button>plain</button>")).toBe(
			false,
		);

		expect(hasMissingSkipLinkHeuristic("<section>no main</section>")).toBe(
			false,
		);
		expect(
			hasMissingSkipLinkHeuristic("<main id='content'>main only</main>"),
		).toBe(false);
		expect(
			reviewHeuristicsInternals.hasFocusObscuredHeuristic(
				"<a href='#section'>Jump</a><section id='section'>Target</section>",
			),
		).toBe(false);
		expect(
			hasMissingSkipLinkHeuristic(`
				<nav><a href="#other">Skip wrong target</a></nav>
				<main id="content">Main</main>
			`),
		).toBe(true);
	});

	it("covers style/class empty branches and spacing token negative paths", () => {
		expect(
			reviewHeuristicsInternals.listStyleValues(
				"<div style=''></div><style> </style>",
			),
		).toEqual([]);
		expect(
			reviewHeuristicsInternals.readTailwindSpacingClassValuePx("gap-3", [
				"gap",
			]),
		).toBe(12);
		expect(
			hasNonScaleSpacingHeuristic("<div class='gap-[16px] gap-auto'></div>"),
		).toBe(false);
		expect(hasNonScaleSpacingHeuristic("<div class='gap-[14px]'></div>")).toBe(
			true,
		);
		expect(hasNonScaleSpacingHeuristic("<div class='gap-2.5'></div>")).toBe(
			true,
		);
		expect(hasPrimaryActionOverloadHeuristic("<div>No action tags</div>")).toBe(
			false,
		);
	});

	it("covers text/non-text contrast continue branches for missing style tokens", () => {
		expect(
			hasInsufficientStaticTextContrastHeuristic(
				"<p style='color:#000; background:#fff'><span></span></p>",
			),
		).toBe(false);
		expect(
			hasInsufficientStaticTextContrastHeuristic(
				"<p style='color:#000'>Text</p>",
			),
		).toBe(false);

		expect(
			hasInsufficientStaticNonTextContrastHeuristic("<div>none</div>"),
		).toBe(false);
		expect(
			hasInsufficientStaticNonTextContrastHeuristic("<button>plain</button>"),
		).toBe(false);
		expect(
			hasInsufficientStaticNonTextContrastHeuristic(
				"<button style='border:1px solid #000'>border only</button>",
			),
		).toBe(false);
	});
});
