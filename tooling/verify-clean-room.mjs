import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

async function runCleanRoomVerification(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const imageLock = await readJsonFile(path.resolve(rootDir, ".github/ci-image.lock.json"));
	const runLayout = await readJsonFile(path.resolve(rootDir, "contracts/runtime/run-layout.json"));
	const errors = [];

	if (!/^sha256:[0-9a-f]{64}$/i.test(String(imageLock.digest ?? "").trim())) {
		errors.push("clean-room verification requires a non-empty immutable CI image digest");
	}
	if (String(runLayout.runsRoot ?? "") !== ".runtime-cache/runs") {
		errors.push('run-layout runsRoot must stay ".runtime-cache/runs" for clean-room reproducibility');
	}

	for (const forbidden of ["node_modules", "coverage", "dist", "build", "playwright-report", "htmlcov"]) {
		try {
			await fs.access(path.resolve(rootDir, forbidden));
			errors.push(`clean-room precondition failed: root still contains ${forbidden}`);
		} catch {
			// expected
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
		const result = await runCleanRoomVerification();
		if (!result.ok) {
			console.error("[verify-clean-room] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[verify-clean-room] OK");
	} catch (error) {
		console.error(`[verify-clean-room] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runCleanRoomVerification };
