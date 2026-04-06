import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function buildPythonCandidates() {
	const configured = process.env.OPENUI_GEMINI_PYTHON_BIN?.trim();
	if (configured) {
		return [{ command: configured, args: [] }];
	}

	if (process.platform === "win32") {
		return [
			{ command: "py", args: ["-3"] },
			{ command: "python", args: [] },
		];
	}

	return [
		{ command: "python3", args: [] },
		{ command: "python", args: [] },
	];
}

function main() {
	const [, , scriptPathArg, ...scriptArgs] = process.argv;
	if (!scriptPathArg) {
		console.error(
			"Usage: node tooling/run-python-with-env.mjs <script.py> [args...]",
		);
		process.exit(1);
	}

	const scriptPath = path.resolve(process.cwd(), scriptPathArg);
	const candidates = buildPythonCandidates();

	for (const candidate of candidates) {
		const result = spawnSync(
			candidate.command,
			[...candidate.args, scriptPath, ...scriptArgs],
			{ stdio: "inherit", env: process.env },
		);

		if (result.error?.code === "ENOENT") {
			continue;
		}

		if (result.error) {
			console.error(
				`Failed to execute python via "${candidate.command}": ${result.error.message}`,
			);
			process.exit(1);
		}

		process.exit(result.status ?? 1);
	}

	console.error(
		'Python executable not found. Set OPENUI_GEMINI_PYTHON_BIN or install "python3"/"python".',
	);
	process.exit(1);
}

main();
