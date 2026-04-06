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
	describeBrowserLanePolicy,
	describeExternalPath,
	describeRepoSpecificExternalContext,
	describeRepoSpecificPersistentAssets,
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

function listOpenPathsUnder(rootPath) {
	try {
		const stdout = execFileSync("lsof", ["-F", "n", "+D", rootPath], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return {
			ok: true,
			paths: stdout
				.split(/\r?\n/u)
				.map((line) => line.trim())
				.filter((line) => line.startsWith("n"))
				.map((line) => line.slice(1))
				.filter(Boolean),
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
					ok: true,
					paths: [],
					error: null,
				};
			}
		}
		return {
			ok: false,
			paths: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function buildScopedActiveRefCounter(scanRoot, fallbackCounter = countActiveRefs) {
	let cachedResult = null;
	return async (targetPath) => {
		if (!cachedResult) {
			cachedResult = listOpenPathsUnder(scanRoot);
		}
		if (!cachedResult.ok) {
			return fallbackCounter(targetPath);
		}
		const normalizedTarget = path.resolve(targetPath);
		const targetPrefix = normalizedTarget.endsWith(path.sep)
			? normalizedTarget
			: `${normalizedTarget}${path.sep}`;
		let count = 0;
		for (const openPath of cachedResult.paths) {
			const normalizedOpenPath = path.resolve(openPath);
			if (
				normalizedOpenPath === normalizedTarget ||
				normalizedOpenPath.startsWith(targetPrefix)
			) {
				count += 1;
			}
		}
		return {
			status: count > 0 ? "yes" : "no",
			count,
			error: null,
		};
	};
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
		"",
		"## Repo-Specific External Targets",
		"",
		`- Base root: ${report.repoSpecificExternalContext?.toolCacheBaseRoot ?? "n/a"}`,
		`- Workspace token: ${report.repoSpecificExternalContext?.workspaceToken ?? "n/a"}`,
		`- TTL days: ${report.repoSpecificExternalContext?.policy?.retentionDays ?? "n/a"}`,
		`- Max bytes: ${report.repoSpecificExternalContext?.policy?.maxBytesHuman ?? "n/a"}`,
		`- Clean interval minutes: ${report.repoSpecificExternalContext?.policy?.cleanIntervalMinutes ?? "n/a"}`,
		`- Default apply mode: ${report.repoSpecificExternalContext?.applyMode ?? "managed"}`,
		`- Latest janitor receipt: ${report.repoSpecificExternalContext?.latestReceipt?.generatedAt ?? "none"}`,
		"",
		"| Target | Path | Exists | Size | Apply mode | Reason |",
		"| --- | --- | --- | ---: | --- | --- |",
		...(report.reportedOnlyExternalTargets.length > 0
			? report.reportedOnlyExternalTargets.map(
					(entry) =>
						`| ${entry.id} | ${entry.path ?? "unresolved"} | ${entry.exists ? "yes" : "no"} | ${entry.sizeHuman} | ${entry.applyMode ?? "managed"} | ${entry.reason} |`,
				)
			: ["| none | unresolved | no | 0 B | managed | n/a |"]),
		"",
		"## Repo Browser Lane",
		"",
		`- User data dir: ${report.browserLanePolicy?.effectiveUserDataDir ?? "n/a"}`,
		`- Profile directory: ${report.browserLanePolicy?.effectiveProfileDirectory ?? "n/a"}`,
		`- Channel: ${report.browserLanePolicy?.channel ?? "n/a"}`,
		`- CDP port: ${report.browserLanePolicy?.cdpPort ?? "n/a"}`,
		`- Current instance state: ${report.browserLanePolicy?.currentInstanceState ?? "unknown"}`,
		`- Janitor excluded: ${report.browserLanePolicy?.janitorExcluded === true ? "yes" : "no"}`,
		"",
		"| Asset | Path | Exists | Size | Apply mode | Janitor excluded | Reason |",
		"| --- | --- | --- | ---: | --- | --- | --- |",
		...(report.reportedOnlyPersistentBrowserAssets.length > 0
			? report.reportedOnlyPersistentBrowserAssets.map(
					(entry) =>
						`| ${entry.id} | ${entry.path ?? "unresolved"} | ${entry.exists ? "yes" : "no"} | ${entry.sizeHuman} | ${entry.applyMode ?? "report-only"} | ${entry.janitorExcluded === true ? "yes" : "no"} | ${entry.reason} |`,
				)
			: ["| none | unresolved | no | 0 B | report-only | yes | n/a |"]),
	];
	return lines.join("\n");
}

function buildVerifyCliResultPayload(result) {
	const baseRoot =
		typeof result?.report?.rootDir === "string" && result.report.rootDir.trim()
			? result.report.rootDir
			: process.cwd();
	const contractCandidates = Array.isArray(result?.report?.contractCandidates)
		? result.report.contractCandidates
		: [];
	const maintenanceCandidates = Array.isArray(result?.report?.maintenanceCandidates)
		? result.report.maintenanceCandidates
		: [];
	const reportedOnlyExternalTargets = Array.isArray(
		result?.report?.reportedOnlyExternalTargets,
	)
		? result.report.reportedOnlyExternalTargets
		: [];
	const reportedOnlyPersistentBrowserAssets = Array.isArray(
		result?.report?.reportedOnlyPersistentBrowserAssets,
	)
		? result.report.reportedOnlyPersistentBrowserAssets
		: [];
	const topEligibleCandidates = maintenanceCandidates
		.filter((entry) => entry.eligibleForCleanup === true)
		.slice(0, 10)
		.map((entry) => ({
			path: entry.path,
			sizeHuman: entry.sizeHuman,
			cleanupClass: entry.cleanupClass,
			reason: entry.reason,
		}));
	return {
		ok: true,
		reportPath: toPosixPath(path.relative(baseRoot, result.jsonPath)),
		markdownPath: toPosixPath(path.relative(baseRoot, result.markdownPath)),
		summary: result.report.summary,
		contractCandidateCount: contractCandidates.length,
		maintenanceCandidateCount: maintenanceCandidates.length,
		eligibleCount: maintenanceCandidates.filter(
			(entry) => entry.eligibleForCleanup === true,
		).length,
		topEligibleCandidates,
		reportedOnlyExternalTargets,
		reportedOnlyPersistentBrowserAssets,
		repoSpecificExternalContext: result.report.repoSpecificExternalContext,
		browserLanePolicy: result.report.browserLanePolicy,
	};
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
	const scopedActiveRefCounter = buildScopedActiveRefCounter(
		rootDetail.absolutePath,
		options.activeRefCounter,
	);
	return Promise.all(
		sorted.map((entry, index) =>
			buildMaintenanceCandidate(entry, metadata, {
				...options,
				activeRefCounter: scopedActiveRefCounter,
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
	const externalMeasurement = "shallow";
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
			...(await describeExternalPath(entry?.path ?? "", {
				measurement: externalMeasurement,
			})),
		})),
	);
	const repoSpecificExternalContext = await describeRepoSpecificExternalContext(
		context.rootDir,
		context.contract,
		{ env: options.env },
	);
	const reportedOnlyExternalTargets = await describeRepoSpecificExternalTargets(
		context.rootDir,
		context.contract,
		{
			defaultMeasurement: externalMeasurement,
			env: options.env,
		},
	);
	const reportedOnlyPersistentBrowserAssets =
		await describeRepoSpecificPersistentAssets(context.rootDir, context.contract, {
			measurement: externalMeasurement,
		});
	const browserLanePolicy = await describeBrowserLanePolicy(
		context.rootDir,
		context.contract,
		{ env: options.env },
	);
	const repoSpecificExternalRootDetail =
		repoSpecificExternalContext?.toolCacheBaseRoot
			? await describeExternalPath(repoSpecificExternalContext.toolCacheBaseRoot, {
					measurement: externalMeasurement,
				})
			: {
					exists: false,
					absolutePath: null,
					sizeBytes: 0,
					sizeHuman: "0 B",
					mtimeIso: null,
					isDirectory: false,
				};
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
			repoSpecificExternalBytes: repoSpecificExternalRootDetail.sizeBytes,
			repoSpecificExternalHuman: formatBytes(repoSpecificExternalRootDetail.sizeBytes),
		},
		contractCandidates,
		maintenanceCandidates,
		candidates: [...contractCandidates, ...maintenanceCandidates],
		machineLevelDefer,
		repoSpecificExternalContext,
		repoSpecificExternalRootDetail,
		reportedOnlyExternalTargets,
		repoSpecificExternalTargets: reportedOnlyExternalTargets,
		reportedOnlyPersistentBrowserAssets,
		repoSpecificPersistentAssets: reportedOnlyPersistentBrowserAssets,
		browserLanePolicy,
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
		stdout.write(`${JSON.stringify(buildVerifyCliResultPayload(result), null, 2)}\n`);
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
	buildVerifyCliResultPayload,
	runSpaceVerifyCandidatesCli,
};
