import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_STEPS = [
	"clean:runtime:full",
	"test:fast:gate",
	"smoke:e2e",
	"ci:gate",
	"governance:evidence:check",
];

async function runScript(scriptName, rootDir) {
	const command = process.platform === "win32" ? "npm.cmd" : "npm";
	const startedAt = Date.now();
	await execFileAsync(command, ["run", "-s", scriptName], {
		cwd: rootDir,
		env: process.env,
		maxBuffer: 1024 * 1024 * 8,
	});
	return {
		scriptName,
		durationMs: Date.now() - startedAt,
	};
}

async function runColdStartGovernanceCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const steps = options.steps ?? DEFAULT_STEPS;
	const results = [];
	for (const scriptName of steps) {
		results.push(await runScript(scriptName, rootDir));
	}
	return {
		ok: true,
		rootDir,
		steps: results,
	};
}

async function main() {
	try {
		const result = await runColdStartGovernanceCheck();
		globalThis.console.log(
			`[cold-start-governance] OK (${result.steps
				.map((step) => `${step.scriptName}:${step.durationMs}ms`)
				.join(", ")})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[cold-start-governance] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { DEFAULT_STEPS, runColdStartGovernanceCheck };
