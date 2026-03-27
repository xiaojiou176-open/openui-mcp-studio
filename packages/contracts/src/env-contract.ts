export const OPENUI_ENV_KEYS = [
	"GEMINI_API_KEY",
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"GEMINI_MODEL_EMBEDDING",
	"GEMINI_DEFAULT_THINKING_LEVEL",
	"GEMINI_DEFAULT_TEMPERATURE",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MCP_WORKSPACE_ROOT",
	"OPENUI_TIMEOUT_MS",
	"OPENUI_MAX_RETRIES",
	"OPENUI_RETRY_BASE_MS",
	"OPENUI_MCP_LOG_LEVEL",
	"OPENUI_MCP_LOG_OUTPUT",
	"OPENUI_MCP_LOG_ROTATE_ON_START",
	"OPENUI_MCP_CHILD_ENV_ALLOWLIST",
	"OPENUI_MCP_LOG_DIR",
	"OPENUI_MCP_LOG_RETENTION_DAYS",
	"OPENUI_MCP_LOG_MAX_FILE_MB",
	"OPENUI_MCP_CACHE_DIR",
	"OPENUI_MCP_CACHE_RETENTION_DAYS",
	"OPENUI_MCP_CACHE_MAX_BYTES",
	"OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES",
	"OPENUI_QUEUE_CONCURRENCY",
	"OPENUI_QUEUE_MAX_PENDING",
	"OPENUI_IDEMPOTENCY_TTL_MINUTES",
	"OPENUI_GEMINI_PYTHON_BIN",
	"OPENUI_GEMINI_SIDECAR_PATH",
	"OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES",
] as const;

export type EnvKey = (typeof OPENUI_ENV_KEYS)[number];

type DefaultValue = string | number | (() => string);

export type EnvContractEntry = {
	defaultValue: DefaultValue;
	sensitive: boolean;
	description: string;
	validation: string;
};

export type EnvContract = Readonly<Record<EnvKey, EnvContractEntry>>;

export const OPENUI_ENV_CONTRACT: EnvContract = Object.freeze({
	GEMINI_API_KEY: {
		defaultValue: "",
		sensitive: true,
		description:
			"Primary Gemini API key. Required for Gemini-only runtime; source must be local .env or shell/CI environment variable.",
		validation:
			"Trimmed non-empty string from local .env or shell/CI environment variable.",
	},
	GEMINI_MODEL: {
		defaultValue: "gemini-3.1-pro-preview",
		sensitive: false,
		description:
			"Default Gemini model used when explicit model and route are absent.",
		validation: "Trimmed non-empty string when set.",
	},
	GEMINI_MODEL_FAST: {
		defaultValue: "gemini-3-flash-preview",
		sensitive: false,
		description: 'Gemini model used only for explicit "fast" route requests.',
		validation: "Trimmed non-empty string when set.",
	},
	GEMINI_MODEL_STRONG: {
		defaultValue: "gemini-3.1-pro-preview",
		sensitive: false,
		description: 'Gemini model used for "strong" route requests.',
		validation: "Trimmed string. Empty value falls back to GEMINI_MODEL.",
	},
	GEMINI_MODEL_EMBEDDING: {
		defaultValue: "gemini-embedding-001",
		sensitive: false,
		description: "Gemini embedding model used by embedding/RAG tools.",
		validation: "Trimmed non-empty string when set.",
	},
	GEMINI_DEFAULT_THINKING_LEVEL: {
		defaultValue: "high",
		sensitive: false,
		description: "Default reasoning depth for Gemini requests.",
		validation: "Enum: low | high. (minimal is intentionally unsupported)",
	},
	GEMINI_DEFAULT_TEMPERATURE: {
		defaultValue: 1.0,
		sensitive: false,
		description: "Default generation temperature for Gemini requests.",
		validation: "Positive number.",
	},
	OPENUI_MODEL_ROUTING: {
		defaultValue: "on",
		sensitive: false,
		description: "Route switch for fast/strong model selection.",
		validation: "Enum: on | off.",
	},
	OPENUI_MCP_WORKSPACE_ROOT: {
		defaultValue: () => process.cwd(),
		sensitive: false,
		description: "Workspace root used by filesystem-sensitive MCP tools.",
		validation: "Resolved path must exist and must be a directory.",
	},
	OPENUI_TIMEOUT_MS: {
		defaultValue: 45_000,
		sensitive: false,
		description: "Per-request model timeout in milliseconds.",
		validation: "Positive number.",
	},
	OPENUI_MAX_RETRIES: {
		defaultValue: 2,
		sensitive: false,
		description: "Maximum retriable attempts for Gemini requests.",
		validation: "Non-negative integer.",
	},
	OPENUI_RETRY_BASE_MS: {
		defaultValue: 450,
		sensitive: false,
		description: "Exponential backoff base delay in milliseconds.",
		validation: "Positive number.",
	},
	OPENUI_MCP_LOG_LEVEL: {
		defaultValue: "info",
		sensitive: false,
		description: "Server log verbosity threshold.",
		validation: "Enum: debug | info | warn | error.",
	},
	OPENUI_MCP_LOG_OUTPUT: {
		defaultValue: "both",
		sensitive: false,
		description: "Selects log sink output target.",
		validation: "Enum: stderr | file | both.",
	},
	OPENUI_MCP_LOG_ROTATE_ON_START: {
		defaultValue: "on",
		sensitive: false,
		description:
			"Controls startup-time rotation for oversized active log file.",
		validation: "Enum: on | off.",
	},
	OPENUI_MCP_CHILD_ENV_ALLOWLIST: {
		defaultValue: "",
		sensitive: false,
		description:
			"Comma-separated allowlist for environment variables passed to child processes.",
		validation:
			'Comma-separated env keys or prefix wildcards ending with "*" (for example: PATH,OPENUI_*). Empty uses baseline safe keys only.',
	},
	OPENUI_MCP_LOG_DIR: {
		defaultValue: ".runtime-cache/runs/<run_id>/logs/runtime.jsonl",
		sensitive: false,
		description:
			"Governed run-scoped MCP runtime log path. Callers must not redirect logs outside the repository runtime layout.",
		validation:
			"Governed run-scoped path token; arbitrary override is not part of the supported contract.",
	},
	OPENUI_MCP_LOG_RETENTION_DAYS: {
		defaultValue: 7,
		sensitive: false,
		description: "Number of days to retain MCP log files.",
		validation: "Positive integer.",
	},
	OPENUI_MCP_LOG_MAX_FILE_MB: {
		defaultValue: 10,
		sensitive: false,
		description: "Maximum size per MCP log file in megabytes.",
		validation: "Positive number.",
	},
	OPENUI_MCP_CACHE_DIR: {
		defaultValue: ".runtime-cache/cache",
		sensitive: false,
		description: "Directory for MCP runtime cache artifacts.",
		validation: "Non-empty path string.",
	},
	OPENUI_MCP_CACHE_RETENTION_DAYS: {
		defaultValue: 7,
		sensitive: false,
		description: "Number of days to retain MCP cache files.",
		validation: "Positive integer.",
	},
	OPENUI_MCP_CACHE_MAX_BYTES: {
		defaultValue: 104_857_600,
		sensitive: false,
		description: "Maximum total size for MCP cache files in bytes.",
		validation: "Positive integer.",
	},
	OPENUI_MCP_CACHE_CLEAN_INTERVAL_MINUTES: {
		defaultValue: 60,
		sensitive: false,
		description:
			"Minimum interval in minutes between runtime cache cleanup attempts.",
		validation: "Positive integer.",
	},
	OPENUI_QUEUE_CONCURRENCY: {
		defaultValue: 1,
		sensitive: false,
		description: "Concurrency for local ship job queue.",
		validation: "Positive integer.",
	},
	OPENUI_QUEUE_MAX_PENDING: {
		defaultValue: 128,
		sensitive: false,
		description: "Maximum pending jobs allowed in local ship queue.",
		validation: "Positive integer. Empty/invalid value falls back to default.",
	},
	OPENUI_IDEMPOTENCY_TTL_MINUTES: {
		defaultValue: 1_440,
		sensitive: false,
		description: "TTL for ship idempotency cache entries.",
		validation: "Positive integer.",
	},
	OPENUI_GEMINI_PYTHON_BIN: {
		defaultValue: "python3",
		sensitive: false,
		description: "Python binary used to start Gemini sidecar.",
		validation: "Trimmed non-empty string when set.",
	},
	OPENUI_GEMINI_SIDECAR_PATH: {
		defaultValue: "services/gemini-sidecar/server.py",
		sensitive: false,
		description: "Path to Gemini python sidecar entrypoint.",
		validation: "Path to an executable Python script.",
	},
	OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES: {
		defaultValue: 262_144,
		sensitive: false,
		description: "Maximum buffered stdout bytes retained for Gemini sidecar.",
		validation: "Positive integer. Empty/invalid value falls back to default.",
	},
});

export function resolveEnvDefaultValue(key: EnvKey): string | number {
	const entry = OPENUI_ENV_CONTRACT[key];
	if (typeof entry.defaultValue === "function") {
		return entry.defaultValue();
	}
	return entry.defaultValue;
}
