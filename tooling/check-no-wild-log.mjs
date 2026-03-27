import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toPosixPath } from "./shared/governance-utils.mjs";

const EXCLUDED_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	".runtime-cache",
]);

async function walk(rootDir, currentDir = rootDir, files = []) {
	const entries = await fs.readdir(currentDir, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(currentDir, entry.name);
		const relativePath = path.relative(rootDir, absolutePath);
		const firstSegment = relativePath.split(path.sep)[0];

		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(firstSegment)) {
				continue;
			}
			await walk(rootDir, absolutePath, files);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		files.push(absolutePath);
	}
	return files;
}

async function runNoWildLogCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const files = await walk(rootDir);
	const errors = [];

	for (const filePath of files) {
		const relativePath = toPosixPath(path.relative(rootDir, filePath));
		if (
			relativePath.endsWith(".log") ||
			relativePath.endsWith(".out") ||
			relativePath.endsWith(".jsonl")
		) {
			errors.push(`wild log file detected outside governed log root: ${relativePath}`);
		}
	}

	const gitignorePath = path.resolve(rootDir, ".gitignore");
	const gitignore = await fs.readFile(gitignorePath, "utf8");
	for (const requiredRule of [".runtime-cache/"]) {
		if (!gitignore.includes(requiredRule)) {
			errors.push(`.gitignore is missing required log/cache rule "${requiredRule}"`);
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		errors,
	};
}

async function main() {
	try {
		const result = await runNoWildLogCheck();
		if (!result.ok) {
			globalThis.console.error("[no-wild-log] FAILED");
			for (const error of result.errors) {
				globalThis.console.error(`- ${error}`);
			}
			process.exit(1);
		}
		globalThis.console.log("[no-wild-log] OK");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[no-wild-log] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runNoWildLogCheck };
