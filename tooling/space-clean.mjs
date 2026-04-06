#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
	buildSpaceGovernanceContext,
	describeRepoLocalPath,
	formatBytes,
} from "./shared/space-governance.mjs";
import { generateSpaceGovernanceReport } from "./space-governance-report.mjs";
import { collectSpaceVerificationCandidates } from "./space-verify-candidates.mjs";

const PROTECTED_REPO_TARGETS = new Set([".git", "node_modules"]);

function parseCliArgs(argv = process.argv.slice(2)) {
	const options = {
		targetSet: "low-risk",
		apply: false,
		targets: [],
	};
	for (const arg of argv) {
		if (arg === "--apply") {
			options.apply = true;
			continue;
		}
		if (arg.startsWith("--target-set=")) {
			options.targetSet = arg.slice("--target-set=".length).trim();
			continue;
		}
		if (arg.startsWith("--label=")) {
			options.label = arg.slice("--label=".length).trim();
			continue;
		}
		if (arg.startsWith("--target=")) {
			options.targets.push(arg.slice("--target=".length).trim());
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

function resolveParsedArgs(options = {}) {
	if (options.parsedArgs) {
		return options.parsedArgs;
	}
	if (options.argv) {
		return parseCliArgs(options.argv);
	}
	return {
		targetSet: options.targetSet ?? "low-risk",
		apply: options.apply === true,
		label: options.label,
		targets: Array.isArray(options.targets) ? options.targets : [],
	};
}

async function ensureWritableThenRemove(targetPath) {
	if (!(await fs
		.access(targetPath)
		.then(() => true)
		.catch(() => false))) {
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

async function resolveCleanupCandidates(context, parsed, options = {}) {
	const requestedTargets =
		Array.isArray(parsed.targets) && parsed.targets.length > 0
			? parsed.targets
			: null;
	if (parsed.targetSet === "low-risk") {
		const allowedTargets = new Set(
			(context.contract.lowRiskCleanupTargets ?? [])
				.map((targetPath) => String(targetPath ?? "").trim())
				.filter(Boolean),
		);
		const runtimeSurface = String(
			context.registry.runtimeSurface ?? ".runtime-cache",
		);
		const selectedTargets = requestedTargets ?? [...allowedTargets];
		for (const targetPath of selectedTargets) {
			if (targetPath === runtimeSurface) {
				throw new Error(
					"refuse runtime surface root cleanup request; select a registered child path instead",
				);
			}
			if (PROTECTED_REPO_TARGETS.has(targetPath)) {
				throw new Error(
					`refuse protected repo target cleanup request: ${targetPath}`,
				);
			}
			if (!allowedTargets.has(targetPath)) {
				throw new Error(
					`target is outside low-risk cleanup allowlist: ${targetPath}`,
				);
			}
		}
		return Promise.all(
			selectedTargets.map(async (targetPath) => {
				const detail = await describeRepoLocalPath(
					context.rootDir,
					String(targetPath),
				);
				return {
					path: detail.relativePath,
					exists: detail.exists,
					sizeBytes: detail.sizeBytes,
					sizeHuman: detail.sizeHuman,
					eligibleForCleanup: detail.exists,
				};
			}),
		);
	}
	if (parsed.targetSet === "verified") {
		if (requestedTargets) {
			throw new Error(
				"--target is only supported with --target-set=low-risk",
			);
		}
		const candidates = await collectSpaceVerificationCandidates({
			rootDir: context.rootDir,
			contractPath: context.contractPath,
			registryPath: context.registryPath,
			contract: context.contract,
			registry: context.registry,
			activeRefCounter: parsed.activeRefCounter ?? options.activeRefCounter,
		});
		return candidates.map((entry) => ({
			path: entry.path,
			exists: entry.exists,
			sizeBytes: entry.sizeBytes,
			sizeHuman: entry.sizeHuman,
			eligibleForCleanup: entry.eligibleForCleanup,
		}));
	}
	throw new Error(`Unsupported target set: ${parsed.targetSet}`);
}

async function runSpaceClean(options = {}) {
	const parsed = resolveParsedArgs(options);
	const context = await buildSpaceGovernanceContext(options);
	const candidates = await resolveCleanupCandidates(context, parsed, options);
	const selected = candidates.filter((entry) => entry.eligibleForCleanup);
	const reclaimableBytes = selected.reduce((sum, entry) => sum + entry.sizeBytes, 0);

	if (!parsed.apply) {
		return {
			ok: true,
			mode: "dry-run",
			targetSet: parsed.targetSet,
			candidates:
				parsed.targetSet === "verified" ? selected : candidates,
			reclaimableBytes,
			reclaimableHuman: formatBytes(reclaimableBytes),
			deferredSharedLayers: context.contract.deferredSharedLayers ?? [],
		};
	}

	const ineligible = candidates.filter((entry) => !entry.eligibleForCleanup && entry.exists);
	if (parsed.targetSet === "verified" && ineligible.length > 0) {
		throw new Error(
			`Verified cleanup cannot proceed while ineligible candidates still exist: ${ineligible.map((entry) => entry.path).join(", ")}`,
		);
	}

	const labelPrefix = parsed.label?.trim() || parsed.targetSet;
	const removed = [];
	await generateSpaceGovernanceReport({
		rootDir: context.rootDir,
		label: `${labelPrefix}-pre-apply`,
	});
	try {
		for (const entry of selected) {
			if (PROTECTED_REPO_TARGETS.has(entry.path)) {
				throw new Error(
					`refuse protected repo target cleanup request: ${entry.path}`,
				);
			}
			await ensureWritableThenRemove(path.resolve(context.rootDir, entry.path));
				removed.push(entry.path);
			}
		} catch (error) {
			const failedPath = selected[removed.length]?.path ?? null;
			const reportResult = await generateSpaceGovernanceReport({
				rootDir: context.rootDir,
				label: `${labelPrefix}-post-apply`,
			});
			const postApplyReportPath = path.relative(
				context.rootDir,
				reportResult.jsonPath,
			);
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(
				`space clean apply failed after removing [${removed.join(", ")}]${failedPath ? `; failed at ${failedPath}` : ""}; post-apply snapshot: ${postApplyReportPath}; reason: ${reason}`,
				{ cause: error },
			);
	}
	const reportResult = await generateSpaceGovernanceReport({
		rootDir: context.rootDir,
		label: `${labelPrefix}-post-apply`,
	});
	const postApplyReportPath = path.relative(
		context.rootDir,
		reportResult.jsonPath,
	);

	return {
		ok: true,
		mode: "apply",
		targetSet: parsed.targetSet,
		removed,
		reclaimableBytes,
		reclaimableHuman: formatBytes(reclaimableBytes),
		reportPath: postApplyReportPath,
	};
}

async function runSpaceCleanCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const result = await runSpaceClean(options);
		stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	} catch (error) {
		stderr.write(
			`[space-clean] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runSpaceCleanCli({ argv: process.argv.slice(2) }).then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { parseCliArgs, runSpaceClean, runSpaceCleanCli };
