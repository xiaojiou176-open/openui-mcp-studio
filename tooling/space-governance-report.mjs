#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
	buildReportFileNames,
	buildSpaceGovernanceContext,
	collectRootEntries,
	collectRuntimeSubtrees,
	collectTopFiles,
	describeExternalPath,
	describeRepoLocalPath,
	summarizeRuntimeSubtrees,
} from "./shared/space-governance.mjs";

function parseCliArgs(argv = process.argv.slice(2)) {
	const options = {};
	for (const arg of argv) {
		if (!arg.startsWith("--")) {
			throw new Error(`Unknown argument: ${arg}`);
		}
		const [flag, value = ""] = arg.slice(2).split("=");
		if (!value) {
			throw new Error(`Missing value for --${flag}`);
		}
		if (flag === "root") {
			options.rootDir = value;
			continue;
		}
		if (flag === "output-dir") {
			options.outputDir = value;
			continue;
		}
		if (flag === "label") {
			options.label = value;
			continue;
		}
		throw new Error(`Unknown argument: --${flag}`);
	}
	return options;
}

function classifyPath(relativePath, context) {
	const candidate = String(relativePath ?? "");
	if ((context.contract.hardFailNonCanonicalPaths ?? []).includes(candidate)) {
		return "hard-fail-non-canonical-path";
	}
	if ((context.contract.lowRiskCleanupTargets ?? []).includes(candidate)) {
		return "low-risk-cleanup-target";
	}
	if (candidate === ".git") {
		return "git-history";
	}
	if (candidate === "node_modules") {
		return "install-surface";
	}
	if (candidate === "apps/web/.next") {
		return "framework-build-cache";
	}
	if ((context.contract.rootAnomalies ?? []).includes(candidate)) {
		return "root-anomaly";
	}
	if (
		(context.contract.verificationCandidates ?? []).some(
			(entry) => String(entry?.path ?? "") === candidate,
		)
	) {
		return "verification-candidate";
	}
	if (candidate.startsWith(".runtime-cache/")) {
		return "non-canonical-runtime-subtree";
	}
	if (candidate === ".runtime-cache") {
		return "runtime-surface";
	}
	return "tracked-or-local-path";
}

function formatMarkdownReport(report) {
	const lines = [
		"# Space Governance Report",
		"",
		`- Generated at: ${report.generatedAt}`,
		`- Workspace root: ${report.rootDir}`,
		"",
		"## Summary",
		"",
		`- Repo internal footprint: ${report.summary.repoInternalHuman}`,
		`- Runtime surface footprint: ${report.summary.runtimeSurfaceHuman}`,
		`- Canonical runtime footprint: ${report.summary.canonicalRuntimeHuman}`,
		`- Non-canonical runtime footprint: ${report.summary.nonCanonicalRuntimeHuman}`,
		`- OK semantics: ${report.statusSemantics.okMeaning}`,
		"",
		"## Top Repo Paths",
		"",
		"| Path | Size | Class |",
		"| --- | ---: | --- |",
		...report.topPaths.map(
			(entry) =>
				`| ${entry.relativePath} | ${entry.sizeHuman} | ${entry.classification} |`,
		),
		"",
		"## Runtime Subtrees",
		"",
		"| Path | Size | Canonical |",
		"| --- | ---: | --- |",
		...report.runtimeSubtrees.map(
			(entry) =>
				`| ${entry.relativePath} | ${entry.sizeHuman} | ${entry.canonical ? "yes" : "no"} |`,
		),
		"",
		"## Root Anomalies",
		"",
		...(report.rootAnomalies.length > 0
			? report.rootAnomalies.map(
					(entry) =>
						`- ${entry.relativePath}: ${entry.sizeHuman}${entry.exists ? "" : " (missing)"}`,
				)
			: ["- none"]),
	];
	return lines.join("\n");
}

async function generateSpaceGovernanceReport(options = {}) {
	const context = await buildSpaceGovernanceContext(options);
	const topN = Number(context.contract.topN ?? 10);
	const [
		repoRootEntries,
		runtimeSubtrees,
		topFiles,
		baselineTargets,
		rootAnomalies,
		deferredSharedLayers,
		repoInternalDetail,
		runtimeSurfaceDetail,
	] = await Promise.all([
		collectRootEntries(context.rootDir),
		collectRuntimeSubtrees(context.rootDir, context.registry),
		collectTopFiles(context.rootDir, topN),
		Promise.all(
			(context.contract.baselineTargets ?? []).map((targetPath) =>
				describeRepoLocalPath(context.rootDir, String(targetPath)),
			),
		),
		Promise.all(
			(context.contract.rootAnomalies ?? []).map((targetPath) =>
				describeRepoLocalPath(context.rootDir, String(targetPath)),
			),
		),
		Promise.all(
			(context.contract.deferredSharedLayers ?? []).map(async (entry) => ({
				path: String(entry?.path ?? ""),
				reason: String(entry?.reason ?? "").trim(),
				...(await describeExternalPath(entry?.path ?? "")),
			})),
		),
		describeRepoLocalPath(context.rootDir, "."),
		describeRepoLocalPath(
			context.rootDir,
			String(context.registry.runtimeSurface ?? ".runtime-cache"),
		),
	]);

	const runtimeSummary = summarizeRuntimeSubtrees(runtimeSubtrees);
	const topPaths = repoRootEntries.slice(0, topN).map((entry) => ({
		...entry,
		classification: classifyPath(entry.relativePath, context),
	}));
	const targetDetails = baselineTargets.map((entry) => ({
		...entry,
		classification: classifyPath(entry.relativePath, context),
	}));

	const report = {
		generatedAt: new Date().toISOString(),
		rootDir: context.rootDir,
		contractPath: path.relative(context.rootDir, context.contractPath),
		registryPath: path.relative(context.rootDir, context.registryPath),
		summary: {
			repoInternalBytes: repoInternalDetail.sizeBytes,
			repoInternalHuman: repoInternalDetail.sizeHuman,
			runtimeSurfaceBytes: runtimeSurfaceDetail.sizeBytes,
			runtimeSurfaceHuman: runtimeSurfaceDetail.sizeHuman,
			canonicalRuntimeBytes: runtimeSummary.canonicalBytes,
			canonicalRuntimeHuman: runtimeSummary.canonicalHuman,
			nonCanonicalRuntimeBytes: runtimeSummary.nonCanonicalBytes,
			nonCanonicalRuntimeHuman: runtimeSummary.nonCanonicalHuman,
			canonicalRuntimePct: runtimeSummary.canonicalPct,
			nonCanonicalRuntimePct: runtimeSummary.nonCanonicalPct,
		},
		topPaths,
		topFiles,
		baselineTargets: targetDetails,
		runtimeSubtrees,
		rootAnomalies,
		deferredSharedLayers,
		statusSemantics: {
			okMeaning:
				"no hard-fail pollution and no unknown non-canonical runtime subtree above threshold",
		},
	};

	const outputRoot = path.resolve(
		context.rootDir,
		options.outputDir ?? String(context.contract.reportRoot ?? ".runtime-cache/reports/space-governance"),
	);
	await fs.mkdir(outputRoot, { recursive: true });
	const fileNames = buildReportFileNames(options.label ?? "report");
	const jsonPath = path.join(outputRoot, fileNames.jsonName);
	const markdownPath = path.join(outputRoot, fileNames.markdownName);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${formatMarkdownReport(report)}\n`, "utf8"),
	]);

	return { report, jsonPath, markdownPath };
}

async function runSpaceGovernanceReportCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const parsed = options.parsedArgs ?? parseCliArgs(options.argv);
		const result = await generateSpaceGovernanceReport(parsed);
		stdout.write(
			`Space governance report generated: ${path.relative(process.cwd(), result.jsonPath)} and ${path.relative(process.cwd(), result.markdownPath)}\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(
			`Space governance report failed: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runSpaceGovernanceReportCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	formatMarkdownReport,
	generateSpaceGovernanceReport,
	runSpaceGovernanceReportCli,
};
