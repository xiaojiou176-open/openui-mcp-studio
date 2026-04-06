import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_CONTRACT_PATH = "contracts/governance/final-form-score.contract.json";

async function runFinalFormScoreCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	const packageJson = await readJsonFile(path.resolve(rootDir, "package.json"));
	const imageLock = await readJsonFile(path.resolve(rootDir, ".github", "ci-image.lock.json"));
	const errors = [];

	const workspaces = Array.isArray(packageJson.workspaces) ? packageJson.workspaces : [];
	for (const expectedWorkspace of contract.requiredWorkspaceGlobs ?? []) {
		if (!workspaces.includes(expectedWorkspace)) {
			errors.push(`package.json is missing required workspace glob "${expectedWorkspace}"`);
		}
	}

	const scripts = packageJson.scripts ?? {};
	for (const scriptName of contract.requiredScriptCommands ?? []) {
		if (!(scriptName in scripts)) {
			errors.push(`package.json is missing required script "${scriptName}"`);
		}
	}

	for (const contractFile of contract.requiredContractFiles ?? []) {
		const filePath = path.resolve(rootDir, contractFile);
		try {
			await fs.access(filePath);
		} catch {
			errors.push(`missing required governance contract file "${contractFile}"`);
		}
	}

	if (
		typeof imageLock.digest !== "string" ||
		!/^sha256:[0-9a-f]{64}$/i.test(imageLock.digest.trim())
	) {
		errors.push(".github/ci-image.lock.json must carry a non-empty immutable digest before final-form score can pass");
	}

	for (const forbiddenLegacyScript of [
		"governance:artifacts:check",
		"governance:cache-tier:check",
	]) {
		if (forbiddenLegacyScript in scripts) {
			errors.push(`package.json still exposes forbidden legacy script "${forbiddenLegacyScript}"`);
		}
	}
	if ("requiredRootInstallSurface" in contract) {
		errors.push('final-form-score contract must not declare legacy "requiredRootInstallSurface"');
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		score: contract.scoring ?? {},
		errors,
	};
}

async function main() {
	try {
		const result = await runFinalFormScoreCheck();
		if (!result.ok) {
			console.error("[final-form-score] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(`[final-form-score] OK (${result.contractPath})`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[final-form-score] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runFinalFormScoreCheck };
