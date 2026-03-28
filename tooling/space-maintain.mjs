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
	];
	return lines.join("\n");
}

function buildCliResultPayload(result) {
	const candidates = Array.isArray(result.candidates) ? result.candidates : [];
	const applied = Array.isArray(result.applied) ? result.applied : [];
	const skipped = Array.isArray(result.skipped) ? result.skipped : [];
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
		eligibleCount: candidates.filter((entry) => entry.eligibleForCleanup === true)
			.length,
		appliedCount: applied.length,
		skippedCount: skipped.length,
		topEligibleCandidates: eligibleCandidates,
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

	if (!parsed.apply) {
		return {
			ok: true,
			mode: "dry-run",
			projectedReclaimableBytes,
			projectedReclaimableHuman: formatBytes(projectedReclaimableBytes),
			candidates: repoLocalCandidates,
			applied: [],
			skipped,
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
		applied: removed,
		skipped,
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
