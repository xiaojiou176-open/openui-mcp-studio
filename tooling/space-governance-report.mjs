#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
	buildReportFileNames,
	buildSpaceGovernanceContext,
	collectDirectChildren,
	collectRootEntries,
	collectRuntimeSubtrees,
	collectTopFiles,
	describeBrowserLanePolicy,
	describeExternalPath,
	describeRepoSpecificExternalContext,
	describeRepoSpecificPersistentAssets,
	describeRepoLocalPath,
	describeRepoSpecificExternalTargets,
	formatBytes,
	getRuntimePathMetadata,
	summarizeRuntimeSubtrees,
} from "./shared/space-governance.mjs";

const OPENUI_DOCKER_REPO_LABEL = "io.openui.repo=openui-mcp-studio";
const OPENUI_DOCKER_WORKSPACE_LABEL_KEY = "io.openui.workspace_token";

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
	const maintenancePolicy = context.contract.maintenancePolicy ?? {};
	if ((context.contract.hardFailNonCanonicalPaths ?? []).includes(candidate)) {
		return "hard-fail-non-canonical-path";
	}
	if ((maintenancePolicy.safeAutoMaintainTargets ?? []).includes(candidate)) {
		return "safe-auto-maintain";
	}
	if ((maintenancePolicy.manualOptInTargets ?? []).includes(candidate)) {
		return "manual-opt-in";
	}
	if ((maintenancePolicy.neverRepoLocalTargets ?? []).includes(candidate)) {
		return "never-repo-local";
	}
	if ((context.contract.lowRiskCleanupTargets ?? []).includes(candidate)) {
		return "low-risk-cleanup-target";
	}
	if (candidate === ".git") {
		return "git-history";
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
	const runtimeMetadata = getRuntimePathMetadata(candidate, context.registry);
	if (runtimeMetadata?.cleanupClass) {
		return runtimeMetadata.cleanupClass;
	}
	if (candidate.startsWith(".runtime-cache/")) {
		return "non-canonical-runtime-subtree";
	}
	if (candidate === ".runtime-cache") {
		return "runtime-surface";
	}
	return "tracked-or-local-path";
}

function sumBytes(entries) {
	return entries.reduce((sum, entry) => sum + Number(entry?.sizeBytes ?? 0), 0);
}

function listDockerOutputLines(args) {
	try {
		const stdout = execFileSync("docker", args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return stdout
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

function collectRepoOwnedDockerResidue(workspaceToken) {
	const workspaceLabel = `${OPENUI_DOCKER_WORKSPACE_LABEL_KEY}=${workspaceToken}`;
	const containers = listDockerOutputLines([
		"ps",
		"-a",
		"--filter",
		`label=${OPENUI_DOCKER_REPO_LABEL}`,
		"--filter",
		`label=${workspaceLabel}`,
		"--format",
		"{{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}",
	]);
	const images = listDockerOutputLines([
		"images",
		"--filter",
		`label=${OPENUI_DOCKER_REPO_LABEL}`,
		"--filter",
		`label=${workspaceLabel}`,
		"--format",
		"{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}",
	]);
	return {
		labelSelector: {
			repo: OPENUI_DOCKER_REPO_LABEL,
			workspace: workspaceLabel,
		},
		containerCount: containers.length,
		builderCount: 0,
		imageCount: images.length,
		containers,
		images,
	};
}

function buildReclaimableBytesByClass(context, baselineTargets, runtimeSubtrees) {
	const maintenancePolicy = context.contract.maintenancePolicy ?? {};
	const safeAutoSet = new Set(
		(maintenancePolicy.safeAutoMaintainTargets ?? []).map((entry) =>
			String(entry ?? "").trim(),
		),
	);
	const manualSet = new Set(
		(maintenancePolicy.manualOptInTargets ?? []).map((entry) =>
			String(entry ?? "").trim(),
		),
	);
	let safeAutoMaintainBytes = 0;
	let manualOptInBytes = 0;
	for (const entry of baselineTargets) {
		if (!entry.exists) {
			continue;
		}
		if (safeAutoSet.has(entry.relativePath)) {
			safeAutoMaintainBytes += entry.sizeBytes;
		}
		if (manualSet.has(entry.relativePath)) {
			manualOptInBytes += entry.sizeBytes;
		}
	}
	let verifyFirstMaintainBytes = 0;
	for (const subtree of runtimeSubtrees) {
		const metadata = getRuntimePathMetadata(subtree.relativePath, context.registry);
		if (metadata?.cleanupClass === "verify-first-maintain") {
			verifyFirstMaintainBytes += subtree.sizeBytes;
		}
	}
	return {
		"safe-auto-maintain": {
			bytes: safeAutoMaintainBytes,
			human: formatBytes(safeAutoMaintainBytes),
		},
		"verify-first-maintain": {
			bytes: verifyFirstMaintainBytes,
			human: formatBytes(verifyFirstMaintainBytes),
		},
		"manual-opt-in": {
			bytes: manualOptInBytes,
			human: formatBytes(manualOptInBytes),
		},
	};
}

async function collectTopTmpSubtrees(context, topN) {
	const tmpDetail = await describeRepoLocalPath(context.rootDir, ".runtime-cache/tmp");
	if (!tmpDetail.exists || !tmpDetail.isDirectory) {
		return [];
	}
	const topChildren = await collectDirectChildren(
		tmpDetail.relativePath,
		tmpDetail.absolutePath,
		topN,
	);
	return Promise.all(
		topChildren.map(async (entry) => ({
			...entry,
			cleanupClass: classifyPath(entry.relativePath, context),
			runtimeMetadata: getRuntimePathMetadata(entry.relativePath, context.registry),
			components: entry.isDirectory
				? await collectDirectChildren(entry.relativePath, entry.absolutePath, topN)
				: [],
		})),
	);
}

async function isEmptyRuntimeTempDirectory(context, entry) {
	if (entry?.relativePath !== ".runtime-cache/temp") {
		return false;
	}
	try {
		const targetPath = path.resolve(context.rootDir, entry.relativePath);
		const stat = await fs.stat(targetPath);
		if (!stat.isDirectory()) {
			return false;
		}
		const children = await fs.readdir(targetPath);
		return children.length === 0;
	} catch {
		return false;
	}
}

async function collectDriftCandidates(
	context,
	runtimeSubtrees,
	rootAnomalies,
	baselineTargets,
) {
	const candidates = [];
	for (const entry of runtimeSubtrees) {
		const ignoreEmptyRuntimeTemp = await isEmptyRuntimeTempDirectory(
			context,
			entry,
		);
		if (!entry.canonical && !ignoreEmptyRuntimeTemp) {
			candidates.push({
				path: entry.relativePath,
				reason: "non-canonical-runtime-subtree",
				sizeBytes: entry.sizeBytes,
				sizeHuman: entry.sizeHuman,
			});
		}
	}
	for (const entry of rootAnomalies) {
		if (entry.exists) {
			candidates.push({
				path: entry.relativePath,
				reason: "root-anomaly",
				sizeBytes: entry.sizeBytes,
				sizeHuman: entry.sizeHuman,
			});
		}
	}
	for (const entry of baselineTargets) {
		if (entry.classification === "hard-fail-non-canonical-path" && entry.exists) {
			candidates.push({
				path: entry.relativePath,
				reason: "hard-fail-non-canonical-path",
				sizeBytes: entry.sizeBytes,
				sizeHuman: entry.sizeHuman,
			});
		}
	}
	return candidates.sort((left, right) => right.sizeBytes - left.sizeBytes);
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
		`- Shared-layer related footprint: ${report.summary.sharedLayerRelatedHuman}`,
		`- Repo-specific external footprint: ${report.summary.repoSpecificExternalHuman}`,
		`- Canonical runtime footprint: ${report.summary.canonicalRuntimeHuman}`,
		`- Non-canonical runtime footprint: ${report.summary.nonCanonicalRuntimeHuman}`,
		`- OK semantics: ${report.statusSemantics.okMeaning}`,
		"",
		"## Reclaimable By Class",
		"",
		"| Class | Bytes |",
		"| --- | ---: |",
		...Object.entries(report.summary.reclaimableBytesByClass).map(
			([key, value]) => `| ${key} | ${value.human} |`,
		),
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
		"## Repo-Local Managed Surfaces",
		"",
		"| Path | Size | Class |",
		"| --- | ---: | --- |",
		...report.baselineTargets.map(
			(entry) =>
				`| ${entry.relativePath} | ${entry.sizeHuman} | ${entry.classification} |`,
		),
		"",
		"## Top Tmp Subtrees",
		"",
		"| Path | Size | Cleanup class |",
		"| --- | ---: | --- |",
		...(report.topTmpSubtrees.length > 0
			? report.topTmpSubtrees.map(
					(entry) =>
						`| ${entry.relativePath} | ${entry.sizeHuman} | ${entry.cleanupClass ?? "unknown"} |`,
				)
			: ["| none | 0 B | n/a |"]),
		"",
		"## Repo-Specific External Cache",
		"",
		`- Base root: ${report.repoSpecificExternalContext?.toolCacheBaseRoot ?? "n/a"}`,
		`- Workspace token: ${report.repoSpecificExternalContext?.workspaceToken ?? "n/a"}`,
		`- Tool cache root: ${report.repoSpecificExternalContext?.toolCacheRoot ?? "n/a"}`,
		`- TTL days: ${report.repoSpecificExternalContext?.policy?.retentionDays ?? "n/a"}`,
		`- Max bytes: ${report.repoSpecificExternalContext?.policy?.maxBytesHuman ?? "n/a"}`,
		`- Clean interval minutes: ${report.repoSpecificExternalContext?.policy?.cleanIntervalMinutes ?? "n/a"}`,
		`- Default scope: ${report.repoSpecificExternalContext?.scope ?? "repo-specific-external"}`,
		`- Default apply mode: ${report.repoSpecificExternalContext?.applyMode ?? "managed"}`,
		`- Latest janitor receipt: ${report.repoSpecificExternalContext?.latestReceipt?.generatedAt ?? "none"}`,
		"",
		"| Target | Path | Exists | Size | Updated | Apply mode | Reason |",
		"| --- | --- | --- | ---: | --- | --- | --- |",
		...(report.repoSpecificExternalTargets.length > 0
			? report.repoSpecificExternalTargets.map(
					(entry) =>
						`| ${entry.id} | ${entry.path ?? "unresolved"} | ${entry.exists ? "yes" : "no"} | ${entry.sizeHuman} | ${entry.mtimeIso ?? "n/a"} | ${entry.applyMode ?? "report-only"} | ${entry.reason || "repo-specific-external"} |`,
				)
			: ["| none | unresolved | no | 0 B | n/a | report-only | n/a |"]),
		"",
		"## Repo Browser Lane",
		"",
		`- Env status: ${report.browserLanePolicy?.envStatus ?? "missing"}`,
		`- Env reason: ${report.browserLanePolicy?.envReason ?? "n/a"}`,
		`- User data dir: ${report.browserLanePolicy?.effectiveUserDataDir ?? "n/a"}`,
		`- Profile directory: ${report.browserLanePolicy?.effectiveProfileDirectory ?? "n/a"}`,
		`- Channel: ${report.browserLanePolicy?.channel ?? "n/a"}`,
		`- CDP port: ${report.browserLanePolicy?.cdpPort ?? "n/a"}`,
		`- Instance state: ${report.browserLanePolicy?.currentInstanceState ?? "unknown"}`,
		`- Instance reason: ${report.browserLanePolicy?.currentInstanceReason ?? "n/a"}`,
		`- Janitor excluded: ${report.browserLanePolicy?.janitorExcluded === true ? "yes" : "no"}`,
		"",
		"| Asset | Path | Exists | Size | Apply mode | Janitor excluded | Reason |",
		"| --- | --- | --- | ---: | --- | --- | --- |",
		...(report.repoSpecificPersistentAssets.length > 0
			? report.repoSpecificPersistentAssets.map(
					(entry) =>
						`| ${entry.id} | ${entry.path ?? "unresolved"} | ${entry.exists ? "yes" : "no"} | ${entry.sizeHuman} | ${entry.applyMode ?? "report-only"} | ${entry.janitorExcluded === true ? "yes" : "no"} | ${entry.reason || "persistent-browser-asset"} |`,
				)
			: ["| none | unresolved | no | 0 B | report-only | yes | n/a |"]),
		"",
		"## Repo-Owned Docker Residue",
		"",
		`- Container count: ${report.repoOwnedDockerResidue?.containerCount ?? 0}`,
		`- Builder count: ${report.repoOwnedDockerResidue?.builderCount ?? 0}`,
		`- Image count: ${report.repoOwnedDockerResidue?.imageCount ?? 0}`,
		"",
		"## Machine-Wide Shared Layers",
		"",
		"| Path | Size | Reason |",
		"| --- | ---: | --- |",
		...report.machineLevelDefer.map(
			(entry) =>
				`| ${entry.path} | ${entry.sizeHuman} | ${entry.reason || "shared-layer"} |`,
		),
	];
	return lines.join("\n");
}

async function generateSpaceGovernanceReport(options = {}) {
	const context = await buildSpaceGovernanceContext(options);
	const topN = Number(context.contract.topN ?? 10);
	const profile = String(options.profile ?? "full").trim() || "full";
	const includeTopFiles = profile !== "maintenance";
	const includeTmpBreakdown = profile !== "maintenance";
	const includeExternalLayers = profile !== "maintenance";
	const [
		repoRootEntries,
		runtimeSubtrees,
		topFiles,
		baselineTargets,
		rootAnomalies,
		repoSpecificExternalContext,
		deferredSharedLayers,
		repoSpecificExternalTargets,
		repoSpecificPersistentAssets,
		repoInternalDetail,
		runtimeSurfaceDetail,
		topTmpSubtrees,
		browserLanePolicy,
	] = await Promise.all([
		collectRootEntries(context.rootDir),
		collectRuntimeSubtrees(context.rootDir, context.registry),
		includeTopFiles ? collectTopFiles(context.rootDir, topN) : Promise.resolve([]),
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
		includeExternalLayers
			? describeRepoSpecificExternalContext(context.rootDir, context.contract, {
					env: options.env,
				})
			: Promise.resolve(null),
		Promise.all(
			includeExternalLayers
				? (context.contract.deferredSharedLayers ?? []).map(async (entry) => ({
						path: String(entry?.path ?? ""),
						reason: String(entry?.reason ?? "").trim(),
						...(await describeExternalPath(entry?.path ?? "")),
					}))
				: [],
		),
		includeExternalLayers
			? describeRepoSpecificExternalTargets(context.rootDir, context.contract, {
					env: options.env,
				})
			: Promise.resolve([]),
		includeExternalLayers
			? describeRepoSpecificPersistentAssets(context.rootDir, context.contract)
			: Promise.resolve([]),
		describeRepoLocalPath(context.rootDir, "."),
		describeRepoLocalPath(
			context.rootDir,
			String(context.registry.runtimeSurface ?? ".runtime-cache"),
		),
		includeTmpBreakdown ? collectTopTmpSubtrees(context, topN) : Promise.resolve([]),
		describeBrowserLanePolicy(context.rootDir, context.contract, {
			env: options.env ?? process.env,
		}),
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
	const sharedLayerRelatedBytes = sumBytes(deferredSharedLayers);
	const repoSpecificExternalRootDetail =
		repoSpecificExternalContext?.toolCacheBaseRoot
			? await describeExternalPath(
					repoSpecificExternalContext.toolCacheBaseRoot,
				)
			: {
					exists: false,
					absolutePath: null,
					sizeBytes: 0,
					sizeHuman: "0 B",
					mtimeIso: null,
					isDirectory: false,
				};
	const repoSpecificExternalBytes = repoSpecificExternalRootDetail.sizeBytes;
	const repoSpecificPersistentBrowserBytes = repoSpecificPersistentAssets.reduce(
		(sum, entry) => sum + Number(entry.sizeBytes ?? 0),
		0,
	);
	const topSharedLayers = [...deferredSharedLayers]
		.sort((left, right) => right.sizeBytes - left.sizeBytes)
		.slice(0, topN);
	const reclaimableBytesByClass = buildReclaimableBytesByClass(
		context,
		targetDetails,
		runtimeSubtrees,
	);
	const driftCandidates = await collectDriftCandidates(
		context,
		runtimeSubtrees,
		rootAnomalies,
		targetDetails,
	);

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
			sharedLayerRelatedBytes,
			sharedLayerRelatedHuman: formatBytes(sharedLayerRelatedBytes),
			repoSpecificExternalBytes,
			repoSpecificExternalHuman: formatBytes(repoSpecificExternalBytes),
			repoSpecificPersistentBrowserBytes,
			repoSpecificPersistentBrowserHuman: formatBytes(
				repoSpecificPersistentBrowserBytes,
			),
			canonicalRuntimeBytes: runtimeSummary.canonicalBytes,
			canonicalRuntimeHuman: runtimeSummary.canonicalHuman,
			nonCanonicalRuntimeBytes: runtimeSummary.nonCanonicalBytes,
			nonCanonicalRuntimeHuman: runtimeSummary.nonCanonicalHuman,
			canonicalRuntimePct: runtimeSummary.canonicalPct,
			nonCanonicalRuntimePct: runtimeSummary.nonCanonicalPct,
			reclaimableBytesByClass,
		},
		topPaths,
		topFiles,
		baselineTargets: targetDetails,
		repoLocalManagedSurfaces: {
			baselineTargets: targetDetails,
			runtimeSubtrees,
			topTmpSubtrees,
		},
		runtimeSubtrees,
		rootAnomalies,
		repoSpecificExternalContext,
		deferredSharedLayers,
		repoSpecificExternalTargets,
		repoSpecificPersistentAssets,
		repoSpecificExternalRootDetail,
		topSharedLayers,
		topTmpSubtrees,
		browserLanePolicy,
		repoOwnedDockerResidue: collectRepoOwnedDockerResidue(
			repoSpecificExternalContext?.workspaceToken ?? "unknown",
		),
		driftCandidates,
		machineWideSharedLayers: deferredSharedLayers,
		machineLevelDefer: deferredSharedLayers,
		statusSemantics: {
			okMeaning:
				"repo-local report only; shared layers are reported for visibility and never authorized for repo-local apply",
		},
		profile,
	};

	const outputRoot = path.resolve(
		context.rootDir,
		options.outputDir ??
			String(
				context.contract.reportRoot ?? ".runtime-cache/reports/space-governance",
			),
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
