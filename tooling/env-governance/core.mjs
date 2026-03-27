import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_ENV_KEY_PATTERN =
	/^(?:OPENUI|GEMINI|GOOGLE|LIVE_TEST|CI_GATE|FILE_GOVERNANCE)_[A-Z0-9_]+$/u;
const EXTRA_PROJECT_ENV_KEYS = new Set(["CI", "RUN_EXTERNAL_E2E"]);
const SOURCE_FILE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".mjs",
	".cjs",
	".py",
]);
const DEFAULT_RUNTIME_SCAN_DIRS = [
	"services/mcp-server/src",
	"packages",
	"tooling",
	"services/gemini-sidecar",
];
const DEFAULT_PERMANENT_BAN_SCAN_DIRS = [
	"services/mcp-server/src",
	"packages",
	"tooling",
	"services/gemini-sidecar",
	"docs",
	"tests",
];
const DEFAULT_PERMANENT_BAN_EXCLUDED_FILES = new Set([
	"tooling/verify-env-governance.mjs",
	"tooling/env-governance/core.mjs",
]);
const PERMANENT_BAN_SCAN_FILE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".mjs",
	".cjs",
	".py",
	".md",
]);
const DEFAULT_PERMANENTLY_BANNED_ENV_KEYS = [
	"GOOGLE_API_KEY",
	"LIVE_TEST_MAX_ATTEMPTS",
	"OPENUI_MODEL",
	"OPENUI_MODEL_FAST",
	"OPENUI_MODEL_STRONG",
];
const DEFAULT_REGISTRY_PATH = path.join(
	"tooling",
	"env-contract",
	"deprecation-registry.json",
);
const DEFAULT_ENV_GOVERNANCE_DOC_PATH = path.join(
	"docs",
	"environment-governance.md",
);
const NON_CONTRACT_DOC_BLOCK_START = "<!-- NON_CONTRACT_REGISTRY:START -->";
const NON_CONTRACT_DOC_BLOCK_END = "<!-- NON_CONTRACT_REGISTRY:END -->";
const DEPRECATED_ENV_SCAN_FILE_NAMES = new Set([".env"]);
const DEPRECATED_ENV_SCAN_EXAMPLE_PATTERN = /^\.env(?:\..+)?\.example$/u;
const STAGED_MODE = "staged";
const CI_MODE = "ci";
const FULL_MODE = "full";
const SUPPORTED_MODES = new Set([FULL_MODE, STAGED_MODE, CI_MODE]);
const PERMANENT_BAN_REPLACEMENT_HINTS = new Map([
	["GOOGLE_API_KEY", "GEMINI_API_KEY"],
	["OPENUI_MODEL", "GEMINI_MODEL"],
	["OPENUI_MODEL_FAST", "GEMINI_MODEL_FAST"],
	["OPENUI_MODEL_STRONG", "GEMINI_MODEL_STRONG"],
	["LIVE_TEST_MAX_ATTEMPTS", "LIVE_TEST_MAX_RETRIES"],
]);
const ENV_RELATED_FILE_PATTERNS = [
	/^packages\/contracts\/src\/env-contract\.ts$/u,
	/^services\/mcp-server\/src\/constants\.ts$/u,
	/^tooling\/env-contract\/.+\.json$/u,
	/^\.env(\.development|\.staging|\.production)?\.example$/u,
];
const STAGED_DIFF_ENV_SIGNAL_PATTERN =
	/\b(?:process\.env|os\.environ|os\.getenv|OPENUI_[A-Z0-9_]*|GEMINI_[A-Z0-9_]*|GOOGLE_[A-Z0-9_]*|CI_GATE_[A-Z0-9_]*|FILE_GOVERNANCE_[A-Z0-9_]*|RUN_EXTERNAL_E2E|CI)\b/u;

function resolvePathInsideRoot(rootDir, relativePath, label) {
	const candidate = String(relativePath ?? "").trim();
	if (!candidate) {
		throw new Error(`${label} must be a non-empty path.`);
	}
	const root = path.resolve(rootDir);
	const resolved = path.resolve(root, candidate);
	const relative = path.relative(root, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(
			`${label} must resolve inside rootDir (${root}), received: ${JSON.stringify(relativePath)}.`,
		);
	}
	return resolved;
}

function toSortedUnique(values) {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function isProjectEnvKey(value) {
	return (
		EXTRA_PROJECT_ENV_KEYS.has(value) || PROJECT_ENV_KEY_PATTERN.test(value)
	);
}

function collectPatternMatches(raw, pattern, collector) {
	for (const match of raw.matchAll(pattern)) {
		const key = String(match[1] ?? "").trim();
		if (!key || !isProjectEnvKey(key)) {
			continue;
		}
		collector.add(key);
	}
}

function collectEnvKeysFromSource(raw) {
	const keys = new Set();

	collectPatternMatches(raw, /process\.env\.([A-Z][A-Z0-9_]*)/gu, keys);
	collectPatternMatches(
		raw,
		/process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/gu,
		keys,
	);
	collectPatternMatches(
		raw,
		/(?:os\.environ\.get|os\.getenv)\(\s*["']([A-Z][A-Z0-9_]*)["']/gu,
		keys,
	);
	collectPatternMatches(
		raw,
		/os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/gu,
		keys,
	);

	return keys;
}

async function collectSourceFiles(rootDir, relativeDir) {
	const scanRoot = path.join(rootDir, relativeDir);
	const files = [];

	async function walk(currentDir) {
		let entries;
		try {
			entries = await fs.readdir(currentDir, { withFileTypes: true });
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return;
			}
			throw error;
		}

		for (const entry of entries) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				entry.name === "dist"
			) {
				continue;
			}

			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			if (!entry.isFile()) {
				continue;
			}

			if (!SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
				continue;
			}

			files.push(fullPath);
		}
	}

	await walk(scanRoot);
	return files;
}

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function createExactEnvKeyPattern(key) {
	return new RegExp(`(?<![A-Z0-9_])${key}(?![A-Z0-9_])`, "u");
}

function createNegativeAssertionPattern(key) {
	return new RegExp(
		"\\.not\\.toContain\\(\\s*[\"'`]" + key + "[\"'`]\\s*\\)",
		"u",
	);
}

function isPermanentlyBannedKeyHitWhitelisted({
	relativePath,
	line,
	negativeAssertionPattern,
	pathAllowlistPatterns,
}) {
	if (pathAllowlistPatterns.some((pattern) => pattern.test(relativePath))) {
		return true;
	}

	if (!relativePath.startsWith("tests/")) {
		return false;
	}

	return negativeAssertionPattern.test(line);
}

async function collectFilesForPermanentBanScan(rootDir, relativeDir) {
	const scanRoot = path.join(rootDir, relativeDir);
	const files = [];

	async function walk(currentDir) {
		let entries;
		try {
			entries = await fs.readdir(currentDir, { withFileTypes: true });
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return;
			}
			throw error;
		}

		for (const entry of entries) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				entry.name === "dist" ||
				entry.name === ".runtime-cache"
			) {
				continue;
			}

			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			if (!entry.isFile()) {
				continue;
			}

			if (!PERMANENT_BAN_SCAN_FILE_EXTENSIONS.has(path.extname(entry.name))) {
				continue;
			}

			const relativePath = toPosixPath(path.relative(rootDir, fullPath));
			if (DEFAULT_PERMANENT_BAN_EXCLUDED_FILES.has(relativePath)) {
				continue;
			}

			files.push(fullPath);
		}
	}

	await walk(scanRoot);
	return files;
}

async function collectPermanentlyBannedKeyHits(
	rootDir,
	scanDirs,
	bannedKeys,
	pathAllowlistPatterns = [],
) {
	const allFiles = [];
	for (const relativeDir of scanDirs) {
		const files = await collectFilesForPermanentBanScan(rootDir, relativeDir);
		allFiles.push(...files);
	}

	const matchers = toSortedUnique(bannedKeys).map((key) => ({
		key,
		keyPattern: createExactEnvKeyPattern(key),
		negativeAssertionPattern: createNegativeAssertionPattern(key),
	}));

	const hits = [];
	for (const filePath of allFiles) {
		const raw = await fs.readFile(filePath, "utf8");
		const relativePath = toPosixPath(path.relative(rootDir, filePath));
		const lines = raw.split(/\r?\n/u);
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			for (const matcher of matchers) {
				if (!matcher.keyPattern.test(line)) {
					continue;
				}

				if (
					isPermanentlyBannedKeyHitWhitelisted({
						relativePath,
						line,
						negativeAssertionPattern: matcher.negativeAssertionPattern,
						pathAllowlistPatterns,
					})
				) {
					continue;
				}

				hits.push({
					key: matcher.key,
					file: relativePath,
					line: index + 1,
				});
			}
		}
	}

	return hits.sort((left, right) => {
		const byFile = left.file.localeCompare(right.file);
		if (byFile !== 0) {
			return byFile;
		}
		const byLine = left.line - right.line;
		if (byLine !== 0) {
			return byLine;
		}
		return left.key.localeCompare(right.key);
	});
}

async function collectRuntimeEnvKeys(rootDir, runtimeScanDirs) {
	const allFiles = [];
	for (const relativeDir of runtimeScanDirs) {
		const files = await collectSourceFiles(rootDir, relativeDir);
		allFiles.push(...files);
	}

	const collected = new Set();
	for (const filePath of allFiles) {
		const raw = await fs.readFile(filePath, "utf8");
		for (const key of collectEnvKeysFromSource(raw)) {
			collected.add(key);
		}
	}

	return toSortedUnique(collected);
}

function normalizeKeyEntries(rawEntries, entryKind, issues, options = {}) {
	const requireDeprecationFields = options.requireDeprecationFields === true;
	const entries = Array.isArray(rawEntries) ? rawEntries : [];

	if (rawEntries !== undefined && !Array.isArray(rawEntries)) {
		issues.push(`- ${entryKind} must be an array.`);
		return [];
	}

	const keys = [];
	const seen = new Set();

	for (const entry of entries) {
		if (!entry || typeof entry !== "object") {
			issues.push(`- ${entryKind} contains a non-object entry.`);
			continue;
		}

		const key = String(entry.key ?? "").trim();
		if (!key) {
			issues.push(`- ${entryKind} entry is missing key.`);
			continue;
		}

		if (!isProjectEnvKey(key)) {
			issues.push(
				`- ${entryKind} key ${key} is not a recognized project env variable name.`,
			);
			continue;
		}

		if (seen.has(key)) {
			issues.push(`- ${entryKind} contains duplicate key ${key}.`);
			continue;
		}

		if (requireDeprecationFields) {
			const replacement = String(entry.replacement ?? "").trim();
			const migrationHint = String(entry.migrationHint ?? "").trim();
			const sunsetAfter = String(entry.sunsetAfter ?? "").trim();

			if (!replacement) {
				issues.push(`- Deprecated key ${key} must define replacement.`);
			}
			if (!migrationHint) {
				issues.push(`- Deprecated key ${key} must define migrationHint.`);
			}
			if (!sunsetAfter) {
				issues.push(`- Deprecated key ${key} must define sunsetAfter.`);
			} else if (!/^\d{4}-\d{2}-\d{2}$/u.test(sunsetAfter)) {
				issues.push(`- Deprecated key ${key} sunsetAfter must be YYYY-MM-DD.`);
			}
		}

		seen.add(key);
		keys.push(key);
	}

	return keys;
}

function normalizeDeprecatedEntries(rawEntries, entryKind, issues) {
	const entries = Array.isArray(rawEntries) ? rawEntries : [];
	if (rawEntries !== undefined && !Array.isArray(rawEntries)) {
		issues.push(`- ${entryKind} must be an array.`);
		return [];
	}

	const normalized = [];
	const seen = new Set();

	for (const entry of entries) {
		if (!entry || typeof entry !== "object") {
			issues.push(`- ${entryKind} contains a non-object entry.`);
			continue;
		}

		const key = String(entry.key ?? "").trim();
		if (!key) {
			issues.push(`- ${entryKind} entry is missing key.`);
			continue;
		}
		if (!isProjectEnvKey(key)) {
			issues.push(
				`- ${entryKind} key ${key} is not a recognized project env variable name.`,
			);
			continue;
		}
		if (seen.has(key)) {
			issues.push(`- ${entryKind} contains duplicate key ${key}.`);
			continue;
		}

		const replacement = String(entry.replacement ?? "").trim();
		const migrationHint = String(entry.migrationHint ?? "").trim();
		const sunsetAfter = String(entry.sunsetAfter ?? "").trim();

		if (!replacement) {
			issues.push(`- Deprecated key ${key} must define replacement.`);
		}
		if (!migrationHint) {
			issues.push(`- Deprecated key ${key} must define migrationHint.`);
		}
		if (!sunsetAfter) {
			issues.push(`- Deprecated key ${key} must define sunsetAfter.`);
		} else if (!/^\d{4}-\d{2}-\d{2}$/u.test(sunsetAfter)) {
			issues.push(`- Deprecated key ${key} sunsetAfter must be YYYY-MM-DD.`);
		}

		seen.add(key);
		normalized.push({ key, replacement, migrationHint, sunsetAfter });
	}

	return normalized;
}

function toUtcDayStamp(input) {
	if (input instanceof Date) {
		return input.toISOString().slice(0, 10);
	}
	if (typeof input === "string") {
		const value = input.trim();
		if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
			return value;
		}
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toISOString().slice(0, 10);
		}
		return null;
	}
	if (input === undefined) {
		return new Date().toISOString().slice(0, 10);
	}
	return null;
}

function parseEnvAssignmentKeys(raw) {
	const keys = new Set();
	for (const rawLine of raw.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}
		const normalized = line.startsWith("export ")
			? line.slice("export ".length).trim()
			: line;
		const matched = normalized.match(/^([A-Z][A-Z0-9_]*)\s*=/u);
		if (!matched) {
			continue;
		}
		const key = matched[1];
		if (isProjectEnvKey(key)) {
			keys.add(key);
		}
	}
	return keys;
}

async function collectDeprecatedKeyUsageInEnvFiles(
	rootDir,
	deprecatedEntries,
	todayStamp,
) {
	const directoryEntries = await fs.readdir(rootDir, { withFileTypes: true });
	const candidateFiles = directoryEntries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter(
			(fileName) =>
				DEPRECATED_ENV_SCAN_FILE_NAMES.has(fileName) ||
				DEPRECATED_ENV_SCAN_EXAMPLE_PATTERN.test(fileName),
		)
		.sort((left, right) => left.localeCompare(right));

	const deprecatedByKey = new Map(
		deprecatedEntries.map((entry) => [entry.key, entry]),
	);
	const matches = [];

	for (const fileName of candidateFiles) {
		const absolutePath = path.join(rootDir, fileName);
		const raw = await fs.readFile(absolutePath, "utf8");
		const keys = parseEnvAssignmentKeys(raw);
		for (const key of keys) {
			const deprecatedEntry = deprecatedByKey.get(key);
			if (!deprecatedEntry) {
				continue;
			}
			matches.push({
				key,
				file: fileName,
				replacement: deprecatedEntry.replacement,
				migrationHint: deprecatedEntry.migrationHint,
				sunsetAfter: deprecatedEntry.sunsetAfter,
				expired: todayStamp > deprecatedEntry.sunsetAfter,
			});
		}
	}

	return matches.sort((left, right) => {
		const byKey = left.key.localeCompare(right.key);
		if (byKey !== 0) {
			return byKey;
		}
		return left.file.localeCompare(right.file);
	});
}

function extractNonContractKeysFromGovernanceDoc(raw) {
	const startIndex = raw.indexOf(NON_CONTRACT_DOC_BLOCK_START);
	const endIndex = raw.indexOf(NON_CONTRACT_DOC_BLOCK_END);
	const issues = [];

	if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
		issues.push(
			`- docs/environment-governance.md must contain a non-contract registry block delimited by ${NON_CONTRACT_DOC_BLOCK_START} and ${NON_CONTRACT_DOC_BLOCK_END}.`,
		);
		return { keys: [], issues };
	}

	const block = raw.slice(
		startIndex + NON_CONTRACT_DOC_BLOCK_START.length,
		endIndex,
	);
	const matchedKeys = Array.from(block.matchAll(/`([A-Z][A-Z0-9_]*)`/gu)).map(
		(match) => match[1],
	);
	const keys = toSortedUnique(
		matchedKeys.filter((key) => isProjectEnvKey(key)),
	);

	return { keys, issues };
}

async function verifyNonContractRegistryDocSync(
	rootDir,
	docPath,
	registryKeys,
) {
	const absoluteDocPath = resolvePathInsideRoot(
		rootDir,
		docPath,
		"envGovernanceDocPath",
	);
	try {
		const raw = await fs.readFile(absoluteDocPath, "utf8");
		const extracted = extractNonContractKeysFromGovernanceDoc(raw);
		const issues = [...extracted.issues];
		if (issues.length > 0) {
			return { issues, warnings: [] };
		}

		const docSet = new Set(extracted.keys);
		const registrySet = new Set(registryKeys);
		const missingInDoc = registryKeys.filter((key) => !docSet.has(key));
		const extraInDoc = extracted.keys.filter((key) => !registrySet.has(key));

		if (missingInDoc.length > 0) {
			issues.push(
				`- docs/environment-governance.md is missing non-contract keys from tooling/env-contract/deprecation-registry.json: ${missingInDoc.join(", ")}.`,
			);
		}
		if (extraInDoc.length > 0) {
			issues.push(
				`- docs/environment-governance.md contains non-contract keys not registered in tooling/env-contract/deprecation-registry.json: ${extraInDoc.join(", ")}.`,
			);
		}

		return { issues, warnings: [] };
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return {
				issues: [],
				warnings: [
					`- Skipped non-contract registry doc sync check because ${docPath} is missing.`,
				],
			};
		}
		throw error;
	}
}

async function loadRegistry(rootDir, registryPath) {
	const absoluteRegistryPath = resolvePathInsideRoot(
		rootDir,
		registryPath,
		"registryPath",
	);
	const raw = await fs.readFile(absoluteRegistryPath, "utf8");
	const parsed = JSON.parse(raw);
	const issues = [];

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(
			`Invalid env governance registry format: ${registryPath} must be an object.`,
		);
	}

	const nonContractKeys = normalizeKeyEntries(
		parsed.nonContractKeys,
		"nonContractKeys",
		issues,
	);
	const ciOnlyKeys = normalizeKeyEntries(
		parsed.ciOnlyKeys,
		"ciOnlyKeys",
		issues,
	);
	const testOnlyKeys = normalizeKeyEntries(
		parsed.testOnlyKeys,
		"testOnlyKeys",
		issues,
	);
	const deprecatedEntries = normalizeDeprecatedEntries(
		parsed.deprecatedKeys,
		"deprecatedKeys",
		issues,
	);
	const envExampleExceptions = normalizeKeyEntries(
		parsed.envExampleExceptions,
		"envExampleExceptions",
		issues,
	);

	const keyCategoryEntries = [
		...nonContractKeys.map((key) => ({ key, category: "nonContractKeys" })),
		...ciOnlyKeys.map((key) => ({ key, category: "ciOnlyKeys" })),
		...testOnlyKeys.map((key) => ({ key, category: "testOnlyKeys" })),
		...deprecatedEntries.map((entry) => ({
			key: entry.key,
			category: "deprecatedKeys",
		})),
	];
	const categoriesByKey = new Map();
	for (const entry of keyCategoryEntries) {
		if (!categoriesByKey.has(entry.key)) {
			categoriesByKey.set(entry.key, new Set());
		}
		categoriesByKey.get(entry.key).add(entry.category);
	}
	for (const [key, categories] of categoriesByKey.entries()) {
		if (categories.size <= 1) {
			continue;
		}
		issues.push(
			`- Registry key ${key} must be declared in only one category, found: ${Array.from(
				categories,
			)
				.sort((left, right) => left.localeCompare(right))
				.join(", ")}.`,
		);
	}

	return {
		path: absoluteRegistryPath,
		issues,
		nonContractKeys: toSortedUnique(nonContractKeys),
		ciOnlyKeys: toSortedUnique(ciOnlyKeys),
		testOnlyKeys: toSortedUnique(testOnlyKeys),
		deprecatedKeys: toSortedUnique(deprecatedEntries.map((entry) => entry.key)),
		deprecatedEntries: deprecatedEntries
			.slice()
			.sort((left, right) => left.key.localeCompare(right.key)),
		envExampleExceptions: toSortedUnique(envExampleExceptions),
	};
}

export {
	CI_MODE,
	DEFAULT_ENV_GOVERNANCE_DOC_PATH,
	DEFAULT_PERMANENTLY_BANNED_ENV_KEYS,
	DEFAULT_PERMANENT_BAN_SCAN_DIRS,
	DEFAULT_REGISTRY_PATH,
	DEFAULT_RUNTIME_SCAN_DIRS,
	ENV_RELATED_FILE_PATTERNS,
	FULL_MODE,
	PERMANENT_BAN_REPLACEMENT_HINTS,
	SOURCE_FILE_EXTENSIONS,
	STAGED_DIFF_ENV_SIGNAL_PATTERN,
	STAGED_MODE,
	SUPPORTED_MODES,
	collectDeprecatedKeyUsageInEnvFiles,
	collectEnvKeysFromSource,
	collectPermanentlyBannedKeyHits,
	collectRuntimeEnvKeys,
	isProjectEnvKey,
	loadRegistry,
	resolvePathInsideRoot,
	toSortedUnique,
	toUtcDayStamp,
	verifyNonContractRegistryDocSync,
};
