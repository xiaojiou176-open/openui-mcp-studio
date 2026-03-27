import fs from "node:fs";
import path from "node:path";
import { resolveEnvDefaultValue } from "../../../packages/contracts/src/env-contract.js";
import {
	resolveRuntimeLogFilePath,
	resolveRuntimeRunId,
} from "../../../packages/runtime-observability/src/run-context.js";
import { parseChildEnvAllowlist } from "../../../packages/shared-runtime/src/child-env.js";
import { isPathInsideRootWithRealpath } from "../../../packages/shared-runtime/src/path-utils.js";

export const DEFAULT_GEMINI_MODEL = String(
	resolveEnvDefaultValue("GEMINI_MODEL"),
);
export const DEFAULT_GEMINI_MODEL_FAST = String(
	resolveEnvDefaultValue("GEMINI_MODEL_FAST"),
);
export const DEFAULT_GEMINI_MODEL_STRONG = String(
	resolveEnvDefaultValue("GEMINI_MODEL_STRONG"),
);
export const DEFAULT_GEMINI_MODEL_EMBEDDING = String(
	resolveEnvDefaultValue("GEMINI_MODEL_EMBEDDING"),
);
export const DEFAULT_GEMINI_DEFAULT_THINKING_LEVEL = String(
	resolveEnvDefaultValue("GEMINI_DEFAULT_THINKING_LEVEL"),
);
export const DEFAULT_GEMINI_DEFAULT_TEMPERATURE = Number(
	resolveEnvDefaultValue("GEMINI_DEFAULT_TEMPERATURE"),
);
export const DEFAULT_OPENUI_MODEL_ROUTING = String(
	resolveEnvDefaultValue("OPENUI_MODEL_ROUTING"),
);
export const DEFAULT_WORKSPACE_ROOT = String(
	resolveEnvDefaultValue("OPENUI_MCP_WORKSPACE_ROOT"),
);
export const DEFAULT_OPENUI_MCP_LOG_LEVEL = String(
	resolveEnvDefaultValue("OPENUI_MCP_LOG_LEVEL"),
);
export const DEFAULT_OPENUI_MCP_LOG_OUTPUT = String(
	resolveEnvDefaultValue("OPENUI_MCP_LOG_OUTPUT"),
);
export const DEFAULT_OPENUI_MCP_LOG_ROTATE_ON_START = String(
	resolveEnvDefaultValue("OPENUI_MCP_LOG_ROTATE_ON_START"),
);
export const DEFAULT_OPENUI_MCP_LOG_DIR = String(
	resolveEnvDefaultValue("OPENUI_MCP_LOG_DIR"),
);
export const DEFAULT_OPENUI_MCP_CACHE_DIR = String(
	resolveEnvDefaultValue("OPENUI_MCP_CACHE_DIR"),
);
export const DEFAULT_OPENUI_MCP_LOG_RETENTION_DAYS = Number(
	resolveEnvDefaultValue("OPENUI_MCP_LOG_RETENTION_DAYS"),
);
export const DEFAULT_OPENUI_MCP_LOG_MAX_FILE_MB = Number(
	resolveEnvDefaultValue("OPENUI_MCP_LOG_MAX_FILE_MB"),
);
export const DEFAULT_OPENUI_TIMEOUT_MS = Number(
	resolveEnvDefaultValue("OPENUI_TIMEOUT_MS"),
);
export const DEFAULT_OPENUI_MAX_RETRIES = Number(
	resolveEnvDefaultValue("OPENUI_MAX_RETRIES"),
);
export const DEFAULT_OPENUI_RETRY_BASE_MS = Number(
	resolveEnvDefaultValue("OPENUI_RETRY_BASE_MS"),
);
export const DEFAULT_OPENUI_QUEUE_CONCURRENCY = Number(
	resolveEnvDefaultValue("OPENUI_QUEUE_CONCURRENCY"),
);
export const DEFAULT_OPENUI_QUEUE_MAX_PENDING = Number(
	resolveEnvDefaultValue("OPENUI_QUEUE_MAX_PENDING"),
);
export const DEFAULT_OPENUI_IDEMPOTENCY_TTL_MINUTES = Number(
	resolveEnvDefaultValue("OPENUI_IDEMPOTENCY_TTL_MINUTES"),
);
export const DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES = Number(
	resolveEnvDefaultValue("OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES"),
);
export const DEFAULT_OPENUI_MCP_CACHE_RETENTION_DAYS = Number(
	resolveEnvDefaultValue("OPENUI_MCP_CACHE_RETENTION_DAYS"),
);
export const DEFAULT_OPENUI_MCP_CACHE_MAX_BYTES = Number(
	resolveEnvDefaultValue("OPENUI_MCP_CACHE_MAX_BYTES"),
);
export const DEFAULT_OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES = Number(
	resolveEnvDefaultValue("OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES"),
);

export const MCP_SERVER_VERSION = "0.3.0";

export const DEFAULT_APP_WEB_ROOT = "apps/web";
export const DEFAULT_PAGE_PATH = `${DEFAULT_APP_WEB_ROOT}/app/page.tsx`;
export const DEFAULT_COMPONENTS_DIR = `${DEFAULT_APP_WEB_ROOT}/components/generated`;

export type OpenuiModelRoutingMode = "on" | "off";
export type OpenuiModelRouteKey = "fast" | "strong";
export type OpenuiResolvedModelSource =
	| "explicit"
	| "route"
	| "default"
	| "primary";
export type OpenuiMcpLogLevel = "debug" | "info" | "warn" | "error";
export type OpenuiMcpLogOutput = "stderr" | "file" | "both";
export type OpenuiMcpLogRotateOnStart = "on" | "off";
export type GeminiThinkingLevel = "low" | "high";

export type OpenuiModelResolution = {
	routeKey: OpenuiModelRouteKey | null;
	resolvedModel: string;
	source: OpenuiResolvedModelSource;
	routingMode: OpenuiModelRoutingMode;
};

let cachedWorkspaceRoot: {
	cacheKey: string;
	resolved: string;
} | null = null;

function assertFinitePositiveNumber(value: number, label: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must resolve to a positive number.`);
	}
}

function assertFinitePositiveInteger(value: number, label: string): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${label} must resolve to a positive integer.`);
	}
}

function assertFiniteNonNegativeInteger(value: number, label: string): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${label} must resolve to a non-negative integer.`);
	}
}

function requirePositiveNumberFromEnv(
	envName: string,
	fallback: number,
): number {
	assertFinitePositiveNumber(fallback, `${envName} default`);
	const raw = process.env[envName];
	if (raw === undefined || raw.trim() === "") {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(
			`${envName} must be a positive number, received: ${JSON.stringify(raw)}.`,
		);
	}

	return parsed;
}

function requireNonNegativeIntegerFromEnv(
	envName: string,
	fallback: number,
): number {
	assertFiniteNonNegativeInteger(fallback, `${envName} default`);
	const raw = process.env[envName];
	if (raw === undefined || raw.trim() === "") {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(
			`${envName} must be a non-negative integer, received: ${JSON.stringify(raw)}.`,
		);
	}

	return parsed;
}

function requirePositiveIntegerFromEnv(
	envName: string,
	fallback: number,
): number {
	assertFinitePositiveInteger(fallback, `${envName} default`);
	const raw = process.env[envName];
	if (raw === undefined || raw.trim() === "") {
		return fallback;
	}

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(
			`${envName} must be a positive integer, received: ${JSON.stringify(raw)}.`,
		);
	}

	return parsed;
}

export function getGeminiApiKey(): string {
	const key = process.env.GEMINI_API_KEY?.trim();
	if (key) {
		return key;
	}

	throw new Error("GEMINI_API_KEY must be configured and non-empty.");
}

export function getGeminiModel(): {
	model: string;
	source: OpenuiResolvedModelSource;
} {
	const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
	return {
		model,
		source: process.env.GEMINI_MODEL?.trim() ? "primary" : "default",
	};
}

export function getGeminiModelFast(): {
	model: string;
	source: OpenuiResolvedModelSource;
} {
	const model =
		process.env.GEMINI_MODEL_FAST?.trim() || DEFAULT_GEMINI_MODEL_FAST;
	return {
		model,
		source: process.env.GEMINI_MODEL_FAST?.trim() ? "primary" : "default",
	};
}

export function getGeminiModelStrong(): {
	model: string;
	source: OpenuiResolvedModelSource;
} {
	const raw = process.env.GEMINI_MODEL_STRONG;
	if (raw !== undefined && raw.trim() === "") {
		return {
			model: getGeminiModel().model,
			source: "default",
		};
	}

	const model = raw?.trim() || DEFAULT_GEMINI_MODEL_STRONG;
	return {
		model,
		source: raw?.trim() ? "primary" : "default",
	};
}

export function getGeminiModelEmbedding(): string {
	return (
		process.env.GEMINI_MODEL_EMBEDDING?.trim() || DEFAULT_GEMINI_MODEL_EMBEDDING
	);
}

export function getGeminiDefaultThinkingLevel(): GeminiThinkingLevel {
	const raw = process.env.GEMINI_DEFAULT_THINKING_LEVEL;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_GEMINI_DEFAULT_THINKING_LEVEL as GeminiThinkingLevel;
	}

	const normalized = raw.trim().toLowerCase();
	if (normalized === "low" || normalized === "high") {
		return normalized;
	}

	throw new Error(
		`GEMINI_DEFAULT_THINKING_LEVEL must be "low" or "high", received: ${JSON.stringify(raw)}.`,
	);
}

export function getGeminiDefaultTemperature(): number {
	return requirePositiveNumberFromEnv(
		"GEMINI_DEFAULT_TEMPERATURE",
		DEFAULT_GEMINI_DEFAULT_TEMPERATURE,
	);
}

export function getOpenuiModel(): string {
	return getGeminiModel().model;
}

export function getOpenuiModelFast(): string {
	return getGeminiModelFast().model;
}

export function getOpenuiModelStrong(): string {
	return getGeminiModelStrong().model;
}

export function getOpenuiModelRoutingMode(): OpenuiModelRoutingMode {
	const raw = process.env.OPENUI_MODEL_ROUTING;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_OPENUI_MODEL_ROUTING as OpenuiModelRoutingMode;
	}

	const normalized = raw.trim().toLowerCase();
	if (normalized === "on" || normalized === "off") {
		return normalized;
	}

	throw new Error(
		`OPENUI_MODEL_ROUTING must be "on" or "off", received: ${JSON.stringify(raw)}.`,
	);
}

export function resolveOpenuiModel(input: {
	explicitModel?: string;
	routeKey?: OpenuiModelRouteKey;
	useFast?: boolean;
}): OpenuiModelResolution {
	const routeKey = input.routeKey ?? null;
	const routingMode = getOpenuiModelRoutingMode();
	const manualModel = input.explicitModel?.trim();

	if (manualModel) {
		return {
			routeKey,
			resolvedModel: manualModel,
			source: "explicit",
			routingMode,
		};
	}

	const explicitFast = input.useFast === true || routeKey === "fast";
	if (routingMode === "on" && explicitFast) {
		const fast = getGeminiModelFast();
		return {
			routeKey,
			resolvedModel: fast.model,
			source: "route",
			routingMode,
		};
	}

	if (routingMode === "on" && routeKey === "strong") {
		const strong = getGeminiModelStrong();
		return {
			routeKey,
			resolvedModel: strong.model,
			source: "route",
			routingMode,
		};
	}

	const fallback = getGeminiModel();
	return {
		routeKey,
		resolvedModel: fallback.model,
		source: fallback.source,
		routingMode,
	};
}

export function getWorkspaceRoot(): string {
	const raw = process.env.OPENUI_MCP_WORKSPACE_ROOT;
	const trimmed = raw?.trim();
	const cacheKey = `${process.cwd()}::${raw ?? ""}`;
	if (cachedWorkspaceRoot?.cacheKey === cacheKey) {
		return cachedWorkspaceRoot.resolved;
	}
	const resolved = trimmed ? path.resolve(trimmed) : DEFAULT_WORKSPACE_ROOT;

	let stat: fs.Stats;
	try {
		stat = fs.statSync(resolved);
	} catch {
		throw new Error(
			`OPENUI_MCP_WORKSPACE_ROOT must point to an existing directory, received: ${JSON.stringify(
				raw,
			)}.`,
		);
	}

	if (!stat.isDirectory()) {
		throw new Error(
			`OPENUI_MCP_WORKSPACE_ROOT must point to a directory, received: ${JSON.stringify(raw)}.`,
		);
	}

	const canonical = fs.realpathSync(resolved);
	cachedWorkspaceRoot = { cacheKey, resolved: canonical };
	return canonical;
}

export function getOpenuiMcpLogLevel(): OpenuiMcpLogLevel {
	const raw = process.env.OPENUI_MCP_LOG_LEVEL;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_OPENUI_MCP_LOG_LEVEL as OpenuiMcpLogLevel;
	}

	const normalized = raw.trim().toLowerCase();
	if (
		normalized === "debug" ||
		normalized === "info" ||
		normalized === "warn" ||
		normalized === "error"
	) {
		return normalized;
	}

	throw new Error(
		`OPENUI_MCP_LOG_LEVEL must be one of "debug" | "info" | "warn" | "error", received: ${JSON.stringify(raw)}.`,
	);
}

export function getOpenuiMcpLogOutput(): OpenuiMcpLogOutput {
	const raw = process.env.OPENUI_MCP_LOG_OUTPUT;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_OPENUI_MCP_LOG_OUTPUT as OpenuiMcpLogOutput;
	}

	const normalized = raw.trim().toLowerCase();
	if (
		normalized === "stderr" ||
		normalized === "file" ||
		normalized === "both"
	) {
		return normalized;
	}

	throw new Error(
		`OPENUI_MCP_LOG_OUTPUT must be one of "stderr" | "file" | "both", received: ${JSON.stringify(raw)}.`,
	);
}

export function getOpenuiMcpLogRotateOnStart(): OpenuiMcpLogRotateOnStart {
	const raw = process.env.OPENUI_MCP_LOG_ROTATE_ON_START;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_OPENUI_MCP_LOG_ROTATE_ON_START as OpenuiMcpLogRotateOnStart;
	}

	const normalized = raw.trim().toLowerCase();
	if (normalized === "on" || normalized === "off") {
		return normalized;
	}

	throw new Error(
		`OPENUI_MCP_LOG_ROTATE_ON_START must be "on" or "off", received: ${JSON.stringify(raw)}.`,
	);
}

export function getOpenuiMcpLogDir(): string {
	const workspaceRoot = getWorkspaceRoot();
	const runId = resolveRuntimeRunId(process.env);
	return path.dirname(resolveRuntimeLogFilePath(workspaceRoot, runId, "runtime"));
}

export function getOpenuiMcpCacheDir(): string {
	const raw = process.env.OPENUI_MCP_CACHE_DIR;
	const trimmed = raw?.trim();
	const workspaceRoot = getWorkspaceRoot();
	const candidate = trimmed || DEFAULT_OPENUI_MCP_CACHE_DIR;
	return path.isAbsolute(candidate)
		? path.resolve(candidate)
		: path.resolve(workspaceRoot, candidate);
}

function resolveRuntimeDirWithinWorkspace(
	envName: "OPENUI_MCP_LOG_DIR" | "OPENUI_MCP_CACHE_DIR",
	defaultDir: string,
): string {
	const raw = process.env[envName];
	const trimmed = raw?.trim();
	const workspaceRoot = getWorkspaceRoot();
	const candidate = trimmed || defaultDir;
	const resolved = path.isAbsolute(candidate)
		? path.resolve(candidate)
		: path.resolve(workspaceRoot, candidate);
	if (!isPathInsideRootWithRealpath(workspaceRoot, resolved)) {
		throw new Error(
			`${envName} must resolve inside OPENUI_MCP_WORKSPACE_ROOT (${workspaceRoot}), received: ${JSON.stringify(
				raw,
			)}.`,
		);
	}
	return resolved;
}

export function getOpenuiMcpLogDirWithinWorkspace(): string {
	return getOpenuiMcpLogDir();
}

export function getOpenuiMcpCacheDirWithinWorkspace(): string {
	return resolveRuntimeDirWithinWorkspace(
		"OPENUI_MCP_CACHE_DIR",
		DEFAULT_OPENUI_MCP_CACHE_DIR,
	);
}

export function getOpenuiMcpLogRetentionDays(): number {
	return requirePositiveIntegerFromEnv(
		"OPENUI_MCP_LOG_RETENTION_DAYS",
		DEFAULT_OPENUI_MCP_LOG_RETENTION_DAYS,
	);
}

export function getOpenuiMcpLogMaxFileMb(): number {
	return requirePositiveNumberFromEnv(
		"OPENUI_MCP_LOG_MAX_FILE_MB",
		DEFAULT_OPENUI_MCP_LOG_MAX_FILE_MB,
	);
}

export function getOpenuiTimeoutMs(): number {
	return requirePositiveNumberFromEnv(
		"OPENUI_TIMEOUT_MS",
		DEFAULT_OPENUI_TIMEOUT_MS,
	);
}

export function getOpenuiMaxRetries(): number {
	return requireNonNegativeIntegerFromEnv(
		"OPENUI_MAX_RETRIES",
		DEFAULT_OPENUI_MAX_RETRIES,
	);
}

export function getOpenuiRetryBaseMs(): number {
	return requirePositiveNumberFromEnv(
		"OPENUI_RETRY_BASE_MS",
		DEFAULT_OPENUI_RETRY_BASE_MS,
	);
}

export function getOpenuiQueueConcurrency(): number {
	return requirePositiveIntegerFromEnv(
		"OPENUI_QUEUE_CONCURRENCY",
		DEFAULT_OPENUI_QUEUE_CONCURRENCY,
	);
}

export function getOpenuiQueueMaxPending(): number {
	const raw = process.env.OPENUI_QUEUE_MAX_PENDING;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_OPENUI_QUEUE_MAX_PENDING;
	}

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return DEFAULT_OPENUI_QUEUE_MAX_PENDING;
	}

	return parsed;
}

export function getOpenuiIdempotencyTtlMinutes(): number {
	return requirePositiveIntegerFromEnv(
		"OPENUI_IDEMPOTENCY_TTL_MINUTES",
		DEFAULT_OPENUI_IDEMPOTENCY_TTL_MINUTES,
	);
}

export function getGeminiSidecarPythonBin(): string {
	return process.env.OPENUI_GEMINI_PYTHON_BIN?.trim() || "python3";
}

export function getGeminiSidecarPath(): string {
	const raw = process.env.OPENUI_GEMINI_SIDECAR_PATH?.trim();
	return path.resolve(
		raw || String(resolveEnvDefaultValue("OPENUI_GEMINI_SIDECAR_PATH")),
	);
}

export function getGeminiSidecarStdoutBufferMaxBytes(): number {
	const raw = process.env.OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES;
	if (raw === undefined || raw.trim() === "") {
		return DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES;
	}

	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return DEFAULT_OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES;
	}

	return parsed;
}

export function getOpenuiMcpCacheRetentionDays(): number {
	return requirePositiveIntegerFromEnv(
		"OPENUI_MCP_CACHE_RETENTION_DAYS",
		DEFAULT_OPENUI_MCP_CACHE_RETENTION_DAYS,
	);
}

export function getOpenuiMcpCacheMaxBytes(): number {
	return requirePositiveIntegerFromEnv(
		"OPENUI_MCP_CACHE_MAX_BYTES",
		DEFAULT_OPENUI_MCP_CACHE_MAX_BYTES,
	);
}

export function getOpenuiMcpCacheCleanIntervalMinutes(): number {
	return requirePositiveIntegerFromEnv(
		"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
		DEFAULT_OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES,
	);
}

export function validateOpenuiRuntimeConfig(): void {
	getGeminiApiKey();
	getGeminiModel();
	getGeminiModelFast();
	getGeminiModelStrong();
	getGeminiModelEmbedding();
	getGeminiDefaultThinkingLevel();
	getGeminiDefaultTemperature();
	getOpenuiModelRoutingMode();
	parseChildEnvAllowlist(process.env.OPENUI_MCP_CHILD_ENV_ALLOWLIST);
	getWorkspaceRoot();
	getOpenuiMcpLogLevel();
	getOpenuiMcpLogOutput();
	getOpenuiMcpLogRotateOnStart();
	getOpenuiMcpLogDirWithinWorkspace();
	getOpenuiMcpCacheDirWithinWorkspace();
	getOpenuiMcpLogRetentionDays();
	getOpenuiMcpLogMaxFileMb();
	getOpenuiTimeoutMs();
	getOpenuiMaxRetries();
	getOpenuiRetryBaseMs();
	getOpenuiQueueConcurrency();
	getOpenuiQueueMaxPending();
	getOpenuiIdempotencyTtlMinutes();
	getGeminiSidecarPythonBin();
	getGeminiSidecarPath();
	getGeminiSidecarStdoutBufferMaxBytes();
	getOpenuiMcpCacheRetentionDays();
	getOpenuiMcpCacheMaxBytes();
	getOpenuiMcpCacheCleanIntervalMinutes();
}

export function buildDefaultShadcnStyleGuide(uiImportBase: string): string {
	return `Target stack: React (Next.js App Router), TypeScript, Tailwind, shadcn/ui style.
Hard rules:
- Output MUST use Tailwind utility classes only (no CSS files, no inline style).
- Prefer using existing shadcn/ui primitives (Button/Card/Input/Label/Table/Dialog/Tabs/DropdownMenu/Badge/Skeleton/Separator/Tooltip).
- Accessibility by default: semantic HTML, aria attributes when needed, focus-visible ring, keyboard navigation.
- Responsive mobile-first layout with clear spacing scale (4/6/8/12/16/24/32/48/64).
- Support dark mode via Tailwind dark: classes.
- Visual style: clean modern layout, neutral base, one accent color, subtle borders and shadows.
- Split output into small reusable components; page should compose components instead of embedding everything.
Import rules:
- Import shadcn primitives from "${uiImportBase}/...".
- Business components should be generated under a separate directory, not inside shadcn primitive directory.`;
}

export const __test__ = {
	assertFinitePositiveNumber,
	assertFinitePositiveInteger,
	assertFiniteNonNegativeInteger,
};
