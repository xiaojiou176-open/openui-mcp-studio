#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildRepoWorkflowSummary } from "../../services/mcp-server/src/public/workflow-summary.js";

const REPORT_ROOT = ".runtime-cache/reports/release-readiness";
const WORKFLOW_SLICE_ID = "github-pr-ready-packet";

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function parseArgs(argv = process.argv.slice(2)) {
	const options = {
		workspaceRoot: process.cwd(),
		failedRunsLimit: 10,
		writeArtifacts: true,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (token === "--workspace-root") {
			const value = argv[index + 1];
			if (value) {
				options.workspaceRoot = value;
			}
			index += 1;
			continue;
		}
		if (token === "--failed-runs-limit") {
			const value = Number(argv[index + 1]);
			if (Number.isInteger(value) && value > 0) {
				options.failedRunsLimit = value;
			}
			index += 1;
			continue;
		}
		if (token === "--no-artifacts") {
			options.writeArtifacts = false;
		}
	}

	return options;
}

function pushBlocker(blockers, source, reason) {
	if (blockers.some((item) => item.source === source && item.reason === reason)) {
		return;
	}
	blockers.push({ source, reason });
}

function buildRecommendedNextActions(summary) {
	const actions = [summary.nextRecommendedStep];
	if (summary.local.dirty) {
		actions.push(
			"Re-run this packet and local gates after repo-local blockers are addressed.",
		);
	} else if (!summary.github.connected) {
		actions.push(
			"Re-run this packet once GitHub connectivity is restored so live PR, checks, and alert truth can refresh.",
		);
	} else {
		actions.push(
			"Refresh this packet after any new GitHub review or check movement before calling closeout complete.",
		);
	}
	actions.push("Only then move into push / PR mutation with explicit authorization.");
	return actions;
}

function buildWorkflowReadyPayload(input) {
	const summary = input.summary;
	const homepage = summary.repository.homepageUrl ?? "";
	const homepageLooksLikeBlob = homepage.includes("/blob/");
	const latestFailingRun = summary.github.recentFailedRuns[0] ?? null;
	const externalBlockers = [];

	for (const blocker of summary.externalBlockers) {
		if (blocker.toLowerCase().includes("homepage")) {
			pushBlocker(externalBlockers, "github-homepage", blocker);
			continue;
		}
		if (blocker.toLowerCase().includes("code")) {
			pushBlocker(externalBlockers, "code-scanning", blocker);
			continue;
		}
		if (blocker.toLowerCase().includes("secret")) {
			pushBlocker(externalBlockers, "secret-scanning", blocker);
			continue;
		}
		if (blocker.toLowerCase().includes("workflow")) {
			pushBlocker(externalBlockers, "github-actions", blocker);
			continue;
		}
		pushBlocker(externalBlockers, "external-blocker", blocker);
	}

	if (
		homepageLooksLikeBlob &&
		!externalBlockers.some((item) => item.source === "github-homepage")
	) {
		pushBlocker(
			externalBlockers,
			"github-homepage",
			"GitHub Homepage still points at a raw GitHub blob URL instead of the new front door.",
		);
	}
	if (
		(summary.github.openCodeScanningAlertCount ?? 0) > 0 &&
		!externalBlockers.some((item) => item.source === "code-scanning")
	) {
		pushBlocker(
			externalBlockers,
			"code-scanning",
			`${summary.github.openCodeScanningAlertCount} open CodeQL alert(s) still need remote re-analysis on GitHub after repo-local fixes land.`,
		);
	}
	if (
		latestFailingRun &&
		!externalBlockers.some((item) => item.source === "github-actions")
	) {
		pushBlocker(
			externalBlockers,
			"github-actions",
			`Latest failing workflow run is still visible on GitHub: ${latestFailingRun.workflowName} (${latestFailingRun.displayTitle}).`,
		);
	}

	return {
		ok: true,
		checkedAt: summary.generatedAt,
		slice: {
			id: WORKFLOW_SLICE_ID,
			label: "PR-ready GitHub workflow packet",
			summary:
				"Summarize repo-local delivery state together with live GitHub checks, alerts, and branch protection so maintainers know whether the next move is review, remediation, or operator action.",
			whyThisSlice:
				"It is the smallest real bridge from local delivery artifacts to a GitHub-native review/checks workflow without requiring unauthorized remote mutation.",
		},
		repository: {
			nameWithOwner:
				summary.repository.owner && summary.repository.name
					? `${summary.repository.owner}/${summary.repository.name}`
					: null,
			url:
				summary.repository.owner && summary.repository.name
					? `https://github.com/${summary.repository.owner}/${summary.repository.name}`
					: null,
			defaultBranch: summary.repository.defaultBranch,
			currentBranch: summary.local.branch,
			homepage: summary.repository.homepageUrl,
			homepageLooksLikeBlob,
		},
		repoLocal: {
			ready: true,
			workingTreeDirty: summary.local.dirty,
			changedFilesCount: summary.local.changedFileCount,
			changedFilesPreview: summary.local.changedFiles,
			nextActions: [
				"Run local gates and assemble review artifacts before asking GitHub for checks and review.",
				"Use this packet to decide whether the next move is PR prep, more remediation, or release-readiness review.",
			],
		},
		githubConnected: {
			ready: summary.github.connected && summary.github.requiredChecks.length > 0,
			status: summary.github.connected ? "connected" : "blocked",
			requiredChecks: summary.github.requiredChecks,
			requiredApprovingReviewCount:
				summary.github.requiredApprovingReviewCount ?? 0,
			requireCodeOwnerReviews:
				summary.github.requireCodeOwnerReviews ?? false,
			requireConversationResolution:
				summary.github.requireConversationResolution ?? false,
			openPrCount: summary.github.openPullRequestCount ?? 0,
			openIssueCount: summary.github.openIssueCount ?? 0,
			openCodeScanningAlertCount:
				summary.github.openCodeScanningAlertCount ?? 0,
			openSecretScanningAlertCount:
				summary.github.openSecretScanningAlertCount ?? 0,
			openDependabotAlertCount:
				summary.github.openDependabotAlertCount ?? 0,
			blockedReason: summary.github.blockedReason,
			latestFailingRun: latestFailingRun
				? {
						id: latestFailingRun.databaseId,
						workflowName: latestFailingRun.workflowName,
						displayTitle: latestFailingRun.displayTitle,
						url: latestFailingRun.url,
					}
				: null,
		},
		remoteMutation: {
			performed: false,
			requiredForNextStep: [
				"push branch",
				"create or update PR",
				"request reviewer approval",
			],
			note:
				"This slice is intentionally non-mutating. It prepares the packet a maintainer can safely use before any push/PR action.",
		},
		externalBlockers,
		recommendedNextActions: buildRecommendedNextActions(summary),
	};
}

function buildMarkdown(payload) {
	return [
		"# Repo Workflow Ready",
		"",
		`- Checked at: ${payload.checkedAt}`,
		`- Repository: ${payload.repository.nameWithOwner ?? "unknown"}`,
		`- Current branch: ${payload.repository.currentBranch ?? "unknown"}`,
		`- Default branch: ${payload.repository.defaultBranch ?? "unknown"}`,
		"",
		"## Slice",
		`- ${payload.slice.label}`,
		`- ${payload.slice.summary}`,
		"",
		"## Repo-local",
		`- Dirty worktree: ${payload.repoLocal.workingTreeDirty}`,
		`- Changed files: ${payload.repoLocal.changedFilesCount}`,
		...payload.repoLocal.changedFilesPreview.map((line) => `- ${line}`),
		"",
		"## GitHub-connected",
		`- Status: ${payload.githubConnected.status}`,
		`- Required checks: ${payload.githubConnected.requiredChecks.join(", ")}`,
		`- Open PRs: ${payload.githubConnected.openPrCount}`,
		`- Open issues: ${payload.githubConnected.openIssueCount}`,
		`- Open CodeQL alerts: ${payload.githubConnected.openCodeScanningAlertCount}`,
		`- Open secret-scanning alerts: ${payload.githubConnected.openSecretScanningAlertCount}`,
		`- Open dependabot alerts: ${payload.githubConnected.openDependabotAlertCount}`,
		"",
		"## Remote mutation",
		"- This packet is non-mutating by design.",
		...payload.remoteMutation.requiredForNextStep.map((step) => `- ${step}`),
		"",
		"## External blockers",
		...(payload.externalBlockers.length > 0
			? payload.externalBlockers.map((item) => `- ${item.source}: ${item.reason}`)
			: ["- none"]),
		"",
	].join("\n");
}

async function writeArtifacts(rootDir, payload) {
	const reportRoot = path.resolve(rootDir, REPORT_ROOT);
	await fs.mkdir(reportRoot, { recursive: true });
	const jsonPath = path.resolve(reportRoot, "repo-workflow-ready.json");
	const markdownPath = path.resolve(reportRoot, "repo-workflow-ready.md");
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${buildMarkdown(payload)}\n`, "utf8"),
	]);
	return {
		jsonPath: toPosixPath(path.relative(rootDir, jsonPath)),
		markdownPath: toPosixPath(path.relative(rootDir, markdownPath)),
	};
}

async function runRepoWorkflowReadyCli(options = {}) {
	const summaryBuilder = options.summaryBuilder ?? buildRepoWorkflowSummary;
	const workspaceRoot = options.workspaceRoot ?? process.cwd();
	const summary = await summaryBuilder({
		workspaceRoot,
		failedRunsLimit: options.failedRunsLimit ?? 10,
	});
	const payload = buildWorkflowReadyPayload({ summary });
	const artifacts =
		options.writeArtifacts === false
			? null
			: await writeArtifacts(workspaceRoot, payload);
	const finalPayload = artifacts ? { ...payload, artifacts } : payload;
	(options.stdout ?? process.stdout).write(
		`${JSON.stringify(finalPayload, null, 2)}\n`,
	);
	return 0;
}

const isDirectRun =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	runRepoWorkflowReadyCli(parseArgs()).then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	WORKFLOW_SLICE_ID,
	buildWorkflowReadyPayload,
	runRepoWorkflowReadyCli,
};
