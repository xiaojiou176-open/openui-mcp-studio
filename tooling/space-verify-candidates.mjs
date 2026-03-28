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
	computeAgeHours,
	describeExternalPath,
	describeRepoLocalPath,
	describeRepoSpecificExternalTargets,
	formatBytes,
	getRuntimePathMetadata,
	isCanonicalRuntimePath,
} from "./shared/space-governance.mjs";
import { isPathOutsideRoot, toPosixPath } from "./shared/governance-utils.mjs";

function hasKnownRebuildPath(relativePath) {
	return [
		".runtime-cache/go-mod",
		".runtime-cache/precommit-full-home",
		"$HOME",
		"$HOME/.cache/pre-commit",
	].includes(String(relativePath));
}

function countActiveRefs(targetPath) {
	try {
		const stdout = execFileSync("lsof", ["+D", targetPath], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const lines = stdout
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
		return {
			status: "yes",
			count: Math.max(lines.length - 1, 0),
			error: null,
		};
	} catch (error) {
		const stdout =
			typeof error?.stdout === "string" ? error.stdout.trim() : "";
		const stderr =
			typeof error?.stderr === "string" ? error.stderr.trim() : "";
		if (error && typeof error === "object" && "status" in error) {
			const status = Number(error.status);
			if (status === 1 && stdout === "" && stderr === "") {
				return {
					status: "no",
					count: 0,
					error: null,
				};
			}
		}
		return {
			status: "unknown",
			count: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function normalizeActiveRefState(value) {
	if (value && typeof value === "object" && "status" in value) {
		return value;
	}
	if (value && typeof value === "object" && "known" in value) {
		return {
			status: value.known ? (Number(value.count ?? 0) > 0 ? "yes" : "no") : "unknown",
			count: Number(value.count ?? 0),
			error: value.error ?? null,
		};
	}
	return {
		status: "unknown",
		count: 0,
		error: "unrecognized active-ref result",
	};
}

function formatStatusMarkdown(report) {
	const lines = [
		"# Space Verification Candidates",
		"",
		`- Generated at: ${report.generatedAt}`,
		"",
		"## Summary",
		"",
		`- Contract candidates: ${report.summary.contractCandidateCount}`,
		`- Maintenance candidates: ${report.summary.maintenanceCandidateCount}`,
		`- Eligible repo-local bytes: ${report.summary.eligibleRepoLocalHuman}`,
		`- Shared-layer related bytes: ${report.summary.sharedLayerRelatedHuman}`,
		`- Repo-specific external bytes: ${report.summary.repoSpecificExternalHuman}`,
		"",
		"## Maintenance Candidates",
		"",
		"| Path | Scope | Size | Cleanup class | Active refs | Eligible | Reason |",
		"| --- | --- | ---: | --- | --- | --- | --- |",
		...report.maintenanceCandidates.map(
			(entry) =>
				`| ${entry.path} | ${entry.scope} | ${entry.sizeHuman} | ${entry.cleanupClass ?? "unknown"} | ${entry.activeRefs} | ${entry.eligible ? "yes" : "no"} | ${entry.reason} |`,
		),
	];
	return lines.join("\n");
}

function createCandidateRecord(base, detail, extra = {}) {
	return {
		path: base.path,
		scope: base.scope ?? "repo-local",
		category: base.category ?? null,
		sizeBytes: detail.sizeBytes,
		sizeHuman: detail.sizeHuman,
		exists: detail.exists,
		lastModifiedAt: detail.mtimeIso,
		ageHours: computeAgeHours(detail.mtimeIso),
		owner: base.owner ?? null,
		ttlDays: base.ttlDays ?? null,
		rebuildStrategy: base.rebuildStrategy ?? null,
		cleanupClass: base.cleanupClass ?? null,
		provenance: base.provenance ?? null,
		sharedLayer: base.sharedLayer ?? false,
		...extra,
	};
}

async function collectContractVerificationCandidates(options = {}) {
	const context = options.contract
		? options
		: await buildSpaceGovernanceContext(options);
	const activeRefCounter =
		typeof options.activeRefCounter === "function"
			? options.activeRefCounter
			: countActiveRefs;
	const candidates = [];
	const workspaceRealRoot = await fs.realpath(context.rootDir);
	for (const entry of context.contract.verificationCandidates ?? []) {
		const relativePath = String(entry?.path ?? "").trim();
		if (!relativePath) {
			continue;
		}
		const detail = await describeRepoLocalPath(context.rootDir, relativePath);
		const activeRefs = normalizeActiveRefState(
			detail.exists && detail.isDirectory
				? await activeRefCounter(detail.absolutePath)
				: {
						status: "no",
						count: 0,
						error: null,
					},
		);
		const canonical = isCanonicalRuntimePath(relativePath, context.registry);
		const rebuildPathKnown = hasKnownRebuildPath(relativePath);
		const insideWorkspace = !isPathOutsideRoot(
			workspaceRealRoot,
			detail.realPath,
		);
		const eligibleForCleanup =
			detail.exists &&
			!canonical &&
			activeRefs.status === "no" &&
			rebuildPathKnown &&
			insideWorkspace;
		candidates.push({
			path: relativePath,
			scope: "repo-local",
			category: canonical ? "canonical-runtime" : "verification-candidate",
			reason: String(entry?.reason ?? "").trim(),
			exists: detail.exists,
			canonical,
			activeRefs: activeRefs.status,
			activeRefCount: activeRefs.count,
			activeRefsError: activeRefs.error,
			activeRefsKnown: activeRefs.status !== "unknown",
			insideWorkspace,
			rebuildable: rebuildPathKnown,
			eligible: eligibleForCleanup,
			eligibleForCleanup,
			sizeBytes: detail.sizeBytes,
			sizeHuman: detail.sizeHuman,
			lastModifiedAt: detail.mtimeIso,
			ageHours: computeAgeHours(detail.mtimeIso),
			cleanupClass: "verify-first-maintain",
			provenance: "contract-verification-candidate",
			sharedLayer: false,
		});
	}
	return candidates;
}

async function buildMaintenanceCandidate(detail, metadata, options = {}) {
	const activeRefCounter =
		typeof options.activeRefCounter === "function"
			? options.activeRefCounter
			: countActiveRefs;
	const ageHours = computeAgeHours(detail.mtimeIso);
	const keepLatestProtected = options.keepLatestProtected === true;
	const minAgeHours = Number(metadata.maintenanceMinAgeHours ?? 0);
	const scope = options.scope ?? "repo-local";
	const giantTmpThresholdBytes = Number(options.giantTmpThresholdBytes ?? 0);
	const giantTmpEligible =
		metadata.categoryId === "tmp" &&
		detail.sizeBytes >= giantTmpThresholdBytes &&
		giantTmpThresholdBytes > 0;
	let activeRefs = {
		status: "unknown",
		count: 0,
		error: null,
	};
	let eligible = false;
	let reason;
	if (!detail.exists) {
		reason = "missing";
	} else if (scope !== "repo-local") {
		reason = "non-repo-local-scope";
	} else if (options.cleanupClass === "manual-opt-in" && !options.includeInstallSurface) {
		reason = "manual-opt-in";
	} else if (keepLatestProtected) {
		reason = "protected-keep-latest";
	} else if (!giantTmpEligible && ageHours !== null && ageHours < minAgeHours) {
		reason = `below-min-age-${minAgeHours}h`;
	} else {
		activeRefs = normalizeActiveRefState(
			detail.isDirectory
				? await activeRefCounter(detail.absolutePath)
				: { status: "no", count: 0, error: null },
		);
		if (activeRefs.status !== "no") {
			reason =
				activeRefs.status === "unknown"
					? "active-refs-unknown"
					: "active-refs-present";
		} else {
			eligible = true;
			reason = giantTmpEligible ? "eligible-giant-tmp-subtree" : "eligible";
		}
	}
	return createCandidateRecord(
		{
			path: detail.relativePath,
			scope,
			category: metadata.categoryId ?? options.category ?? null,
			owner: metadata.owner ?? null,
			ttlDays: metadata.ttlDays ?? null,
			rebuildStrategy: metadata.rebuildStrategy ?? null,
			cleanupClass: options.cleanupClass ?? metadata.cleanupClass ?? null,
			provenance: options.provenance ?? "runtime-category",
			sharedLayer: options.sharedLayer ?? false,
		},
		detail,
		{
			activeRefs: activeRefs.status,
			activeRefCount: activeRefs.count,
			activeRefsError: activeRefs.error,
			rebuildable: Boolean(metadata.rebuildStrategy),
			eligible,
			eligibleForCleanup: eligible,
			reason,
		},
	);
}

async function collectRuntimeCategoryCandidates(context, categoryPath, metadata, options = {}) {
	const rootDetail = await describeRepoLocalPath(context.rootDir, categoryPath);
	if (!rootDetail.exists) {
		return [];
	}
	const keepLatestCount = Number(metadata.retainLatestCount ?? 0);
	const childEntries =
		rootDetail.isDirectory
			? await collectDirectChildren(rootDetail.relativePath, rootDetail.absolutePath, Number.MAX_SAFE_INTEGER)
			: [];
	const candidatesSource =
		childEntries.length > 0
			? childEntries
			: [
					{
						relativePath: rootDetail.relativePath,
						absolutePath: rootDetail.absolutePath,
						sizeBytes: rootDetail.sizeBytes,
						sizeHuman: rootDetail.sizeHuman,
						mtimeIso: rootDetail.mtimeIso,
						isDirectory: rootDetail.isDirectory,
						exists: rootDetail.exists,
					},
				];
	const sorted = [...candidatesSource].sort((left, right) => {
		const leftMtime = Date.parse(left.mtimeIso ?? 0);
		const rightMtime = Date.parse(right.mtimeIso ?? 0);
		return rightMtime - leftMtime;
	});
	return Promise.all(
		sorted.map((entry, index) =>
			buildMaintenanceCandidate(entry, metadata, {
				...options,
				keepLatestProtected: keepLatestCount > 0 && index < keepLatestCount,
				cleanupClass: metadata.cleanupClass,
				provenance: `runtime-category:${metadata.categoryId}:${categoryPath}`,
			}),
		),
	);
}

async function collectSpaceMaintenanceCandidates(options = {}) {
	const context = options.contract
		? options
		: await buildSpaceGovernanceContext(options);
	const maintenancePolicy = context.contract.maintenancePolicy ?? {};
	const giantTmpThresholdBytes = Number(
		context.contract.giantTmpSubtreeThresholdBytes ?? 0,
	);
	const candidates = [];

	for (const target of maintenancePolicy.safeAutoMaintainTargets ?? []) {
		const relativePath = String(target ?? "").trim();
		if (!relativePath) {
			continue;
		}
		const detail = await describeRepoLocalPath(context.rootDir, relativePath);
		const metadata = getRuntimePathMetadata(relativePath, context.registry) ?? {
			categoryId: "safe-auto",
			owner: "space-governance",
			ttlDays: null,
			rebuildStrategy: "rerun-tooling",
			cleanupClass: "safe-auto-maintain",
			maintenanceMinAgeHours: 0,
			retainLatestCount: 0,
		};
		candidates.push(
			await buildMaintenanceCandidate(detail, metadata, {
				activeRefCounter: options.activeRefCounter,
				cleanupClass: "safe-auto-maintain",
				giantTmpThresholdBytes,
				provenance: "maintenance-policy:safe-auto",
			}),
		);
	}

	for (const target of maintenancePolicy.manualOptInTargets ?? []) {
		const relativePath = String(target ?? "").trim();
		if (!relativePath) {
			continue;
		}
		const detail = await describeRepoLocalPath(context.rootDir, relativePath);
		const metadata = getRuntimePathMetadata(relativePath, context.registry) ?? {
			categoryId: "manual-install-surface",
			owner: "root-allowlist",
			ttlDays: null,
			rebuildStrategy: "reinstall",
			cleanupClass: "manual-opt-in",
			maintenanceMinAgeHours: 0,
			retainLatestCount: 0,
		};
		candidates.push(
			await buildMaintenanceCandidate(detail, metadata, {
				activeRefCounter: options.activeRefCounter,
				cleanupClass: "manual-opt-in",
				giantTmpThresholdBytes,
				includeInstallSurface: options.includeInstallSurface === true,
				provenance: "maintenance-policy:manual-opt-in",
			}),
		);
	}

	const verifyFirstRoots = [];
	for (const [categoryId, entry] of Object.entries(context.registry.categories ?? {})) {
		if (String(entry?.cleanupClass ?? "").trim() !== "verify-first-maintain") {
			continue;
		}
		for (const rootPath of Array.isArray(entry?.paths) ? entry.paths : []) {
			verifyFirstRoots.push({
				categoryId,
				relativePath: String(rootPath ?? "").trim(),
			});
		}
	}
	for (const entry of verifyFirstRoots) {
		if (!entry.relativePath) {
			continue;
		}
		const metadata = getRuntimePathMetadata(entry.relativePath, context.registry);
		if (!metadata) {
			continue;
		}
		const scopedCandidates = await collectRuntimeCategoryCandidates(
			context,
			entry.relativePath,
			metadata,
			{
				activeRefCounter: options.activeRefCounter,
				giantTmpThresholdBytes,
			},
		);
		candidates.push(...scopedCandidates);
	}

	const repoSpecificExternalTargets = await describeRepoSpecificExternalTargets(
		context.rootDir,
		context.contract,
	);
	for (const entry of repoSpecificExternalTargets) {
		candidates.push(
			createCandidateRecord(
				{
					path: entry.id,
					scope: "repo-specific-external",
					category: entry.kind,
					owner: "tool-cache-env",
					ttlDays: null,
					rebuildStrategy: "lazy-rebuild",
					cleanupClass: "never-repo-local",
					provenance: "repo-specific-external",
					sharedLayer: false,
				},
				entry,
				{
					activeRefs: "unknown",
					activeRefCount: 0,
					activeRefsError: null,
					rebuildable: true,
					eligible: false,
					eligibleForCleanup: false,
					reason: "repo-specific-external-reported-only",
				},
			),
		);
	}

	return candidates.sort((left, right) => right.sizeBytes - left.sizeBytes);
}

async function collectTopTmpSubtrees(context, topN) {
	const tmpRoot = await describeRepoLocalPath(context.rootDir, ".runtime-cache/tmp");
	if (!tmpRoot.exists || !tmpRoot.isDirectory) {
		return [];
	}
	const children = await collectDirectChildren(
		tmpRoot.relativePath,
		tmpRoot.absolutePath,
		topN,
	);
	return Promise.all(
		children.map(async (entry) => ({
			path: entry.relativePath,
			sizeBytes: entry.sizeBytes,
			sizeHuman: entry.sizeHuman,
			lastModifiedAt: entry.mtimeIso,
			components: entry.isDirectory
				? await collectDirectChildren(entry.relativePath, entry.absolutePath, topN)
				: [],
		})),
	);
}

async function generateSpaceVerificationReport(options = {}) {
	const context = await buildSpaceGovernanceContext(options);
	const contractCandidates = await collectContractVerificationCandidates({
		rootDir: context.rootDir,
		contractPath: context.contractPath,
		registryPath: context.registryPath,
		contract: context.contract,
		registry: context.registry,
		activeRefCounter: options.activeRefCounter,
	});
	const maintenanceCandidates = await collectSpaceMaintenanceCandidates({
		rootDir: context.rootDir,
		contractPath: context.contractPath,
		registryPath: context.registryPath,
		contract: context.contract,
		registry: context.registry,
		activeRefCounter: options.activeRefCounter,
		includeInstallSurface: options.includeInstallSurface === true,
	});
	const machineLevelDefer = await Promise.all(
		(context.contract.deferredSharedLayers ?? []).map(async (entry) => ({
			path: String(entry?.path ?? "").trim(),
			reason: String(entry?.reason ?? "").trim(),
			...(await describeExternalPath(entry?.path ?? "")),
		})),
	);
	const repoSpecificExternalTargets = await describeRepoSpecificExternalTargets(
		context.rootDir,
		context.contract,
	);
	const topTmpSubtrees = await collectTopTmpSubtrees(
		context,
		Number(context.contract.topN ?? 10),
	);
	const eligibleRepoLocalBytes = maintenanceCandidates
		.filter(
			(entry) =>
				entry.scope === "repo-local" && entry.eligibleForCleanup === true,
		)
		.reduce((sum, entry) => sum + entry.sizeBytes, 0);
	const report = {
		generatedAt: new Date().toISOString(),
		rootDir: context.rootDir,
		summary: {
			contractCandidateCount: contractCandidates.length,
			maintenanceCandidateCount: maintenanceCandidates.length,
			eligibleRepoLocalBytes,
			eligibleRepoLocalHuman: formatBytes(eligibleRepoLocalBytes),
			sharedLayerRelatedBytes: machineLevelDefer.reduce(
				(sum, entry) => sum + entry.sizeBytes,
				0,
			),
			sharedLayerRelatedHuman: formatBytes(
				machineLevelDefer.reduce((sum, entry) => sum + entry.sizeBytes, 0),
			),
			repoSpecificExternalBytes: repoSpecificExternalTargets.reduce(
				(sum, entry) => sum + entry.sizeBytes,
				0,
			),
			repoSpecificExternalHuman: formatBytes(
				repoSpecificExternalTargets.reduce(
					(sum, entry) => sum + entry.sizeBytes,
					0,
				),
			),
		},
		contractCandidates,
		maintenanceCandidates,
		candidates: [...contractCandidates, ...maintenanceCandidates],
		machineLevelDefer,
		repoSpecificExternalTargets,
		topTmpSubtrees,
	};

	const outputRoot = path.resolve(
		context.rootDir,
		String(
			context.contract.reportRoot ?? ".runtime-cache/reports/space-governance",
		),
	);
	await fs.mkdir(outputRoot, { recursive: true });
	const fileNames = buildReportFileNames(options.label ?? "verified-candidates");
	const jsonPath = path.join(outputRoot, fileNames.jsonName);
	const markdownPath = path.join(outputRoot, fileNames.markdownName);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${formatStatusMarkdown(report)}\n`, "utf8"),
	]);

	return { report, jsonPath, markdownPath };
}

const collectSpaceVerificationCandidates = collectContractVerificationCandidates;

async function runSpaceVerifyCandidatesCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const result = await generateSpaceVerificationReport(options);
		stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					reportPath: toPosixPath(
						path.relative(process.cwd(), result.jsonPath),
					),
					markdownPath: toPosixPath(
						path.relative(process.cwd(), result.markdownPath),
					),
					summary: result.report.summary,
					candidates: result.report.candidates,
				},
				null,
				2,
			)}\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(
			`Space verification report failed: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runSpaceVerifyCandidatesCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	collectContractVerificationCandidates,
	collectSpaceMaintenanceCandidates,
	collectSpaceVerificationCandidates,
	generateSpaceVerificationReport,
	runSpaceVerifyCandidatesCli,
};
