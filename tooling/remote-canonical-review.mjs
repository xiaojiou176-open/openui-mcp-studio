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

function execJson(command, args, options = {}) {
	const stdout = execFileSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return JSON.parse(stdout);
}

async function ensureDirectory(targetPath) {
	await fs.mkdir(targetPath, { recursive: true });
}

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
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
		report.branchProtection.requiredChecks.length === 0
	) {
		return "clean with accepted caveats";
	}
	return "clean";
}

async function runRemoteCanonicalReview(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	await ensureDirectory(path.resolve(rootDir, RELEASE_REPORT_ROOT));

	const repoView = execJson("gh", ["repo", "view", "--json", "nameWithOwner,url,defaultBranchRef,isPrivate"], {
		cwd: rootDir,
	});
	const latestTag = readString(
		execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}),
	);
	const branchProtection = execJson(
		"gh",
		["api", `repos/${repoView.nameWithOwner}/branches/${repoView.defaultBranchRef.name}/protection`],
		{ cwd: rootDir },
	);
	const securityAndAnalysis = execJson(
		"gh",
		["api", `repos/${repoView.nameWithOwner}`],
		{ cwd: rootDir },
	);
	const privateVulnerabilityReporting = execJson(
		"gh",
		["api", `repos/${repoView.nameWithOwner}/private-vulnerability-reporting`],
		{ cwd: rootDir },
	);
	const communityProfile = execJson(
		"gh",
		["api", `repos/${repoView.nameWithOwner}/community/profile`],
		{ cwd: rootDir },
	);
	const codeScanningAnalyses = execJson(
		"gh",
		["api", `repos/${repoView.nameWithOwner}/code-scanning/analyses?per_page=1`],
		{ cwd: rootDir },
	);
	const originUrl = readString(
		execFileSync("git", ["remote", "get-url", "origin"], {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}),
	);
	const mirrorAudit = await runMirrorAudits(rootDir, originUrl);

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
			requiredChecks: branchProtection.required_status_checks?.contexts ?? [],
			requiredApprovingReviewCount:
				branchProtection.required_pull_request_reviews?.required_approving_review_count ?? 0,
			requireCodeOwnerReviews:
				branchProtection.required_pull_request_reviews?.require_code_owner_reviews ?? false,
			enforceAdmins: branchProtection.enforce_admins?.enabled ?? false,
		},
		platform: {
			visibility: securityAndAnalysis.visibility,
			secretScanning:
				securityAndAnalysis.security_and_analysis?.secret_scanning?.status ?? "unknown",
			pushProtection:
				securityAndAnalysis.security_and_analysis?.secret_scanning_push_protection?.status ??
				"unknown",
			privateVulnerabilityReporting:
				privateVulnerabilityReporting.enabled === true ? "enabled" : "disabled",
			codeScanningAnalyses: Array.isArray(codeScanningAnalyses)
				? codeScanningAnalyses.length
				: 0,
			communityHealthPercentage: communityProfile.health_percentage ?? 0,
		},
		mirrorAudit,
		notes: [
			"Current repo clean / mirror clean does not imply upstream clean.",
			"Mirror audit includes baseline gitleaks, pull-refs-aware gitleaks, and trufflehog git.",
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
