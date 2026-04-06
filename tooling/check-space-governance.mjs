#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	buildSpaceGovernanceContext,
	collectRuntimeSubtrees,
	describeRepoLocalPath,
	formatBytes,
	resolveRepoLocalPath,
} from "./shared/space-governance.mjs";

async function runSpaceGovernanceCheck(options = {}) {
	const context = await buildSpaceGovernanceContext(options);
	const errors = [];
	const runtimeSubtrees = await collectRuntimeSubtrees(
		context.rootDir,
		context.registry,
	);
	const heavyThreshold = Number(
		context.contract.nonCanonicalRuntimeHeavyThresholdBytes ?? 0,
	);
	const hardFailPaths = new Set(
		(context.contract.hardFailNonCanonicalPaths ?? [])
			.map((entry) => String(entry ?? "").trim())
			.filter(Boolean),
	);

	for (const anomaly of context.contract.rootAnomalies ?? []) {
		try {
			const detail = await describeRepoLocalPath(
				context.rootDir,
				String(anomaly),
			);
			if (detail.exists && !hardFailPaths.has(detail.relativePath)) {
				errors.push(
					`forbidden root anomaly exists: ${detail.relativePath} (${detail.sizeHuman})`,
				);
			}
		} catch (error) {
			errors.push(
				`failed to inspect root anomaly ${String(anomaly)}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	for (const hardFailPath of hardFailPaths) {
		try {
			const detail = await describeRepoLocalPath(context.rootDir, hardFailPath);
			if (detail.exists) {
				errors.push(
					`hard-fail non-canonical path exists: ${detail.relativePath} (${detail.sizeHuman})`,
				);
			}
		} catch (error) {
			errors.push(
				`failed to inspect hard-fail path ${hardFailPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	for (const subtree of runtimeSubtrees) {
		if (subtree.canonical) {
			continue;
		}
		if (hardFailPaths.has(subtree.relativePath)) {
			continue;
		}
		if (subtree.sizeBytes >= heavyThreshold) {
			errors.push(
				`unknown heavy non-canonical runtime subtree: ${subtree.relativePath} (${subtree.sizeHuman})`,
			);
		}
	}

	const runtimeSurface = String(context.registry.runtimeSurface ?? ".runtime-cache");
	const deferredSharedLayerSet = new Set(
		(context.contract.deferredSharedLayers ?? [])
			.map((entry) => String(entry?.path ?? "").trim())
			.filter(Boolean),
	);
	for (const target of context.contract.lowRiskCleanupTargets ?? []) {
		const targetPath = String(target ?? "").trim();
		const resolved = await resolveRepoLocalPath(context.rootDir, targetPath);
		if (deferredSharedLayerSet.has(targetPath)) {
			errors.push(`cleanup allowlist must not include shared layer target: ${targetPath}`);
		}
		if (resolved.relativePath === runtimeSurface) {
			errors.push("cleanup allowlist must not include the runtime surface root");
		}
		if (
			resolved.relativePath === ".git" ||
			resolved.relativePath === "node_modules"
		) {
			errors.push(`cleanup allowlist must not include protected repo target: ${resolved.relativePath}`);
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: context.rootDir,
		contractPath: path.relative(context.rootDir, context.contractPath),
		registryPath: path.relative(context.rootDir, context.registryPath),
		heavyThresholdBytes: heavyThreshold,
		heavyThresholdHuman: formatBytes(heavyThreshold),
		okSemantics:
			"no hard-fail pollution and no unknown non-canonical runtime subtree above threshold",
		errors,
	};
}

async function main() {
	try {
		const result = await runSpaceGovernanceCheck();
		if (!result.ok) {
			console.error("[space-governance] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			`[space-governance] OK (${result.contractPath}; ${result.okSemantics})`,
		);
	} catch (error) {
		console.error(
			`[space-governance] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runSpaceGovernanceCheck };
