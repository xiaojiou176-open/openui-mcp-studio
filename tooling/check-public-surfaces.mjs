import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	collectCodeFiles,
	extractModuleSpecifiers,
	readJsonFile,
	resolveImportToRepoPath,
	toPosixPath,
} from "./shared/governance-utils.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/public-surfaces.json";

async function runPublicSurfaceCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const errors = [];
	const allowedSurfacePaths = new Set();

	for (const surface of contract.surfaces ?? []) {
		const filePath = String(surface.file ?? "").trim();
		if (!filePath) {
			errors.push("public-surfaces contains entry without file");
			continue;
		}
		allowedSurfacePaths.add(filePath);
		try {
			await fs.access(path.resolve(rootDir, filePath));
		} catch {
			errors.push(`public surface file is missing: ${filePath}`);
		}
	}

	const toolingFiles = await collectCodeFiles(
		path.resolve(rootDir, "tooling"),
		rootDir,
		{
			excludePatterns: ["**/node_modules/**", "**/.runtime-cache/**"],
		},
	);

	for (const toolingFile of toolingFiles) {
		const repoPath = toPosixPath(path.relative(rootDir, toolingFile));
		const source = await fs.readFile(toolingFile, "utf8");
		for (const specifier of extractModuleSpecifiers(source)) {
			const importedRepoPath = await resolveImportToRepoPath(
				toolingFile,
				specifier,
				rootDir,
			);
			if (!importedRepoPath) {
				continue;
			}
			if (
				!importedRepoPath.startsWith("services/") &&
				!importedRepoPath.startsWith("packages/")
			) {
				continue;
			}
			if (!allowedSurfacePaths.has(importedRepoPath)) {
				errors.push(
					`tooling import crosses an undeclared public surface: ${repoPath} -> ${importedRepoPath}`,
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		errors,
	};
}

async function main() {
	try {
		const result = await runPublicSurfaceCheck();
		if (!result.ok) {
			console.error("[public-surface] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[public-surface] OK (${result.contractPath})`);
	} catch (error) {
		console.error(
			`[public-surface] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runPublicSurfaceCheck };
