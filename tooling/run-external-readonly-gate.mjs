import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ENFORCE_FLAG = "--enforce";

function parseExternalReadonlyGateArgs(argv) {
	let enforce = false;

	for (const argument of argv) {
		if (argument === ENFORCE_FLAG) {
			enforce = true;
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}

	return { enforce };
}

function runExternalReadonlyGate({
	enforce = false,
	cwd = process.cwd(),
	env = process.env,
	run = spawnSync,
	stdout = process.stdout,
	stderr = process.stderr,
} = {}) {
	if (!enforce) {
		stdout.write(
			"[external-readonly-gate] SKIPPED (explicit): external-site-readonly is report-only by default in ci:gate. Use `npm run ci:gate -- --enforce-external-readonly` to enforce.\n",
		);
		return 0;
	}

	stdout.write(
		"[external-readonly-gate] enforcing external-site-readonly via `npm run test:e2e:external`.\n",
	);
	const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
	const result = run(npmExecutable, ["run", "test:e2e:external"], {
		cwd,
		env,
		stdio: "inherit",
	});

	if (result.error) {
		stderr.write(
			`[external-readonly-gate] failed to execute npm run test:e2e:external: ${result.error.message}\n`,
		);
		return 1;
	}

	return result.status ?? 1;
}

function isDirectExecution() {
	if (!process.argv[1]) {
		return false;
	}
	return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
	try {
		const { enforce } = parseExternalReadonlyGateArgs(process.argv.slice(2));
		const exitCode = runExternalReadonlyGate({ enforce });
		process.exitCode = exitCode;
	} catch (error) {
		process.stderr.write(
			`external-readonly-gate runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 2;
	}
}

export { parseExternalReadonlyGateArgs, runExternalReadonlyGate };
