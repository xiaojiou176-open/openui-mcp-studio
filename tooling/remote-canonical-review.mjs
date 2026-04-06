#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const RELEASE_REPORT_ROOT = ".runtime-cache/reports/release-readiness";
const SECURITY_REPORT_ROOT = ".runtime-cache/reports/security";

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		command,
		args,
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		error: result.error?.message ?? null,
	};
}

function shellEscape(value) {
	return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function execGhJson(args, options = {}) {
	const shell = process.env.SHELL || "/bin/zsh";
	const commandLine = ["gh", ...args].map(shellEscape).join(" ");
	const stdout = execFileSync(shell, ["-lc", commandLine], {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return JSON.parse(stdout);
}

async function fetchGithubRestJson(pathname) {
	const response = await fetch(`https://api.github.com/${pathname.replace(/^\/+/u, "")}`, {
		headers: {
			"accept": "application/vnd.github+json",
			"user-agent": "openui-mcp-studio/remote-canonical-review",
			"x-github-api-version": "2022-11-28",
		},
	});
	if (!response.ok) {
		const message = await response.text();
		const error = new Error(
			`GitHub REST request failed (${response.status}): ${pathname} :: ${message}`,
		);
		error.status = response.status;
		throw error;
	}
	return response.json();
}

async function readGithubJsonWithFallback(ghArgs, restPathname, options = {}) {
	try {
		return {
			data: execGhJson(ghArgs, options),
			source: "gh",
		};
	} catch (ghError) {
		try {
			return {
				data: await fetchGithubRestJson(restPathname),
				source: "rest",
			};
		} catch (restError) {
			const error = new Error(
				`gh failed (${ghError instanceof Error ? ghError.message : String(ghError)}); REST fallback failed (${restError instanceof Error ? restError.message : String(restError)})`,
			);
			throw error;
		}
	}
}

async function readGithubJsonOptional(ghArgs, restPathname, options = {}) {
	try {
		return await readGithubJsonWithFallback(ghArgs, restPathname, options);
	} catch {
		return {
			data: null,
			source: "unavailable",
		};
	}
}

async function ensureDirectory(targetPath) {
	await fs.mkdir(targetPath, { recursive: true });
}

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
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

	const httpsMatch = value.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u);
	if (httpsMatch) {
		return {
			owner: httpsMatch[1],
			name: httpsMatch[2],
		};
	}

	return null;
}

function buildMarkdown(report) {
	return [
		"# Remote Canonical Review",
		"",
		`- Generated at: ${report.generatedAt}`,
		`- Repository: ${report.repository.nameWithOwner}`,
		`- URL: ${report.repository.url}`,
		`- Default branch: ${report.repository.defaultBranch}`,
		`- Latest tag: ${report.repository.latestTag}`,
		`- Verdict: **${report.verdict}**`,
		"",
		"## Platform",
		"",
		"| Check | Value |",
		"| --- | --- |",
		`| Visibility | ${report.platform.visibility} |`,
		`| Secret scanning | ${report.platform.secretScanning} |`,
		`| Push protection | ${report.platform.pushProtection} |`,
		`| Private vulnerability reporting | ${report.platform.privateVulnerabilityReporting} |`,
		`| Live Gemini environment | ${report.platform.liveGeminiEnvironment.status} |`,
		`| Code scanning analyses | ${report.platform.codeScanningAnalyses} |`,
		`| Community health | ${report.platform.communityHealthPercentage} |`,
		"",
		"## Branch Protection",
		"",
		`- Required checks: ${report.branchProtection.requiredChecks.join(", ")}`,
		`- Required approving reviews: ${report.branchProtection.requiredApprovingReviewCount}`,
		`- Require code owner reviews: ${report.branchProtection.requireCodeOwnerReviews}`,
		`- Enforce admins: ${report.branchProtection.enforceAdmins}`,
		"",
		"## Mirror Audit",
		"",
		"| Audit | Status | Raw report |",
		"| --- | --- | --- |",
		`| Baseline gitleaks | ${report.mirrorAudit.baselineGitleaks.status} | \`${report.mirrorAudit.baselineGitleaks.reportPath}\` |`,
		`| Pull-refs gitleaks | ${report.mirrorAudit.pullRefsGitleaks.status} | \`${report.mirrorAudit.pullRefsGitleaks.reportPath}\` |`,
		`| TruffleHog git | ${report.mirrorAudit.trufflehogGit.status} | \`${report.mirrorAudit.trufflehogGit.reportPath}\` |`,
		"",
		"## Notes",
		"",
		...report.notes.map((note) => `- ${note}`),
		"",
	].join("\n");
}

function classifyMirrorStatus(exitCode, findingsPath) {
	if (exitCode === 0) {
		return {
			status: "clean",
			reportPath: findingsPath,
		};
	}
	if (exitCode === 1 || exitCode === 183) {
		return {
			status: "findings",
			reportPath: findingsPath,
		};
	}
	return {
		status: "error",
		reportPath: findingsPath,
	};
}

async function runMirrorAudits(rootDir, originUrl) {
	const reportRoot = path.resolve(rootDir, SECURITY_REPORT_ROOT);
	await ensureDirectory(reportRoot);

	const mirrorRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-remote-canonical-review-"),
	);
	const mirrorPath = path.join(mirrorRoot, "openui-mcp-studio.git");

	try {
		const cloneResult = runCommand("git", ["clone", "--mirror", originUrl, mirrorPath], {
			cwd: rootDir,
		});
		if (cloneResult.exitCode !== 0) {
			throw new Error(cloneResult.stderr.trim() || cloneResult.stdout.trim() || "git clone --mirror failed");
		}

		const baselineGitleaksReport = path.resolve(
			reportRoot,
			"final-mirror-gitleaks-baseline.json",
		);
		const baselineGitleaks = runCommand(
			"gitleaks",
			[
				"detect",
				"--source",
				mirrorPath,
				"--config",
				path.resolve(rootDir, ".gitleaks.toml"),
				"--redact",
				"--report-format",
				"json",
				"--report-path",
				baselineGitleaksReport,
				"--log-opts=--all",
			],
			{ cwd: rootDir },
		);

		const fetchPullRefs = runCommand(
			"git",
			["-C", mirrorPath, "fetch", "origin", "+refs/pull/*:refs/pull/*"],
			{ cwd: rootDir },
		);
		if (fetchPullRefs.exitCode !== 0) {
			throw new Error(fetchPullRefs.stderr.trim() || fetchPullRefs.stdout.trim() || "git fetch pull refs failed");
		}

		const pullRefsGitleaksReport = path.resolve(
			reportRoot,
			"final-mirror-gitleaks-pull-refs.json",
		);
		const pullRefsGitleaks = runCommand(
			"gitleaks",
			[
				"detect",
				"--source",
				mirrorPath,
				"--config",
				path.resolve(rootDir, ".gitleaks.toml"),
				"--redact",
				"--report-format",
				"json",
				"--report-path",
				pullRefsGitleaksReport,
				"--log-opts=--all",
			],
			{ cwd: rootDir },
		);

		const trufflehogReport = path.resolve(
			reportRoot,
			"final-mirror-trufflehog-git.json",
		);
		const trufflehogArgs = [
			"git",
			"--json",
			"--no-update",
			"--fail",
			"--bare",
			`file://${mirrorPath}`,
		];
		const trufflehog = runCommand("trufflehog", trufflehogArgs, { cwd: rootDir });
		await fs.writeFile(
			trufflehogReport,
			trufflehog.stdout.trim() ? trufflehog.stdout : "[]\n",
			"utf8",
		);

		return {
			baselineGitleaks: classifyMirrorStatus(
				baselineGitleaks.exitCode,
				toPosixPath(path.relative(rootDir, baselineGitleaksReport)),
			),
			pullRefsGitleaks: classifyMirrorStatus(
				pullRefsGitleaks.exitCode,
				toPosixPath(path.relative(rootDir, pullRefsGitleaksReport)),
			),
			trufflehogGit: classifyMirrorStatus(
				trufflehog.exitCode,
				toPosixPath(path.relative(rootDir, trufflehogReport)),
			),
		};
	} finally {
		await fs.rm(mirrorRoot, { recursive: true, force: true });
	}
}

function summarizeLiveGeminiEnvironment(environment) {
	if (!environment || typeof environment !== "object") {
		return {
			status: "missing",
			reviewers: [],
			preventSelfReview: false,
			protectedBranchesOnly: false,
		};
	}

	const protectionRules = Array.isArray(environment.protection_rules)
		? environment.protection_rules
		: [];
	const requiredReviewersRule =
		protectionRules.find((rule) => rule?.type === "required_reviewers") ?? null;
	const reviewers = Array.isArray(requiredReviewersRule?.reviewers)
		? requiredReviewersRule.reviewers
				.map((entry) => readString(entry?.reviewer?.login))
				.filter(Boolean)
		: [];
	const deploymentBranchPolicy =
		typeof environment.deployment_branch_policy === "object" &&
		environment.deployment_branch_policy !== null
			? environment.deployment_branch_policy
			: {};
	const protectedBranchesOnly =
		deploymentBranchPolicy.protected_branches === true &&
		deploymentBranchPolicy.custom_branch_policies === false;
	const preventSelfReview = requiredReviewersRule?.prevent_self_review === true;

	return {
		status:
			reviewers.length > 0 && protectedBranchesOnly
				? "protected_review_required"
				: "present_but_unprotected",
		reviewers,
		preventSelfReview,
		protectedBranchesOnly,
	};
}

function computeVerdict(report) {
	const statuses = [
		report.mirrorAudit.baselineGitleaks.status,
		report.mirrorAudit.pullRefsGitleaks.status,
		report.mirrorAudit.trufflehogGit.status,
	];
	if (statuses.includes("findings") || statuses.includes("error")) {
		return "not clean / follow-up required";
	}
	if (
		report.platform.secretScanning !== "enabled" ||
		report.platform.pushProtection !== "enabled" ||
		report.platform.privateVulnerabilityReporting !== "enabled" ||
		report.platform.liveGeminiEnvironment.status !== "protected_review_required" ||
		report.branchProtection.requiredChecks.length === 0
	) {
		return "clean with accepted caveats";
	}
	return "clean";
}

async function runRemoteCanonicalReview(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	await ensureDirectory(path.resolve(rootDir, RELEASE_REPORT_ROOT));
	const optionalGithubReader =
		options.optionalGithubReader ?? readGithubJsonOptional;
	const mirrorAuditRunner = options.mirrorAuditRunner ?? runMirrorAudits;
	const latestTagReader =
		options.latestTagReader ??
		(() =>
			readString(
				execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
					cwd: rootDir,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}),
			));
	const originUrl =
		readString(options.originUrl) ||
		readString(
			execFileSync("git", ["remote", "get-url", "origin"], {
				cwd: rootDir,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}),
		);
	const originRepository = parseGitHubRepository(originUrl);
	const explicitRepo = originRepository
		? `${originRepository.owner}/${originRepository.name}`
		: null;
	if (!explicitRepo) {
		throw new Error("Could not resolve origin GitHub repository from git remote.");
	}

	const repoApiRead = await optionalGithubReader(
		[
			"api",
			`repos/${explicitRepo}`,
		],
		`repos/${explicitRepo}`,
		{
			cwd: rootDir,
		},
	);
	const repoApi = repoApiRead.data;
	const repoView = {
		nameWithOwner: readString(repoApi?.full_name) || explicitRepo,
		url: readString(repoApi?.html_url) || `https://github.com/${explicitRepo}`,
		defaultBranchRef: {
			name: readString(repoApi?.default_branch) || "main",
		},
		isPrivate: repoApi?.private === true,
	};
	const latestTag = latestTagReader();
	const branchProtectionRead = await optionalGithubReader(
		["api", `repos/${repoView.nameWithOwner}/branches/${repoView.defaultBranchRef.name}/protection`],
		`repos/${repoView.nameWithOwner}/branches/${repoView.defaultBranchRef.name}/protection`,
		{ cwd: rootDir },
	);
	const securityAndAnalysisRead = await optionalGithubReader(
		["api", `repos/${repoView.nameWithOwner}`],
		`repos/${repoView.nameWithOwner}`,
		{ cwd: rootDir },
	);
	const privateVulnerabilityReportingRead = await optionalGithubReader(
		["api", `repos/${repoView.nameWithOwner}/private-vulnerability-reporting`],
		`repos/${repoView.nameWithOwner}/private-vulnerability-reporting`,
		{ cwd: rootDir },
	);
	const communityProfileRead = await optionalGithubReader(
		["api", `repos/${repoView.nameWithOwner}/community/profile`],
		`repos/${repoView.nameWithOwner}/community/profile`,
		{ cwd: rootDir },
	);
	const codeScanningAnalysesRead = await optionalGithubReader(
		["api", `repos/${repoView.nameWithOwner}/code-scanning/analyses?per_page=1`],
		`repos/${repoView.nameWithOwner}/code-scanning/analyses?per_page=1`,
		{ cwd: rootDir },
	);
	const liveGeminiEnvironmentRead = await optionalGithubReader(
		["api", `repos/${repoView.nameWithOwner}/environments/live-gemini-manual`],
		`repos/${repoView.nameWithOwner}/environments/live-gemini-manual`,
		{ cwd: rootDir },
	);
	const branchProtection = branchProtectionRead.data;
	const securityAndAnalysis = securityAndAnalysisRead.data;
	const privateVulnerabilityReporting = privateVulnerabilityReportingRead.data;
	const communityProfile = communityProfileRead.data;
	const codeScanningAnalyses = codeScanningAnalysesRead.data;
	const liveGeminiEnvironment = liveGeminiEnvironmentRead.data;
	const mirrorAudit = await mirrorAuditRunner(rootDir, originUrl);

	const report = {
		generatedAt: new Date().toISOString(),
		repository: {
			nameWithOwner: repoView.nameWithOwner,
			url: repoView.url,
			defaultBranch: repoView.defaultBranchRef.name,
			latestTag,
			isPrivate: repoView.isPrivate,
		},
		branchProtection: {
			requiredChecks: branchProtection?.required_status_checks?.contexts ?? [],
			requiredApprovingReviewCount:
				branchProtection?.required_pull_request_reviews?.required_approving_review_count ?? 0,
			requireCodeOwnerReviews:
				branchProtection?.required_pull_request_reviews?.require_code_owner_reviews ?? false,
			enforceAdmins: branchProtection?.enforce_admins?.enabled ?? false,
		},
		platform: {
			visibility: securityAndAnalysis?.visibility ?? "unknown",
			secretScanning:
				securityAndAnalysis?.security_and_analysis?.secret_scanning?.status ?? "unknown",
			pushProtection:
				securityAndAnalysis?.security_and_analysis?.secret_scanning_push_protection?.status ??
				"unknown",
			privateVulnerabilityReporting:
				privateVulnerabilityReporting?.enabled === true ? "enabled" : "unknown",
			liveGeminiEnvironment: summarizeLiveGeminiEnvironment(liveGeminiEnvironment),
			codeScanningAnalyses: Array.isArray(codeScanningAnalyses)
				? codeScanningAnalyses.length
				: 0,
			communityHealthPercentage: communityProfile?.health_percentage ?? 0,
		},
		mirrorAudit,
		notes: [
			"Current repo clean / mirror clean does not imply upstream clean.",
			"Mirror audit includes baseline gitleaks, pull-refs-aware gitleaks, and trufflehog git.",
			`Repository metadata source: ${repoApiRead.source}.`,
			`Branch protection source: ${branchProtectionRead.source}.`,
			`Community profile source: ${communityProfileRead.source}.`,
			`Code scanning source: ${codeScanningAnalysesRead.source}.`,
			`Live Gemini environment source: ${liveGeminiEnvironmentRead.source}.`,
		],
	};
	report.verdict = computeVerdict(report);

	const jsonPath = path.resolve(
		rootDir,
		RELEASE_REPORT_ROOT,
		"remote-canonical-review.json",
	);
	const markdownPath = path.resolve(
		rootDir,
		RELEASE_REPORT_ROOT,
		"remote-canonical-review.md",
	);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${buildMarkdown(report)}\n`, "utf8"),
	]);

	return {
		ok: report.verdict !== "not clean / follow-up required",
		verdict: report.verdict,
		jsonPath: toPosixPath(path.relative(rootDir, jsonPath)),
		markdownPath: toPosixPath(path.relative(rootDir, markdownPath)),
	};
}

async function main() {
	try {
		const result = await runRemoteCanonicalReview();
		console.log(JSON.stringify(result, null, 2));
		process.exitCode = result.ok ? 0 : 1;
	} catch (error) {
		console.error(
			`[remote-canonical-review] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runRemoteCanonicalReview };
