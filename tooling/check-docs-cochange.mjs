#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DOC_FILES = [/^docs\/.+\.md$/u, /^README\.md$/u];
const DEPENDENCY_TRIGGER_FILES = [
	/^package\.json$/u,
	/^package-lock\.json$/u,
	/^npm-shrinkwrap\.json$/u,
];
const ENV_TRIGGER_FILES = [
	/^src\/env-contract\.ts$/u,
	/^src\/constants\.ts$/u,
	/^\.env(\.development|\.staging|\.production)?\.example$/u,
];
const WORKFLOW_TRIGGER_FILES = [/^\.github\/workflows\/.+\.ya?ml$/u];
const SIGNATURE_TRIGGER_FILES = [/^src\/.+\.(ts|tsx|js|mjs|cjs)$/u];
const FUNCTION_SIGNATURE_PATTERN =
	/^\s*(export\s+)?(async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(|^\s*(export\s+)?const\s+[A-Za-z_$][\w$]*\s*=\s*(async\s*)?\([^)]*\)\s*=>|^\s*(export\s+)?(interface|type)\s+[A-Za-z_$][\w$]*\s*[={<]/u;
const API_SURFACE_PATTERN =
	/^\s*(app|router)\.(get|post|put|patch|delete|options|head)\s*\(|^\s*(export\s+)?(const|let)\s+\w*(route|handler|endpoint)\w*\s*=/iu;
const COCHANGE_TRIGGERS = [
	{
		id: "dependency-change",
		label: "Dependency change",
		filePatterns: DEPENDENCY_TRIGGER_FILES,
		requiresDiffPattern: false,
	},
	{
		id: "env-contract-change",
		label: "Environment contract change",
		filePatterns: ENV_TRIGGER_FILES,
		requiresDiffPattern: false,
	},
	{
		id: "workflow-change",
		label: "Workflow or IaC change",
		filePatterns: WORKFLOW_TRIGGER_FILES,
		requiresDiffPattern: false,
	},
	{
		id: "api-or-signature-change",
		label: "API or signature change",
		filePatterns: SIGNATURE_TRIGGER_FILES,
		requiresDiffPattern: true,
	},
];

const ciMode = process.argv.includes("--ci");
const DEFAULT_CI_BASE_REFS = ["origin/main", "origin/master", "main", "master"];
const ciFallbackDiagnostics = [];

function parseWhitelistPatterns(envName) {
	const raw = process.env[envName] ?? "";
	return raw
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((pattern) => new RegExp(pattern, "u"));
}

function parseNameStatusOutput(stdout) {
	return Array.from(
		new Set(
			stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.flatMap((line) => {
					const parts = line.split(/\t+/u).filter(Boolean);
					if (parts.length < 2) {
						return [];
					}
					const status = parts[0];
					if (status.startsWith("R") || status.startsWith("C")) {
						return parts.slice(1);
					}
					return [parts[1]];
				}),
		),
	);
}

function gitRefExists(ref) {
	const result = spawnSync(
		"git",
		["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
		{
			encoding: "utf8",
		},
	);
	return result.status === 0;
}

function resolveCiDiffContext() {
	const requestedBaseRef = (process.env.GITHUB_BASE_REF ?? "").trim();
	const candidates = [];

	if (requestedBaseRef) {
		candidates.push(`origin/${requestedBaseRef}`, requestedBaseRef);
	} else {
		ciFallbackDiagnostics.push(
			"GITHUB_BASE_REF is not set; trying default base branch candidates.",
		);
	}

	for (const defaultRef of DEFAULT_CI_BASE_REFS) {
		candidates.push(defaultRef);
	}

	const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
	for (const ref of uniqueCandidates) {
		if (gitRefExists(ref)) {
			const mode = requestedBaseRef
				? ref === `origin/${requestedBaseRef}` || ref === requestedBaseRef
					? "requested-base"
					: "fallback-base"
				: "fallback-base";
			if (mode !== "requested-base") {
				ciFallbackDiagnostics.push(`Using fallback base ref: ${ref}`);
			}
			return {
				mode,
				rangeArgs: [`${ref}...HEAD`],
				rangeLabel: `${ref}...HEAD`,
			};
		}
		ciFallbackDiagnostics.push(`Base ref candidate does not exist: ${ref}`);
	}

	if (gitRefExists("HEAD~1")) {
		ciFallbackDiagnostics.push(
			"No usable base branch was found; falling back to HEAD~1...HEAD.",
		);
		return {
			mode: "fallback-head-parent",
			rangeArgs: ["HEAD~1...HEAD"],
			rangeLabel: "HEAD~1...HEAD",
		};
	}

	ciFallbackDiagnostics.push(
		"No usable base branch or HEAD~1 found; falling back to --root HEAD.",
	);
	return {
		mode: "fallback-root",
		rangeArgs: ["--root", "HEAD"],
		rangeLabel: "--root HEAD",
	};
}

const ciDiffContext = ciMode ? resolveCiDiffContext() : null;

function getCiNameStatusArgs() {
	if (!ciDiffContext) {
		throw new Error("internal error: CI diff context is missing.");
	}
	return [
		"diff",
		"--name-status",
		"--diff-filter=ACMRD",
		...ciDiffContext.rangeArgs,
	];
}

function getCiUnifiedDiffArgs(file) {
	if (!ciDiffContext) {
		throw new Error("internal error: CI diff context is missing.");
	}
	return ["diff", "--unified=0", ...ciDiffContext.rangeArgs, "--", file];
}

function getChangedFiles() {
	if (ciMode) {
		const result = spawnSync("git", getCiNameStatusArgs(), {
			encoding: "utf8",
		});
		if (result.status !== 0) {
			const stderr = (result.stderr || "").trim();
			throw new Error(
				stderr ||
					`Unable to read CI diff file list (diff=${ciDiffContext?.rangeLabel ?? "unknown"}).`,
			);
		}
		return parseNameStatusOutput(result.stdout || "");
	}
	return getStagedFiles();
}

function getStagedFiles() {
	const inRepoResult = spawnSync(
		"git",
		["rev-parse", "--is-inside-work-tree"],
		{
			encoding: "utf8",
		},
	);
	if (
		inRepoResult.status !== 0 ||
		(inRepoResult.stdout || "").trim() !== "true"
	) {
		throw new Error("The current directory is not a Git worktree; docs/code co-change check cannot run.");
	}

	const result = spawnSync(
		"git",
		["diff", "--cached", "--name-status", "--diff-filter=ACMRD"],
		{ encoding: "utf8" },
	);
	if (result.status !== 0) {
		const stderr = (result.stderr || "").trim();
		throw new Error(stderr || "Unable to read staged file list.");
	}
	return parseNameStatusOutput(result.stdout || "");
}

function getStagedDiff(file) {
	const diffArgs = ciMode
		? getCiUnifiedDiffArgs(file)
		: ["diff", "--cached", "--unified=0", "--", file];
	const result = spawnSync("git", diffArgs, {
		encoding: "utf8",
	});
	if (result.status !== 0) {
		const stderr = (result.stderr || "").trim();
		throw new Error(stderr || `Unable to read diff for: ${file}`);
	}
	return result.stdout || "";
}

function printCiFallbackDiagnostics() {
	if (!ciMode || !ciDiffContext || ciDiffContext.mode === "requested-base") {
		return;
	}
	console.warn(
		`[precommit-docs] WARN: CI base ref fallback enabled (diff=${ciDiffContext.rangeLabel}).`,
	);
	for (const message of ciFallbackDiagnostics) {
		console.warn(`[precommit-docs] WARN: ${message}`);
	}
}

function matchesAny(file, patterns) {
	return patterns.some((pattern) => pattern.test(file));
}

function hasApiOrSignatureChange(diffText) {
	const changedLines = diffText
		.split("\n")
		.filter(
			(line) =>
				(line.startsWith("+") || line.startsWith("-")) &&
				!line.startsWith("+++") &&
				!line.startsWith("---"),
		)
		.map((line) => line.slice(1));
	return changedLines.some(
		(line) =>
			FUNCTION_SIGNATURE_PATTERN.test(line) || API_SURFACE_PATTERN.test(line),
	);
}

const docsWhitelist = parseWhitelistPatterns("DOCS_COCHANGE_WHITELIST");
const docsRequireRegex = parseWhitelistPatterns("DOCS_COCHANGE_REQUIRE_REGEX");

function isWhitelisted(file) {
	return matchesAny(file, docsWhitelist);
}

function hasRequiredDocs(files) {
	return files.some((file) => matchesAny(file, DOC_FILES) || matchesAny(file, docsRequireRegex));
}

function main() {
	const files = getChangedFiles();
	printCiFallbackDiagnostics();

	if (files.length === 0) {
		console.log("[precommit-docs] OK (no changed files)");
		return;
	}

	const docsChanged = hasRequiredDocs(files);
	const violations = [];

	for (const trigger of COCHANGE_TRIGGERS) {
		const matchingFiles = files.filter((file) => matchesAny(file, trigger.filePatterns));
		if (matchingFiles.length === 0) {
			continue;
		}
		if (docsChanged) {
			continue;
		}

		if (trigger.requiresDiffPattern) {
			const hasSignatureChange = matchingFiles.some((file) =>
				hasApiOrSignatureChange(getStagedDiff(file)),
			);
			if (!hasSignatureChange) {
				continue;
			}
		}

		if (matchingFiles.every(isWhitelisted)) {
			continue;
		}

		violations.push(
			`${trigger.label} requires docs co-change. Add or update README/docs in the same change.`,
		);
	}

	if (violations.length > 0) {
		for (const violation of violations) {
			console.error(`[precommit-docs] ${violation}`);
		}
		process.exit(1);
	}

	console.log("[precommit-docs] OK");
}

main();
