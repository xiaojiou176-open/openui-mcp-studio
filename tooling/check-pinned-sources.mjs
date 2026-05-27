import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const CI_IMAGE_LOCK_PATH = ".github/ci-image.lock.json";
const FLOATING_PATTERNS = [
	/@latest\b/i,
	/:latest\b/i,
	/docker:\/\/[^@\s]+:(?!sha256:)[^\s]+/i,
];

async function collectTextFiles(rootDir, relativeDir, extensions) {
	const absoluteDir = path.resolve(rootDir, relativeDir);
	const results = [];
	const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(absoluteDir, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await collectTextFiles(rootDir, path.join(relativeDir, entry.name), extensions)));
			continue;
		}
		if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
			results.push(absolutePath);
		}
	}
	return results;
}

async function runPinnedSourceCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const lockPath = path.resolve(rootDir, CI_IMAGE_LOCK_PATH);
	const lock = await readJsonFile(lockPath);
	const errors = [];

	if (typeof lock.imageRepo !== "string" || !lock.imageRepo.startsWith("ghcr.io/")) {
		errors.push(".github/ci-image.lock.json must declare a GHCR imageRepo");
	}
	const digest = String(lock.digest ?? "").trim();
	if (!/^sha256:[0-9a-f]{64}$/i.test(digest)) {
		errors.push(".github/ci-image.lock.json digest must be a non-empty immutable sha256 digest");
	}

	const candidateFiles = [
		...(await collectTextFiles(rootDir, ".github/workflows", [".yml", ".yaml"])),
		...(await collectTextFiles(rootDir, ".github/actions", [".yml", ".yaml"])),
		path.resolve(rootDir, "ops/ci-container/run-in-container.sh"),
	];

	for (const filePath of candidateFiles) {
		const content = await fs.readFile(filePath, "utf8");
		for (const pattern of FLOATING_PATTERNS) {
			const match = content.match(pattern);
			if (match) {
				errors.push(
					`${path.relative(rootDir, filePath)} contains floating source reference "${match[0]}"`,
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		lockPath: CI_IMAGE_LOCK_PATH,
		errors,
	};
}

async function main() {
	try {
		const result = await runPinnedSourceCheck();
		if (!result.ok) {
			globalThis.console.error("[pinned-source] FAILED");
			for (const error of result.errors) {
				globalThis.console.error(`- ${error}`);
			}
			process.exit(1);
		}
		globalThis.console.log(`[pinned-source] OK (${result.lockPath})`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[pinned-source] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runPinnedSourceCheck };
