#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseEnvContract, parseEnvExample } from "./env-contract/parse.mjs";

import {
	CI_MODE,
	collectDeprecatedKeyUsageInEnvFiles,
	collectEnvKeysFromSource,
	collectPermanentlyBannedKeyHits,
	collectRuntimeEnvKeys,
	DEFAULT_ENV_GOVERNANCE_DOC_PATH,
	DEFAULT_PERMANENT_BAN_SCAN_DIRS,
	DEFAULT_PERMANENTLY_BANNED_ENV_KEYS,
	DEFAULT_REGISTRY_PATH,
	DEFAULT_RUNTIME_SCAN_DIRS,
	ENV_RELATED_FILE_PATTERNS,
	FULL_MODE,
	isProjectEnvKey,
	loadRegistry,
	PERMANENT_BAN_REPLACEMENT_HINTS,
	resolvePathInsideRoot,
	SOURCE_FILE_EXTENSIONS,
	STAGED_DIFF_ENV_SIGNAL_PATTERN,
	STAGED_MODE,
	SUPPORTED_MODES,
	toSortedUnique,
	toUtcDayStamp,
	verifyNonContractRegistryDocSync,
} from "./env-governance/core.mjs";

function isCiEnvironment(env = process.env) {
	return (
		String(env.CI ?? "")
			.trim()
			.toLowerCase() === "true"
	);
}

function parseCliArgs(argv) {
	let mode = FULL_MODE;
	for (const arg of argv) {
		if (arg === "--staged") {
			mode = STAGED_MODE;
			continue;
		}
		if (arg === "--ci") {
			mode = CI_MODE;
			continue;
		}
		if (arg.startsWith("--mode=")) {
			const value = arg.slice("--mode=".length).trim();
			if (!SUPPORTED_MODES.has(value)) {
				throw new Error(`Unsupported --mode value: ${value}`);
			}
			mode = value;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return { mode };
}

function getStagedFilesFromGit(cwd = process.cwd()) {
	const inRepoResult = spawnSync(
		"git",
		["rev-parse", "--is-inside-work-tree"],
		{
			cwd,
			encoding: "utf8",
		},
	);
	if (
		inRepoResult.status !== 0 ||
		(inRepoResult.stdout || "").trim() !== "true"
	) {
		throw new Error("Current directory is not a Git working tree.");
	}

	const result = spawnSync(
		"git",
		["diff", "--cached", "--name-status", "--diff-filter=ACMRD", "-z"],
		{ cwd, encoding: "utf8" },
	);
	if (result.status !== 0) {
		const stderr = (result.stderr || "").trim();
		throw new Error(stderr || "Failed to read staged file list.");
	}

	const tokens = result.stdout
		.split("\u0000")
		.filter((token) => token.length > 0);
	const files = [];
	let cursor = 0;

	while (cursor < tokens.length) {
		const status = tokens[cursor] ?? "";
		cursor += 1;

		if (status.startsWith("R") || status.startsWith("C")) {
			const oldPath = tokens[cursor];
			const newPath = tokens[cursor + 1];
			cursor += 2;
			if (typeof oldPath === "string" && oldPath.length > 0) {
				files.push(oldPath);
			}
			if (typeof newPath === "string" && newPath.length > 0) {
				files.push(newPath);
			}
			continue;
		}

		const filePath = tokens[cursor];
		cursor += 1;
		if (typeof filePath === "string" && filePath.length > 0) {
			files.push(filePath);
		}
	}

	return Array.from(new Set(files));
}

function getStagedDiffFromGit(filePath, cwd = process.cwd()) {
	const result = spawnSync(
		"git",
		["diff", "--cached", "--unified=0", "--", filePath],
		{
			cwd,
			encoding: "utf8",
		},
	);
	if (result.status !== 0) {
		const stderr = (result.stderr || "").trim();
		throw new Error(stderr || `Failed to read staged diff for ${filePath}`);
	}
	return result.stdout || "";
}

function isEnvRelatedFile(filePath) {
	return ENV_RELATED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function hasEnvSignalInStagedDiff(diffText) {
	const changedLines = diffText
		.split("\n")
		.filter(
			(line) =>
				(line.startsWith("+") || line.startsWith("-")) &&
				!line.startsWith("+++") &&
				!line.startsWith("---"),
		)
		.map((line) => line.slice(1));
	return changedLines.some((line) => STAGED_DIFF_ENV_SIGNAL_PATTERN.test(line));
}

function detectEnvGovernanceTriggerFromStaged({ stagedFiles, getStagedDiff }) {
	const matchedFiles = [];
	const uniqueFiles = Array.from(new Set(stagedFiles));

	for (const filePath of uniqueFiles) {
		if (isEnvRelatedFile(filePath)) {
			matchedFiles.push(filePath);
			continue;
		}

		if (!SOURCE_FILE_EXTENSIONS.has(path.extname(filePath))) {
			continue;
		}

		const diffText = getStagedDiff(filePath);
		if (hasEnvSignalInStagedDiff(diffText)) {
			matchedFiles.push(filePath);
		}
	}

	return {
		shouldRun: matchedFiles.length > 0,
		matchedFiles: toSortedUnique(matchedFiles),
	};
}

function resolveEnvGovernanceExecutionPlan({
	mode = FULL_MODE,
	isCi = isCiEnvironment(),
	stagedFiles = [],
	getStagedDiff = () => "",
}) {
	if (mode === CI_MODE || isCi) {
		return {
			shouldRun: true,
			reason: "ci mode enforces full env governance check",
			matchedFiles: [],
		};
	}

	if (mode !== STAGED_MODE) {
		return {
			shouldRun: true,
			reason: "full mode runs env governance check",
			matchedFiles: [],
		};
	}

	if (stagedFiles.length === 0) {
		return {
			shouldRun: false,
			reason: "staged mode with no staged files",
			matchedFiles: [],
		};
	}

	const detection = detectEnvGovernanceTriggerFromStaged({
		stagedFiles,
		getStagedDiff,
	});
	if (!detection.shouldRun) {
		return {
			shouldRun: false,
			reason: "no env-related staged changes",
			matchedFiles: [],
		};
	}

	return {
		shouldRun: true,
		reason: `env-related staged changes detected (${detection.matchedFiles.join(", ")})`,
		matchedFiles: detection.matchedFiles,
	};
}

function appendRemediationAction(map, key, action) {
	if (!map.has(key)) {
		map.set(key, new Set());
	}
	map.get(key).add(action);
}

function buildEnvGovernanceRemediationMap(issues = []) {
	const remediations = new Map();

	for (const issue of issues) {
		let match = issue.match(
			/^- Deprecated key ([A-Z][A-Z0-9_]*) is forbidden(?: \(hard-fail\))?: [^.]+\.\s*Migrate to ([A-Z][A-Z0-9_]*)(?:\.|;)\s*(.+)$/u,
		);
		if (match) {
			const [, key, replacement, migrationHint] = match;
			appendRemediationAction(
				remediations,
				key,
				`Migrate all ${key} usages to ${replacement}; then move historical notes outside the tracked minimal docs set. ${migrationHint.trim()}`,
			);
			continue;
		}

		match = issue.match(
			/^- Deprecated key ([A-Z][A-Z0-9_]*) found in ([^;]+); migrate to ([A-Z][A-Z0-9_]*)\.\s*(.+)$/u,
		);
		if (match) {
			const [, key, file, replacement, migrationHint] = match;
			appendRemediationAction(
				remediations,
				key,
				`Update ${file} to stop declaring ${key} and use ${replacement} instead. ${migrationHint.trim()}`,
			);
			continue;
		}

		match = issue.match(
			/^- Permanently banned env key ([A-Z][A-Z0-9_]*) referenced in ([^:]+):(\d+)\.$/u,
		);
		if (match) {
			const [, key, file, line] = match;
			const replacement = PERMANENT_BAN_REPLACEMENT_HINTS.get(key);
			const replacementHint = replacement
				? ` Replace with ${replacement} if equivalent behavior is needed.`
				: "";
			appendRemediationAction(
				remediations,
				key,
				`Remove ${key} reference at ${file}:${line}.${replacementHint}`.trim(),
			);
			continue;
		}

		match = issue.match(
			/^- Unregistered runtime env key ([A-Z][A-Z0-9_]*): add it to packages\/contracts\/src\/env-contract\.ts or tooling\/env-contract\/deprecation-registry\.json \(nonContractKeys\/ciOnlyKeys\/testOnlyKeys\)\.$/u,
		);
		if (match) {
			const [, key] = match;
			appendRemediationAction(
				remediations,
				key,
				`Register ${key} in packages/contracts/src/env-contract.ts, or add it to tooling/env-contract/deprecation-registry.json (nonContractKeys/ciOnlyKeys/testOnlyKeys).`,
			);
			continue;
		}

		match = issue.match(
			/^- \.env\.example key ([A-Z][A-Z0-9_]*) must exist in contract keys or envExampleExceptions\.$/u,
		);
		if (match) {
			const [, key] = match;
			appendRemediationAction(
				remediations,
				key,
				`Either add ${key} to packages/contracts/src/env-contract.ts or envExampleExceptions, or remove it from .env.example.`,
			);
		}
	}

	return Array.from(remediations.entries())
		.map(([key, actions]) => ({
			key,
			actions: Array.from(actions).sort((left, right) =>
				left.localeCompare(right),
			),
		}))
		.sort((left, right) => left.key.localeCompare(right.key));
}

function formatEnvGovernanceRemediationMap(remediations = []) {
	if (!Array.isArray(remediations) || remediations.length === 0) {
		return [];
	}

	const lines = ["[env-governance] remediation map (key -> action):"];
	for (const remediation of remediations) {
		lines.push(`- ${remediation.key} -> ${remediation.actions.join(" | ")}`);
	}
	return lines;
}

async function verifyEnvGovernance(options = {}) {
	const rootDir = options.rootDir
		? path.resolve(options.rootDir)
		: process.cwd();
	const contractPath =
		options.contractPath ??
		path.join("packages", "contracts", "src", "env-contract.ts");
	const envExamplePath = options.envExamplePath ?? ".env.example";
	const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
	const envGovernanceDocPath =
		options.envGovernanceDocPath ?? DEFAULT_ENV_GOVERNANCE_DOC_PATH;
	const runtimeScanDirs = options.runtimeScanDirs ?? DEFAULT_RUNTIME_SCAN_DIRS;
	const permanentBanScanDirs =
		options.permanentBanScanDirs ?? DEFAULT_PERMANENT_BAN_SCAN_DIRS;
	const permanentlyBannedEnvKeys =
		options.permanentlyBannedEnvKeys ?? DEFAULT_PERMANENTLY_BANNED_ENV_KEYS;
	const permanentBanPathAllowlist = options.permanentBanPathAllowlist ?? [];
	const resolvedContractPath = resolvePathInsideRoot(
		rootDir,
		contractPath,
		"contractPath",
	);
	const resolvedEnvExamplePath = resolvePathInsideRoot(
		rootDir,
		envExamplePath,
		"envExamplePath",
	);

	const [contractRaw, envExampleRaw, registry] = await Promise.all([
		fs.readFile(resolvedContractPath, "utf8"),
		fs.readFile(resolvedEnvExamplePath, "utf8"),
		loadRegistry(rootDir, registryPath),
	]);

	const contract = parseEnvContract(contractRaw);
	const envExample = parseEnvExample(envExampleRaw);
	const runtimeKeys = await collectRuntimeEnvKeys(rootDir, runtimeScanDirs);

	const contractSet = new Set(contract.keyTuple);
	const nonContractSet = new Set(registry.nonContractKeys);
	const ciOnlySet = new Set(registry.ciOnlyKeys);
	const testOnlySet = new Set(registry.testOnlyKeys);
	const deprecatedSet = new Set(registry.deprecatedKeys);
	const envExampleExceptionSet = new Set(registry.envExampleExceptions);
	const todayStamp = toUtcDayStamp(options.currentDate);
	if (!todayStamp) {
		throw new Error("Invalid currentDate value for env governance check.");
	}

	const blockingIssues = [...registry.issues];
	const warnings = [];
	const docSync = await verifyNonContractRegistryDocSync(
		rootDir,
		envGovernanceDocPath,
		registry.nonContractKeys,
	);
	blockingIssues.push(...docSync.issues);
	warnings.push(...docSync.warnings);

	for (const entry of registry.deprecatedEntries) {
		blockingIssues.push(
			`- Deprecated key ${entry.key} is forbidden (hard-fail): deprecatedKeys must stay empty. Migrate to ${entry.replacement}; move historical notes outside the tracked minimal docs set. ${entry.migrationHint}`,
		);
	}

	const deprecatedKeyUsages = await collectDeprecatedKeyUsageInEnvFiles(
		rootDir,
		registry.deprecatedEntries,
		todayStamp,
	);
	for (const usage of deprecatedKeyUsages) {
		blockingIssues.push(
			`- Deprecated key ${usage.key} found in ${usage.file}; migrate to ${usage.replacement}. ${usage.migrationHint}`,
		);
	}

	const permanentlyBannedKeyHits = await collectPermanentlyBannedKeyHits(
		rootDir,
		permanentBanScanDirs,
		permanentlyBannedEnvKeys,
		permanentBanPathAllowlist,
	);
	for (const hit of permanentlyBannedKeyHits) {
		blockingIssues.push(
			`- Permanently banned env key ${hit.key} referenced in ${hit.file}:${hit.line}. Use LEGACY_KEY_* + digest in docs.`,
		);
	}

	for (const key of runtimeKeys) {
		if (
			contractSet.has(key) ||
			nonContractSet.has(key) ||
			ciOnlySet.has(key) ||
			testOnlySet.has(key) ||
			deprecatedSet.has(key)
		) {
			continue;
		}
		blockingIssues.push(
			`- Unregistered runtime env key ${key}: add it to packages/contracts/src/env-contract.ts or tooling/env-contract/deprecation-registry.json (nonContractKeys/ciOnlyKeys/testOnlyKeys).`,
		);
	}

	for (const key of envExample.keys) {
		if (contractSet.has(key) || envExampleExceptionSet.has(key)) {
			continue;
		}
		blockingIssues.push(
			`- .env.example key ${key} must exist in contract keys or envExampleExceptions.`,
		);
	}

	return {
		ok: blockingIssues.length === 0,
		rootDir,
		contractKeys: contract.keyTuple,
		envExampleKeys: envExample.keys,
		runtimeKeys,
		nonContractKeys: registry.nonContractKeys,
		ciOnlyKeys: registry.ciOnlyKeys,
		testOnlyKeys: registry.testOnlyKeys,
		deprecatedKeys: registry.deprecatedKeys,
		envExampleExceptions: registry.envExampleExceptions,
		permanentlyBannedEnvKeys: toSortedUnique(permanentlyBannedEnvKeys),
		permanentlyBannedKeyHits,
		deprecatedKeyUsages,
		warnings,
		blockingIssues,
		issues: blockingIssues,
	};
}

async function runVerifyEnvGovernanceCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const verifyOptions = options.verifyOptions ?? {};
	const parsedArgs = parseCliArgs(options.argv ?? process.argv.slice(2));
	const mode = options.mode ?? parsedArgs.mode;
	const isCi = isCiEnvironment();
	const emitSunsetNotices = options.emitSunsetNotices ?? mode !== STAGED_MODE;

	try {
		const executionPlan =
			mode === STAGED_MODE
				? resolveEnvGovernanceExecutionPlan({
						mode,
						isCi,
						stagedFiles:
							options.stagedFiles ??
							getStagedFilesFromGit(verifyOptions.rootDir),
						getStagedDiff:
							options.getStagedDiff ??
							((filePath) =>
								getStagedDiffFromGit(filePath, verifyOptions.rootDir)),
					})
				: resolveEnvGovernanceExecutionPlan({ mode, isCi });

		if (!executionPlan.shouldRun) {
			stdout.write(`ENV governance check skipped (${executionPlan.reason}).\n`);
			return 0;
		}

		const result = await verifyEnvGovernance({
			...verifyOptions,
		});
		if (result.warnings.length > 0 && emitSunsetNotices) {
			for (const warning of result.warnings) {
				stderr.write(`[env-governance][notice] ${warning}\n`);
			}
		}
		if (!result.ok) {
			stderr.write("ENV governance check failed.\n");
			for (const issue of result.issues) {
				stderr.write(`${issue}\n`);
			}
			const remediationMap = formatEnvGovernanceRemediationMap(
				buildEnvGovernanceRemediationMap(result.issues),
			);
			for (const line of remediationMap) {
				stderr.write(`${line}\n`);
			}
			return 1;
		}

		stdout.write(
			`ENV governance check passed (${result.contractKeys.length} contract keys; ${result.runtimeKeys.length} runtime key references).\n`,
		);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(
			`ENV governance check failed with unexpected error: ${message}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runVerifyEnvGovernanceCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	collectEnvKeysFromSource,
	collectRuntimeEnvKeys,
	detectEnvGovernanceTriggerFromStaged,
	isProjectEnvKey,
	resolveEnvGovernanceExecutionPlan,
	runVerifyEnvGovernanceCli,
	verifyEnvGovernance,
	buildEnvGovernanceRemediationMap,
	formatEnvGovernanceRemediationMap,
};
