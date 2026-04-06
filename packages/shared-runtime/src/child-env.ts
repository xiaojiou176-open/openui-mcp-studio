const CHILD_ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const CHILD_ENV_PREFIX_PATTERN = /^[A-Z_][A-Z0-9_]*\*$/;
const CHILD_ENV_ALLOWLIST_FORMAT_HINT =
	'Expected comma-separated env keys or prefix wildcards ending with "*" (for example: PATH,OPENUI_*). Migration hint: replace "-" with "_" and keep uppercase key names.';

export const OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST = Object.freeze([
	"PATH",
	"COMSPEC",
	"SYSTEMROOT",
	"HOME",
	"USER",
	"SHELL",
	"TMPDIR",
	"TEMP",
	"TMP",
	"TERM",
	"CI",
	"LANG",
	"LC_ALL",
	"LD_LIBRARY_PATH",
	"DYLD_LIBRARY_PATH",
	"DYLD_FALLBACK_LIBRARY_PATH",
	"COLORTERM",
	"NO_COLOR",
	"FORCE_COLOR",
	"NODE_ENV",
	"PLAYWRIGHT_BROWSERS_PATH",
	"NPM_CONFIG_CACHE",
	"npm_config_cache",
	"OPENUI_CHROME_USER_DATA_DIR",
	"OPENUI_CHROME_PROFILE_DIRECTORY",
	"OPENUI_CHROME_CHANNEL",
	"OPENUI_CHROME_EXECUTABLE_PATH",
	"OPENUI_CHROME_CDP_PORT",
	"OPENUI_CI_GATE_RUN_KEY",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"all_proxy",
	"no_proxy",
]) as readonly string[];

const SENSITIVE_EXACT_DENYLIST = Object.freeze([
	"GEMINI_API_KEY",
	"GITHUB_TOKEN",
	"NPM_TOKEN",
	"AWS_ACCESS_KEY_ID",
	"AWS_SECRET_ACCESS_KEY",
]) as readonly string[];
const SENSITIVE_ENV_SEGMENT_PATTERN =
	/(?:^|_)(TOKEN|API_KEY|SECRET|PASSWORD)(?:_|$)/;

function isWildcardToken(token: string): boolean {
	return token.endsWith("*");
}

function normalizeEnvKeyForMatch(
	value: string,
	caseInsensitiveKeys: boolean,
): string {
	return caseInsensitiveKeys ? value.toUpperCase() : value;
}

function matchesAllowlistToken(
	key: string,
	token: string,
	caseInsensitiveKeys: boolean,
): boolean {
	const normalizedKey = normalizeEnvKeyForMatch(key, caseInsensitiveKeys);
	const normalizedToken = normalizeEnvKeyForMatch(token, caseInsensitiveKeys);
	if (isWildcardToken(token)) {
		return normalizedKey.startsWith(normalizedToken.slice(0, -1));
	}
	return normalizedKey === normalizedToken;
}

function isSensitiveDenylisted(
	key: string,
	caseInsensitiveKeys: boolean,
): boolean {
	const normalizedKey = normalizeEnvKeyForMatch(key, caseInsensitiveKeys);
	const exactMatch = SENSITIVE_EXACT_DENYLIST.some(
		(token) =>
			normalizeEnvKeyForMatch(token, caseInsensitiveKeys) === normalizedKey,
	);
	return exactMatch || SENSITIVE_ENV_SEGMENT_PATTERN.test(normalizedKey);
}

function isExplicitlyAllowedByBaseAllowlist(
	key: string,
	caseInsensitiveKeys: boolean,
): boolean {
	const normalizedKey = normalizeEnvKeyForMatch(key, caseInsensitiveKeys);
	return OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST.some(
		(token) =>
			normalizeEnvKeyForMatch(token, caseInsensitiveKeys) === normalizedKey,
	);
}

function parseCustomAllowlist(raw: string | undefined): string[] {
	if (!raw) {
		return [];
	}

	const parsed: string[] = [];
	for (const chunk of raw.split(",")) {
		const token = chunk.trim();
		if (!token) {
			continue;
		}

		if (
			!CHILD_ENV_KEY_PATTERN.test(token) &&
			!CHILD_ENV_PREFIX_PATTERN.test(token)
		) {
			throw new Error(
				`OPENUI_MCP_CHILD_ENV_ALLOWLIST contains invalid token: "${token}". ${CHILD_ENV_ALLOWLIST_FORMAT_HINT}`,
			);
		}

		parsed.push(token);
	}

	return Array.from(new Set(parsed));
}

export function parseChildEnvAllowlist(raw: string | undefined): string[] {
	const combined = [
		...OPENUI_MCP_CHILD_ENV_BASE_ALLOWLIST,
		...parseCustomAllowlist(raw),
	];
	return Array.from(new Set(combined));
}

export function buildChildEnvFromAllowlist(
	sourceEnv: NodeJS.ProcessEnv = process.env,
	allowlistRaw: string | undefined = sourceEnv.OPENUI_MCP_CHILD_ENV_ALLOWLIST,
	options?: {
		caseInsensitiveKeys?: boolean;
	},
): NodeJS.ProcessEnv {
	const allowlist = parseChildEnvAllowlist(allowlistRaw);
	const caseInsensitiveKeys =
		options?.caseInsensitiveKeys ?? process.platform === "win32";
	const childEnv: NodeJS.ProcessEnv = {};

	for (const [key, value] of Object.entries(sourceEnv)) {
		if (value === undefined) {
			continue;
		}
		const matched = allowlist.some((token) =>
			matchesAllowlistToken(key, token, caseInsensitiveKeys),
		);
		if (matched) {
			const explicitlyAllowed = isExplicitlyAllowedByBaseAllowlist(
				key,
				caseInsensitiveKeys,
			);
			if (
				!explicitlyAllowed &&
				isSensitiveDenylisted(key, caseInsensitiveKeys)
			) {
				continue;
			}
			childEnv[key] = value;
		}
	}

	if (childEnv.FORCE_COLOR !== undefined && childEnv.NO_COLOR !== undefined) {
		// Node emits "NO_COLOR ignored due to FORCE_COLOR"; keep FORCE_COLOR behavior and drop noise.
		delete childEnv.NO_COLOR;
	}

	return childEnv;
}
