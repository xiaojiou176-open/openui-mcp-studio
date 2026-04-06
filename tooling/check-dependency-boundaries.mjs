import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	collectCodeFiles,
	createGlobMatcher,
	extractModuleSpecifiers,
	readJsonFile,
	resolveImportToRepoPath,
	toPosixPath,
} from "./shared/governance-utils.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/dependency-boundaries.json";

async function runDependencyBoundaryCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const includeRoots = Array.isArray(contract.includeRoots)
		? contract.includeRoots
		: ["src", "scripts"];
	const excludePatterns = Array.isArray(contract.excludePatterns)
		? contract.excludePatterns
		: [];

	const files = [];
	for (const includeRoot of includeRoots) {
		files.push(
			...(await collectCodeFiles(path.resolve(rootDir, includeRoot), rootDir, {
				excludePatterns,
			})),
		);
	}

	const rules = (contract.rules ?? []).map((rule) => ({
		...rule,
		fromMatcher: createGlobMatcher(rule.from ?? []),
		disallowMatcher: createGlobMatcher(rule.disallow ?? []),
		allowMatcher: createGlobMatcher(rule.allow ?? []),
	}));

	const violations = [];
	for (const filePath of files) {
		const repoPath = toPosixPath(path.relative(rootDir, filePath));
		const raw = await fs.readFile(filePath, "utf8");
		const specifiers = extractModuleSpecifiers(raw);
		if (specifiers.length === 0) {
			continue;
		}

		for (const specifier of specifiers) {
			const importedRepoPath = await resolveImportToRepoPath(
				filePath,
				specifier,
				rootDir,
			);
			if (!importedRepoPath) {
				continue;
			}

			for (const rule of rules) {
				if (!rule.fromMatcher(repoPath)) {
					continue;
				}
				if (!rule.disallowMatcher(importedRepoPath)) {
					continue;
				}
				if (rule.allowMatcher(importedRepoPath)) {
					continue;
				}
				violations.push({
					ruleId: rule.id,
					file: repoPath,
					specifier,
					resolvedImport: importedRepoPath,
					description: rule.description ?? "",
				});
			}
		}
	}

	return {
		ok: violations.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		violations,
	};
}

async function main() {
	try {
		const result = await runDependencyBoundaryCheck();
		if (!result.ok) {
			globalThis.console.error("[dependency-boundaries] FAILED");
			for (const violation of result.violations) {
				globalThis.console.error(
					`- ${violation.ruleId}: ${violation.file} -> ${violation.resolvedImport} (${violation.specifier})`,
				);
			}
			process.exit(1);
		}
		globalThis.console.log(
			`[dependency-boundaries] OK (${result.contractPath})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[dependency-boundaries] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runDependencyBoundaryCheck };
