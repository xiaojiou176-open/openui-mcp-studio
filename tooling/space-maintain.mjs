#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
	buildReportFileNames,
	buildSpaceGovernanceContext,
	formatBytes,
} from "./shared/space-governance.mjs";
import { maybeRunToolCacheJanitor } from "./shared/tool-cache-env.mjs";
import { generateSpaceGovernanceReport } from "./space-governance-report.mjs";
import {
	generateSpaceVerificationReport,
} from "./space-verify-candidates.mjs";

const PROTECTED_APPLY_PATHS = new Set([".git", "node_modules", ".runtime-cache"]);

function parseCliArgs(argv = process.argv.slice(2)) {
	const options = {
		apply: false,
		includeInstallSurface: false,
		label: "maintenance",
	};
	for (const arg of argv) {
		if (arg === "--apply") {
			options.apply = true;
			continue;
		}
		if (arg === "--include-install-surface") {
			options.includeInstallSurface = true;
			continue;
		}
		if (arg.startsWith("--label=")) {
			options.label = arg.slice("--label=".length).trim() || "maintenance";
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

async function ensureWritableThenRemove(targetPath) {
	try {
		await fs.access(targetPath);
	} catch {
		return;
	}
	await fs.chmod(targetPath, 0o755).catch(() => {});
	const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const childPath = path.join(targetPath, entry.name);
		if (entry.isDirectory()) {
			await ensureWritableThenRemove(childPath);
			continue;
		}
		await fs.chmod(childPath, 0o644).catch(() => {});
	}
	await fs.rm(targetPath, { recursive: true, force: true });
}

function buildMaintenanceMarkdown(summary) {
	const lines = [
		"# Space Maintenance Summary",
		"",
		`- Mode: ${summary.mode}`,
		`- Generated at: ${summary.generatedAt}`,
		`- Bytes before: ${summary.bytesBeforeHuman}`,
		`- Bytes after: ${summary.bytesAfterHuman}`,
		`- Bytes reclaimed: ${summary.bytesReclaimedHuman}`,
		`- External bytes reclaimed: ${summary.externalBytesReclaimedHuman}`,
		"",
		"## Applied",
		"",
		...(summary.applied.length > 0
			? summary.applied.map(
					(entry) =>
						`- ${entry.path} | ${entry.sizeHuman} | ${entry.cleanupClass} | ${entry.reason}`,
				)
			: ["- none"]),
		"",
		"## Skipped",
		"",
		...(summary.skipped.length > 0
			? summary.skipped.map(
					(entry) =>
						`- ${entry.path} | ${entry.sizeHuman} | ${entry.cleanupClass} | ${entry.reason}`,
				)
			: ["- none"]),
		"",
		"## Excluded External Targets",
		"",
		...(summary.excludedExternalTargets.length > 0
			? summary.excludedExternalTargets.map(
					(entry) =>
						`- ${entry.id} | ${entry.path ?? "unresolved"} | ${entry.sizeHuman} | ${entry.applyMode ?? "report-only"} | ${entry.reason}`,
				)
			: ["- none"]),
		"",
		"## Excluded Browser Assets",
		"",
		...(summary.excludedPersistentBrowserAssets.length > 0
			? summary.excludedPersistentBrowserAssets.map(
					(entry) =>
						`- ${entry.id} | ${entry.path ?? "unresolved"} | ${entry.sizeHuman} | ${entry.applyMode ?? "report-only"} | janitorExcluded=${entry.janitorExcluded === true ? "yes" : "no"} | ${entry.reason}`,
				)
			: ["- none"]),
		"",
		"## External Tool Cache Janitor",
		"",
		`- Mode: ${summary.externalJanitor?.mode ?? "n/a"}`,
		`- Trigger: ${summary.externalJanitor?.reason ?? "n/a"}`,
		`- Base root: ${summary.externalJanitor?.toolCacheBaseRoot ?? "n/a"}`,
		`- Bytes reclaimed: ${summary.externalJanitor?.bytesReclaimedHuman ?? "0 B"}`,
	];
	return lines.join("\n");
}

function buildCliResultPayload(result) {
	const candidates = Array.isArray(result.candidates) ? result.candidates : [];
	const applied = Array.isArray(result.applied) ? result.applied : [];
	const skipped = Array.isArray(result.skipped) ? result.skipped : [];
	const excludedExternalTargets = Array.isArray(result.excludedExternalTargets)
		? result.excludedExternalTargets
		: [];
	const excludedPersistentBrowserAssets = Array.isArray(
		result.excludedPersistentBrowserAssets,
	)
		? result.excludedPersistentBrowserAssets
		: [];
	const eligibleCandidates = candidates
		.filter((entry) => entry.eligibleForCleanup === true)
		.slice(0, 10)
		.map((entry) => ({
			path: entry.path,
			sizeHuman: entry.sizeHuman,
			cleanupClass: entry.cleanupClass,
			reason: entry.reason,
		}));
	return {
		ok: result.ok,
		mode: result.mode,
		projectedReclaimableBytes: result.projectedReclaimableBytes,
		projectedReclaimableHuman: result.projectedReclaimableHuman,
		projectedExternalReclaimableBytes:
			result.projectedExternalReclaimableBytes ?? 0,
		projectedExternalReclaimableHuman:
			result.projectedExternalReclaimableHuman ?? "0 B",
		eligibleCount: candidates.filter((entry) => entry.eligibleForCleanup === true)
			.length,
		appliedCount: applied.length,
		skippedCount: skipped.length,
		excludedExternalTargetCount: excludedExternalTargets.length,
		excludedPersistentBrowserAssetCount:
			excludedPersistentBrowserAssets.length,
		topEligibleCandidates: eligibleCandidates,
		excludedExternalTargets,
		excludedPersistentBrowserAssets,
		externalJanitorReceiptPath: result.externalJanitor?.receiptJsonPath ?? null,
		reportPath: result.reportPath ?? null,
		verificationPath: result.verificationPath ?? null,
		summaryPath: result.summaryPath ?? null,
		markdownSummaryPath: result.markdownSummaryPath ?? null,
	};
}

async function writeMaintenanceSummary(context, summary) {
	const maintenancePolicy = context.contract.maintenancePolicy ?? {};
	const reportRoot = path.resolve(
		context.rootDir,
		String(
			maintenancePolicy.latestManifestRoot ??
				context.contract.reportRoot ??
				".runtime-cache/reports/space-governance",
		),
	);
	await fs.mkdir(reportRoot, { recursive: true });
	const fileNames = buildReportFileNames(
		String(maintenancePolicy.latestManifestBaseName ?? "maintenance-latest"),
	);
	const jsonPath = path.join(reportRoot, fileNames.jsonName);
	const markdownPath = path.join(reportRoot, fileNames.markdownName);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${buildMaintenanceMarkdown(summary)}\n`, "utf8"),
	]);
	return { jsonPath, markdownPath };
}

async function runSpaceMaintain(options = {}) {
	const parsed = options.parsedArgs ?? parseCliArgs(options.argv);
	const context = await buildSpaceGovernanceContext(options);

	const verification = await generateSpaceVerificationReport({
		rootDir: context.rootDir,
		label: `${parsed.label}-verify`,
		includeInstallSurface: parsed.includeInstallSurface,
		activeRefCounter: options.activeRefCounter,
	});
	const preReport = await generateSpaceGovernanceReport({
		rootDir: context.rootDir,
		label: `${parsed.label}-pre`,
		profile: "maintenance",
	});
	const candidates = verification.report.maintenanceCandidates;
	const excludedExternalTargets =
		verification.report.reportedOnlyExternalTargets ?? [];
	const excludedPersistentBrowserAssets =
		verification.report.reportedOnlyPersistentBrowserAssets ?? [];
	const repoLocalCandidates = candidates.filter(
		(entry) => entry.scope === "repo-local",
	);
	const appliedPlan = repoLocalCandidates.filter(
		(entry) => entry.eligibleForCleanup === true,
	);
	const skipped = repoLocalCandidates.filter(
		(entry) => entry.eligibleForCleanup !== true,
	);
	const projectedReclaimableBytes = appliedPlan.reduce(
		(sum, entry) => sum + entry.sizeBytes,
		0,
	);
	const externalJanitor = await maybeRunToolCacheJanitor({
		rootDir: context.rootDir,
		env: process.env,
		trigger: parsed.apply ? "repo:space:maintain" : "repo:space:maintain:dry-run",
		dryRun: parsed.apply !== true,
		force: parsed.apply === true,
	});

	if (!parsed.apply) {
		return {
			ok: true,
			mode: "dry-run",
			projectedReclaimableBytes,
			projectedReclaimableHuman: formatBytes(projectedReclaimableBytes),
			projectedExternalReclaimableBytes: externalJanitor.bytesReclaimed,
			projectedExternalReclaimableHuman: externalJanitor.bytesReclaimedHuman,
			candidates: repoLocalCandidates,
			applied: [],
			skipped,
			excludedExternalTargets,
			excludedPersistentBrowserAssets,
			externalJanitor,
			reportPath: path.relative(context.rootDir, preReport.jsonPath),
			verificationPath: path.relative(context.rootDir, verification.jsonPath),
		};
	}

	const removed = [];
	for (const entry of appliedPlan) {
		if (PROTECTED_APPLY_PATHS.has(entry.path)) {
			throw new Error(`refuse protected maintenance apply target: ${entry.path}`);
		}
		await ensureWritableThenRemove(path.resolve(context.rootDir, entry.path));
		removed.push(entry);
	}

	const postReport = await generateSpaceGovernanceReport({
		rootDir: context.rootDir,
		label: `${parsed.label}-post`,
		profile: "maintenance",
	});
	const summary = {
		mode: "apply",
		generatedAt: new Date().toISOString(),
		applied: removed,
		skipped,
		excludedExternalTargets,
		excludedPersistentBrowserAssets,
		externalJanitor,
		bytesBefore: preReport.report.summary.repoInternalBytes,
		bytesBeforeHuman: preReport.report.summary.repoInternalHuman,
		bytesAfter: postReport.report.summary.repoInternalBytes,
		bytesAfterHuman: postReport.report.summary.repoInternalHuman,
		bytesReclaimed:
			preReport.report.summary.repoInternalBytes -
			postReport.report.summary.repoInternalBytes,
		bytesReclaimedHuman: formatBytes(
			preReport.report.summary.repoInternalBytes -
				postReport.report.summary.repoInternalBytes,
		),
		externalBytesReclaimed: externalJanitor.bytesReclaimed,
		externalBytesReclaimedHuman: externalJanitor.bytesReclaimedHuman,
		skippedReasons: skipped.map((entry) => ({
			path: entry.path,
			reason: entry.reason,
		})),
		preReportPath: path.relative(context.rootDir, preReport.jsonPath),
		postReportPath: path.relative(context.rootDir, postReport.jsonPath),
		verificationPath: path.relative(context.rootDir, verification.jsonPath),
	};
	const writtenSummary = await writeMaintenanceSummary(context, summary);
	return {
		ok: true,
		mode: "apply",
		projectedReclaimableBytes,
		projectedReclaimableHuman: formatBytes(projectedReclaimableBytes),
		projectedExternalReclaimableBytes: externalJanitor.bytesReclaimed,
		projectedExternalReclaimableHuman: externalJanitor.bytesReclaimedHuman,
		applied: removed,
		skipped,
		excludedExternalTargets,
		excludedPersistentBrowserAssets,
		externalJanitor,
		summaryPath: path.relative(context.rootDir, writtenSummary.jsonPath),
		markdownSummaryPath: path.relative(context.rootDir, writtenSummary.markdownPath),
	};
}

async function runSpaceMaintainCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const result = await runSpaceMaintain(options);
		stdout.write(`${JSON.stringify(buildCliResultPayload(result), null, 2)}\n`);
		return 0;
	} catch (error) {
		stderr.write(
			`[space-maintain] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runSpaceMaintainCli({ argv: process.argv.slice(2) }).then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { parseCliArgs, runSpaceMaintain, runSpaceMaintainCli };
