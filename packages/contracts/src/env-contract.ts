export const OPENUI_ENV_KEYS = [
	"GEMINI_API_KEY",
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"GEMINI_MODEL_EMBEDDING",
	"GEMINI_DEFAULT_THINKING_LEVEL",
	"GEMINI_DEFAULT_TEMPERATURE",
	"NEXT_PUBLIC_SITE_URL",
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
	"OPENUI_TOOL_CACHE_ROOT",
	"OPENUI_TOOL_CACHE_RETENTION_DAYS",
	"OPENUI_TOOL_CACHE_MAX_BYTES",
	"OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES",
	"OPENUI_CHROME_USER_DATA_DIR",
	"OPENUI_CHROME_PROFILE_DIRECTORY",
	"OPENUI_CHROME_CHANNEL",
	"OPENUI_CHROME_EXECUTABLE_PATH",
	"OPENUI_CHROME_CDP_PORT",
	"OPENUI_QUEUE_CONCURRENCY",
	"OPENUI_QUEUE_MAX_PENDING",
	"OPENUI_IDEMPOTENCY_TTL_MINUTES",
	"OPENUI_GEMINI_PYTHON_BIN",
	"OPENUI_GEMINI_SIDECAR_PATH",
	"OPENUI_GEMINI_SIDECAR_STDOUT_BUFFER_MAX_BYTES",
	"OPENUI_HOSTED_API_HOST",
	"OPENUI_HOSTED_API_PORT",
	"OPENUI_HOSTED_API_BEARER_TOKEN",
	"OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE",
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
	NEXT_PUBLIC_SITE_URL: {
		defaultValue: "",
		sensitive: false,
		description:
			"Canonical external site URL used by public pages for canonical links, sitemap/robots indexability, and structured discovery metadata.",
		validation:
			"Empty string disables canonical-site SEO outputs. When set, must be an absolute http or https URL.",
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
	OPENUI_TOOL_CACHE_ROOT: {
		defaultValue: "~/.cache/openui-mcp-studio/tooling",
		sensitive: false,
		description:
			"Base root for repo-specific external tool caches (Playwright assets, managed install surfaces, tool HOME, and repo-owned pre-commit/Go caches).",
		validation:
			"Non-empty path string. The effective per-workspace cache root is derived under this base root using the workspace token.",
	},
	OPENUI_TOOL_CACHE_RETENTION_DAYS: {
		defaultValue: 3,
		sensitive: false,
		description:
			"Number of days to retain repo-specific external tool-cache entries before TTL cleanup.",
		validation: "Positive integer.",
	},
	OPENUI_TOOL_CACHE_MAX_BYTES: {
		defaultValue: 5_368_709_120,
		sensitive: false,
		description:
			"Maximum total size for repo-specific external tool-cache entries before oldest-entry cleanup begins.",
		validation: "Positive integer.",
	},
	OPENUI_TOOL_CACHE_CLEAN_INTERVAL_MINUTES: {
		defaultValue: 60,
		sensitive: false,
		description:
			"Minimum interval in minutes between repo-specific external tool-cache janitor runs.",
		validation: "Positive integer.",
	},
	OPENUI_CHROME_USER_DATA_DIR: {
		defaultValue: "",
		sensitive: false,
		description:
			"Absolute user-data-dir root for the repo-owned isolated real Chrome lane used by login-state and DOM/Console/API inspection flows.",
		validation:
			"Empty string disables real Chrome profile mode. When set, must be an absolute path to an existing Chrome user data directory.",
	},
	OPENUI_CHROME_PROFILE_DIRECTORY: {
		defaultValue: "",
		sensitive: false,
		description:
			"Profile directory name inside OPENUI_CHROME_USER_DATA_DIR for the repo-owned isolated Chrome profile.",
		validation:
			"Empty string disables real Chrome profile mode. When set, must be a trimmed non-empty profile directory name.",
	},
	OPENUI_CHROME_CHANNEL: {
		defaultValue: "chrome",
		sensitive: false,
		description:
			"Browser channel used for the repo-owned single-instance real Chrome lane.",
		validation: "Trimmed non-empty string when set.",
	},
	OPENUI_CHROME_EXECUTABLE_PATH: {
		defaultValue: "",
		sensitive: false,
		description:
			"Optional absolute Chrome executable override for the repo-owned real Chrome lane.",
		validation:
			"Empty string uses the configured channel. When set, must be an absolute path to an executable.",
	},
	OPENUI_CHROME_CDP_PORT: {
		defaultValue: 9_343,
		sensitive: false,
		description:
			"Fixed local Chrome DevTools Protocol port for the repo-owned single-instance real-browser lane.",
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
	OPENUI_HOSTED_API_HOST: {
		defaultValue: "127.0.0.1",
		sensitive: false,
		description: "Bind host for the self-hosted OpenUI Hosted API runtime.",
		validation: "Trimmed non-empty string.",
	},
	OPENUI_HOSTED_API_PORT: {
		defaultValue: 7878,
		sensitive: false,
		description: "Bind port for the self-hosted OpenUI Hosted API runtime.",
		validation: "Positive integer.",
	},
	OPENUI_HOSTED_API_BEARER_TOKEN: {
		defaultValue: "",
		sensitive: true,
		description:
			"Bearer token required by protected OpenUI Hosted API routes.",
		validation:
			"Trimmed non-empty string when the hosted API runtime is started.",
	},
	OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE: {
		defaultValue: 60,
		sensitive: false,
		description:
			"Fixed-window request budget for the self-hosted OpenUI Hosted API runtime.",
		validation: "Positive integer.",
	},
});

export function resolveEnvDefaultValue(key: EnvKey): string | number {
	const entry = OPENUI_ENV_CONTRACT[key];
	if (typeof entry.defaultValue === "function") {
		return entry.defaultValue();
	}
	return entry.defaultValue;
}
