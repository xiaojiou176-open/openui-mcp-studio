import fs from "node:fs";
import path from "node:path";
import {
	getOpenuiMcpLogDirWithinWorkspace,
	getOpenuiMcpLogLevel,
	getOpenuiMcpLogMaxFileMb,
	getOpenuiMcpLogOutput,
	getOpenuiMcpLogRetentionDays,
	getOpenuiMcpLogRotateOnStart,
} from "./constants.js";
import {
	isCacheCleanupDue,
	pruneCacheDirectorySync,
	resolveCacheRetentionConfigFromEnv,
} from "../../../packages/runtime-observability/src/cache-retention.js";
import { redactSensitiveMeta } from "../../../packages/runtime-observability/src/redact.js";
import { resolveRuntimeRunId } from "../../../packages/runtime-observability/src/run-context.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};
const ACTIVE_LOG_FILE_NAME = "runtime.jsonl";
const ROTATED_LOG_PREFIX = "runtime.";
const LOG_FILE_SUFFIX = ".jsonl";
const BYTES_PER_MB = 1024 * 1024;
const NOFOLLOW_SUPPORTED_PLATFORMS: readonly NodeJS.Platform[] = [
	"linux",
	"darwin",
];

type FileSinkState = {
	activeFilePath: string;
	currentBytes: number;
	disabled: boolean;
	logDir: string;
	maxBytes: number;
	retentionDays: number;
	rotateOnStart: boolean;
};

let fileSinkState: FileSinkState | null = null;
let lastCacheCleanupAttemptAtMs: number | null = null;
let cachedRuntimeRunId: string | null = null;

function getRuntimeRunId(): string {
	if (cachedRuntimeRunId) {
		return cachedRuntimeRunId;
	}
	// Runtime logs are run-scoped under .runtime-cache/runs/<run_id>/logs/runtime.jsonl.
	cachedRuntimeRunId = resolveRuntimeRunId(process.env);
	return cachedRuntimeRunId;
}

export function isNoFollowAppendProtectionSupported(options?: {
	platform?: NodeJS.Platform;
	oNoFollow?: number;
}): boolean {
	const platform = options?.platform ?? process.platform;
	const oNoFollow = options?.oNoFollow ?? fs.constants.O_NOFOLLOW;
	return (
		NOFOLLOW_SUPPORTED_PLATFORMS.includes(platform) &&
		typeof oNoFollow === "number" &&
		Number.isInteger(oNoFollow) &&
		oNoFollow > 0
	);
}

export function getAppendNoFollowFlagsOrThrow(options?: {
	platform?: NodeJS.Platform;
	oNoFollow?: number;
}): number {
	const platform = options?.platform ?? process.platform;
	const oNoFollow = options?.oNoFollow ?? fs.constants.O_NOFOLLOW;
	if (
		!isNoFollowAppendProtectionSupported({
			platform,
			oNoFollow,
		})
	) {
		throw new Error(
			`Secure no-follow log writes are unsupported on platform ${platform}; refusing to write to avoid symlink race.`,
		);
	}

	return (
		fs.constants.O_APPEND |
		fs.constants.O_CREAT |
		fs.constants.O_WRONLY |
		oNoFollow
	);
}

function shouldLog(level: LogLevel): boolean {
	const threshold = getOpenuiMcpLogLevel();
	return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[threshold];
}

function writeStderrLine(line: string): void {
	process.stderr.write(line);
}

function writeLoggerInternalError(error: unknown, context: string): void {
	const payload = {
		ts: new Date().toISOString(),
		level: "error",
		event: "logger_internal_error",
		runId: getRuntimeRunId(),
		traceId: "logger_internal_error",
		requestId: "logger_internal_error",
		service: "mcp-server",
		component: "logger",
		stage: "runtime",
		context,
		error: error instanceof Error ? error.message : String(error),
	};
	writeStderrLine(`${JSON.stringify(payload)}\n`);
}

function buildRotatedLogFilePath(logDir: string): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	let index = 0;

	while (true) {
		const suffix = index === 0 ? "" : `.${index}`;
		const candidate = path.join(
			logDir,
			`${ROTATED_LOG_PREFIX}${timestamp}${suffix}${LOG_FILE_SUFFIX}`,
		);
		if (!fs.existsSync(candidate)) {
			return candidate;
		}
		index += 1;
	}
}

function rotateActiveLogFile(state: FileSinkState): void {
	if (!fs.existsSync(state.activeFilePath)) {
		state.currentBytes = 0;
		return;
	}

	fs.renameSync(state.activeFilePath, buildRotatedLogFilePath(state.logDir));
	state.currentBytes = 0;
}

function pruneExpiredLogFiles(state: FileSinkState): void {
	const cutoffMs = Date.now() - state.retentionDays * 24 * 60 * 60 * 1000;

	for (const entry of fs.readdirSync(state.logDir)) {
		if (
			!entry.startsWith(ROTATED_LOG_PREFIX) ||
			!entry.endsWith(LOG_FILE_SUFFIX)
		) {
			continue;
		}

		const entryPath = path.join(state.logDir, entry);
		if (entryPath === state.activeFilePath) {
			continue;
		}

		let stat: fs.Stats;
		try {
			stat = fs.statSync(entryPath);
		} catch {
			continue;
		}

		if (!stat.isFile()) {
			continue;
		}

		if (stat.mtimeMs < cutoffMs) {
			fs.unlinkSync(entryPath);
		}
	}
}

function initializeFileSink(): FileSinkState {
	const logDir = getOpenuiMcpLogDirWithinWorkspace();
	fs.mkdirSync(logDir, { recursive: true });

	const activeFilePath = path.join(logDir, ACTIVE_LOG_FILE_NAME);
	const maxBytes = Math.max(
		1,
		Math.floor(getOpenuiMcpLogMaxFileMb() * BYTES_PER_MB),
	);
	const state: FileSinkState = {
		activeFilePath,
		currentBytes: 0,
		disabled: false,
		logDir,
		maxBytes,
		retentionDays: getOpenuiMcpLogRetentionDays(),
		rotateOnStart: getOpenuiMcpLogRotateOnStart() === "on",
	};

	if (fs.existsSync(activeFilePath)) {
		const stat = fs.statSync(activeFilePath);
		state.currentBytes = stat.size;
	}

	if (state.rotateOnStart && state.currentBytes > state.maxBytes) {
		rotateActiveLogFile(state);
	}

	pruneExpiredLogFiles(state);
	return state;
}

function getFileSinkState(): FileSinkState {
	if (fileSinkState) {
		return fileSinkState;
	}

	try {
		fileSinkState = initializeFileSink();
		return fileSinkState;
	} catch (error) {
		writeLoggerInternalError(error, "initialize_file_sink");
		fileSinkState = {
			activeFilePath: "",
			currentBytes: 0,
			disabled: true,
			logDir: "",
			maxBytes: 0,
			retentionDays: 0,
			rotateOnStart: false,
		};
		return fileSinkState;
	}
}

function maybeRunCacheCleanup(): void {
	let config: ReturnType<typeof resolveCacheRetentionConfigFromEnv>;
	try {
		config = resolveCacheRetentionConfigFromEnv();
	} catch (error) {
		writeLoggerInternalError(error, "resolve_cache_retention_config");
		return;
	}

	if (
		!isCacheCleanupDue(
			lastCacheCleanupAttemptAtMs,
			config.nowMs,
			config.cleanIntervalMinutes,
		)
	) {
		return;
	}

	lastCacheCleanupAttemptAtMs = config.nowMs;

	try {
		pruneCacheDirectorySync(config);
	} catch (error) {
		writeLoggerInternalError(error, "prune_cache_directory");
	}
}

function writeFileLine(line: string): void {
	const state = getFileSinkState();
	if (state.disabled) {
		return;
	}

	maybeRunCacheCleanup();

	const lineBytes = Buffer.byteLength(line);
	try {
		const appendFlags = getAppendNoFollowFlagsOrThrow();

		if (fs.existsSync(state.activeFilePath)) {
			const stat = fs.lstatSync(state.activeFilePath);
			if (stat.isSymbolicLink()) {
				throw new Error(
					`Refusing to write log via symlink: ${state.activeFilePath}`,
				);
			}
		}

		if (
			state.currentBytes > 0 &&
			state.currentBytes + lineBytes > state.maxBytes
		) {
			rotateActiveLogFile(state);
		}

		const fd = fs.openSync(state.activeFilePath, appendFlags, 0o600);
		try {
			fs.writeSync(fd, line, undefined, "utf8");
		} finally {
			fs.closeSync(fd);
		}
		state.currentBytes += lineBytes;
	} catch (error) {
		state.disabled = true;
		writeLoggerInternalError(error, "write_file_sink");
	}
}

function log(level: LogLevel, event: string, meta?: Record<string, unknown>) {
	if (!shouldLog(level)) {
		return;
	}

	const cleanedMeta = redactSensitiveMeta(meta) || {};
	const payload = {
		ts: new Date().toISOString(),
		level,
		event,
		runId: String(cleanedMeta.runId ?? getRuntimeRunId()),
		traceId: String(
			cleanedMeta.traceId ?? cleanedMeta.requestId ?? getRuntimeRunId(),
		),
		requestId: String(
			cleanedMeta.requestId ?? cleanedMeta.traceId ?? getRuntimeRunId(),
		),
		service: String(cleanedMeta.service ?? "mcp-server"),
		component: String(cleanedMeta.component ?? "runtime"),
		stage: String(cleanedMeta.stage ?? "runtime"),
		context:
			typeof cleanedMeta.context === "object" && cleanedMeta.context !== null
				? cleanedMeta.context
				: {},
		...cleanedMeta,
	};
	const line = `${JSON.stringify(payload)}\n`;
	const output = getOpenuiMcpLogOutput();

	if (output === "stderr" || output === "both") {
		writeStderrLine(line);
	}
	if (output === "file" || output === "both") {
		writeFileLine(line);
	}
}

export function logDebug(event: string, meta?: Record<string, unknown>) {
	log("debug", event, meta);
}

export function logInfo(event: string, meta?: Record<string, unknown>) {
	log("info", event, meta);
}

export function logWarn(event: string, meta?: Record<string, unknown>) {
	log("warn", event, meta);
}

export function logError(event: string, meta?: Record<string, unknown>) {
	log("error", event, meta);
}

export const __test__ = {
	buildRotatedLogFilePath,
	rotateActiveLogFile,
	pruneExpiredLogFiles,
};
