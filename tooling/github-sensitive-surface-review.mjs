#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	loadSensitiveSurfaceContract,
	scanLineForSensitiveFindings,
} from "./sensitive-surface-audit.mjs";

const REPORT_ROOT = ".runtime-cache/reports/security";
const GMAIL_QUERY = ["@", "gmail.com"].join("");
const OUTLOOK_QUERY = ["@", "outlook.com"].join("");
const HOTMAIL_QUERY = ["@", "hotmail.com"].join("");
const ICLOUD_QUERY = ["@", "icloud.com"].join("");
const QQ_QUERY = ["@", "qq.com"].join("");
const MACOS_USER_QUERY = ["/", "Users", "/"].join("");
const PRIVATE_VAR_QUERY = ["/", "private", "/", "var", "/"].join("");
const VAR_FOLDERS_QUERY = ["/", "var", "/", "folders", "/"].join("");
const CODE_SEARCH_QUERIES = [
	GMAIL_QUERY,
	OUTLOOK_QUERY,
	HOTMAIL_QUERY,
	ICLOUD_QUERY,
	QQ_QUERY,
	MACOS_USER_QUERY,
	PRIVATE_VAR_QUERY,
	VAR_FOLDERS_QUERY,
];
const MIRROR_SEARCH_SEEDS = [
	"@",
	MACOS_USER_QUERY,
	"/home/",
	PRIVATE_VAR_QUERY,
	VAR_FOLDERS_QUERY,
	"\\Users\\",
	"phone",
	"mobile",
	"telephone",
	"tel",
	"contact",
	"sms",
	"whatsapp",
];
const COMMENT_SURFACES = [
	{
		id: "issue_comments",
		ghArgs: ["api", "repos/{repo}/issues/comments", "--paginate"],
	},
	{
		id: "pull_request_review_comments",
		ghArgs: ["api", "repos/{repo}/pulls/comments", "--paginate"],
	},
];

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shellEscape(value) {
	return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function parseGitHubRepository(originUrl) {
	const value = readString(originUrl);
	if (!value) {
		return null;
	}

	const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u);
	if (sshMatch) {
		return {
			owner: sshMatch[1],
			name: sshMatch[2],
		};
	}

	const httpsMatch = value.match(
		/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u,
	);
	if (httpsMatch) {
		return {
			owner: httpsMatch[1],
			name: httpsMatch[2],
		};
	}

	return null;
}

function resolveOriginRepository(rootDir, originUrl) {
	const explicit = parseGitHubRepository(originUrl);
	if (explicit) {
		return explicit;
	}

	try {
		const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return parseGitHubRepository(remoteUrl);
	} catch {
		return null;
	}
}

function createDefaultGhJsonRunner(rootDir) {
	return async (args) => {
		const shell = process.env.SHELL || "/bin/zsh";
		const commandLine = ["gh", ...args].map(shellEscape).join(" ");
		const stdout = execFileSync(shell, ["-lc", commandLine], {
			cwd: rootDir,
			env: process.env,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return JSON.parse(stdout || "null");
	};
}

function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error?.message ?? null,
	};
}

function parseGitGrepLine(line) {
	const match = line.match(/^([0-9a-f]{40}):([^:]+):(\d+):(.*)$/u);
	if (!match) {
		return null;
	}
	return {
		commit: match[1],
		file: match[2],
		lineNumber: Number(match[3]),
		text: match[4],
	};
}

function summarizeByDetector(findings) {
	return findings.reduce((accumulator, finding) => {
		accumulator[finding.detectorId] = (accumulator[finding.detectorId] ?? 0) + 1;
		return accumulator;
	}, {});
}

function flattenBodies(payload) {
	if (!Array.isArray(payload)) {
		return [];
	}
	return payload
		.map((entry) => (isPlainObject(entry) ? readString(entry.body) : ""))
		.filter(Boolean);
}

function buildCommentFindings({
	surfaceId,
	bodies,
	contract,
}) {
	const findings = [];
	for (const [bodyIndex, body] of bodies.entries()) {
		for (const [lineIndex, line] of body.split(/\r?\n/u).entries()) {
			findings.push(
				...scanLineForSensitiveFindings({
					line,
					lineNumber: lineIndex + 1,
					file: `${surfaceId}#${bodyIndex + 1}`,
					allowedEmailDomains: contract.allowedEmailDomains,
					allowedEmailAddresses: contract.allowedEmailAddresses,
					allowedPhoneRegexes: contract.allowedPhoneRegexes,
					allowedHostPathRegexes: contract.allowedHostPathRegexes,
				}).map((finding) => ({
					...finding,
					surface: surfaceId,
				})),
			);
		}
	}
	return findings;
}

async function runDefaultMirrorAudit({
	rootDir,
	originUrl,
	contract,
}) {
	const mirrorRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-github-sensitive-review-"),
	);
	const mirrorPath = path.join(mirrorRoot, "openui-mcp-studio.git");
	const cleanup = async () => {
		await fs.rm(mirrorRoot, { recursive: true, force: true });
	};

	try {
		const cloneResult = runCommand(
			"git",
			["clone", "--mirror", originUrl, mirrorPath],
			{ cwd: rootDir },
		);
		if (cloneResult.exitCode !== 0) {
			throw new Error(
				cloneResult.stderr.trim() ||
					cloneResult.stdout.trim() ||
					"git clone --mirror failed",
			);
		}

		runCommand(
			"git",
			["-C", mirrorPath, "fetch", "origin", "+refs/pull/*:refs/pull/*"],
			{ cwd: rootDir },
		);

		const refLines = runCommand(
			"git",
			[
				"-C",
				mirrorPath,
				"for-each-ref",
				"--format=%(refname)",
				"refs/heads",
				"refs/tags",
				"refs/pull",
			],
			{ cwd: rootDir },
		).stdout
			.split("\n")
			.map((entry) => entry.trim())
			.filter(Boolean);

		const mainTagRefs = refLines.filter(
			(ref) => ref.startsWith("refs/heads/") || ref.startsWith("refs/tags/"),
		);
		const pullRefs = refLines.filter((ref) => ref.startsWith("refs/pull/"));

		const scanRefs = (refs, surface) => {
			const findings = [];
			if (refs.length === 0) {
				return findings;
			}
			const revList = runCommand(
				"git",
				["-C", mirrorPath, "rev-list", ...refs],
				{ cwd: rootDir },
			).stdout
				.split("\n")
				.map((entry) => entry.trim())
				.filter(Boolean);
			for (const commit of revList) {
				const grepOutput = runCommand(
					"git",
					[
						"-C",
						mirrorPath,
						"grep",
						"-F",
						"-n",
						"-I",
						"--no-color",
						...MIRROR_SEARCH_SEEDS.flatMap((seed) => ["-e", seed]),
						commit,
						"--",
						".",
					],
					{ cwd: rootDir },
				).stdout;
				for (const rawLine of grepOutput.split("\n")) {
					const parsed = parseGitGrepLine(rawLine.trim());
					if (!parsed) {
						continue;
					}
					const normalizedPath = toPosixPath(parsed.file);
					if (
						contract.ignoredPathRegexes.some((pattern) =>
							pattern.test(normalizedPath),
						)
					) {
						continue;
					}
					findings.push(
						...scanLineForSensitiveFindings({
							line: parsed.text,
							lineNumber: parsed.lineNumber,
							file: normalizedPath,
							allowedEmailDomains: contract.allowedEmailDomains,
							allowedEmailAddresses: contract.allowedEmailAddresses,
							allowedPhoneRegexes: contract.allowedPhoneRegexes,
							allowedHostPathRegexes: contract.allowedHostPathRegexes,
						}).map((finding) => ({
							...finding,
							commit,
							surface,
						})),
					);
				}
			}
			return findings;
		};

		return {
			mainTagFindings: scanRefs(mainTagRefs, "remote_heads_tags"),
			pullRefFindings: scanRefs(pullRefs, "remote_pull_refs"),
			pullRefCount: pullRefs.length,
		};
	} finally {
		await cleanup();
	}
}

function buildMarkdown(report) {
	return [
		"# GitHub Sensitive Surface Review",
		"",
		`- Generated at: ${report.generatedAt}`,
		`- Repository: ${report.repository}`,
		`- Verdict: **${report.ok ? "clean" : "findings"}**`,
		"",
		"## Summary",
		"",
		`- Open secret-scanning alerts: ${report.secretScanning.openAlertCount}`,
		`- Open code-scanning alerts: ${report.codeScanning.openAlertCount}`,
		`- Code-search findings: ${report.codeSearch.totalFindings}`,
		`- Comment-surface findings: ${report.commentSurfaces.totalFindings}`,
		`- Remote heads/tags findings: ${report.remoteRefs.mainTagFindingCount}`,
		`- Remote pull-ref findings: ${report.remoteRefs.pullRefFindingCount}`,
		`- Remote pull-ref count: ${report.remoteRefs.pullRefCount}`,
		"",
		"## Notes",
		"",
		...report.notes.map((note) => `- ${note}`),
		"",
	].join("\n");
}

async function runGithubSensitiveSurfaceReview(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const repository =
		options.repository ??
		resolveOriginRepository(rootDir, options.originUrl ?? "");
	if (!repository) {
		throw new Error("Could not resolve GitHub repository from origin.");
	}

	const contract = await loadSensitiveSurfaceContract(
		rootDir,
		options.contractPath,
	);
	const ghJsonRunner =
		options.ghJsonRunner ?? createDefaultGhJsonRunner(rootDir);
	const mirrorAuditRunner =
		options.mirrorAuditRunner ?? runDefaultMirrorAudit;

	const repoSlug = `${repository.owner}/${repository.name}`;
	const secretAlerts = await ghJsonRunner([
		"api",
		`repos/${repoSlug}/secret-scanning/alerts?state=open&per_page=100`,
	]);
	const codeScanningAlerts = await ghJsonRunner([
		"api",
		`repos/${repoSlug}/code-scanning/alerts?state=open&per_page=100`,
	]);

	const commentFindings = [];
	for (const surface of COMMENT_SURFACES) {
		const payload = await ghJsonRunner(
			surface.ghArgs.map((entry) =>
				entry.replace("{repo}", repoSlug),
			),
		);
		commentFindings.push(
			...buildCommentFindings({
				surfaceId: surface.id,
				bodies: flattenBodies(payload),
				contract,
			}),
		);
	}

	const mirrorAudit = await mirrorAuditRunner({
		rootDir,
		originUrl:
			options.originUrl ??
			`git@github.com:${repository.owner}/${repository.name}.git`,
		contract,
	});

	const codeSearchFindings = [];
	const blockingFindingsAlreadyPresent =
		(Array.isArray(secretAlerts) ? secretAlerts.length : 0) > 0 ||
		(Array.isArray(codeScanningAlerts) ? codeScanningAlerts.length : 0) > 0 ||
		commentFindings.length > 0 ||
		mirrorAudit.mainTagFindings.length > 0 ||
		mirrorAudit.pullRefFindings.length > 0;
	const notes = [
		"Code search is heuristic and query-limited.",
		"Comment-surface review is read-only and scans issue comments plus PR review comments.",
		"Remote mirror review inspects heads/tags plus GitHub-managed pull refs when they are fetchable.",
	];

	if (!blockingFindingsAlreadyPresent) {
		for (const query of CODE_SEARCH_QUERIES) {
			const results = await ghJsonRunner([
				"search",
				"code",
				`${query} repo:${repoSlug}`,
				"--limit",
				"20",
				"--json",
				"path",
			]);
			for (const result of Array.isArray(results) ? results : []) {
				codeSearchFindings.push({
					query,
					path: readString(result?.path),
				});
			}
		}
	} else {
		notes.push(
			"Code search was skipped because earlier GitHub public-surface checks already found blocking findings.",
		);
	}

	const report = {
		generatedAt: new Date().toISOString(),
		repository: repoSlug,
		secretScanning: {
			openAlertCount: Array.isArray(secretAlerts) ? secretAlerts.length : 0,
		},
		codeScanning: {
			openAlertCount: Array.isArray(codeScanningAlerts)
				? codeScanningAlerts.length
				: 0,
		},
		codeSearch: {
			totalFindings: codeSearchFindings.length,
			findings: codeSearchFindings,
		},
		commentSurfaces: {
			totalFindings: commentFindings.length,
			summaryByDetector: summarizeByDetector(commentFindings),
			findings: commentFindings,
		},
		remoteRefs: {
			mainTagFindingCount: mirrorAudit.mainTagFindings.length,
			pullRefFindingCount: mirrorAudit.pullRefFindings.length,
			pullRefCount: Number(mirrorAudit.pullRefCount ?? 0),
			mainTagFindings: mirrorAudit.mainTagFindings,
			pullRefFindings: mirrorAudit.pullRefFindings,
		},
		notes,
	};

	const reportPath = path.resolve(
		rootDir,
		REPORT_ROOT,
		"github-sensitive-surface-review.json",
	);
	const markdownPath = path.resolve(
		rootDir,
		REPORT_ROOT,
		"github-sensitive-surface-review.md",
	);
	await fs.mkdir(path.dirname(reportPath), { recursive: true });
	await Promise.all([
		fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${buildMarkdown(report)}\n`, "utf8"),
	]);

	const ok =
		report.secretScanning.openAlertCount === 0 &&
		report.codeScanning.openAlertCount === 0 &&
		report.codeSearch.totalFindings === 0 &&
		report.commentSurfaces.totalFindings === 0 &&
		report.remoteRefs.mainTagFindingCount === 0 &&
		report.remoteRefs.pullRefFindingCount === 0;

	return {
		ok,
		reportPath: toPosixPath(path.relative(rootDir, reportPath)),
		markdownPath: toPosixPath(path.relative(rootDir, markdownPath)),
		report,
	};
}

async function main() {
	try {
		const result = await runGithubSensitiveSurfaceReview();
		if (!result.ok) {
			console.error(
				`[github-sensitive-surface-review] FAILED (${result.reportPath}; codeScanning=${result.report.codeScanning.openAlertCount}; codeSearch=${result.report.codeSearch.totalFindings}; comments=${result.report.commentSurfaces.totalFindings}; pullRefs=${result.report.remoteRefs.pullRefFindingCount})`,
			);
			process.exit(1);
		}
		console.log(
			`[github-sensitive-surface-review] OK (${result.reportPath}; pullRefs=${result.report.remoteRefs.pullRefCount})`,
		);
	} catch (error) {
		console.error(
			`[github-sensitive-surface-review] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	void main();
}

export { runGithubSensitiveSurfaceReview };
