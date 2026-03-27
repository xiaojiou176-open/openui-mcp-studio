import process from "node:process";
import { verifyEnvContract } from "./check.mjs";

function formatUsage() {
	return [
		"Usage: node tooling/verify-env-contract.mjs [options]",
		"",
		"Options:",
		"  --allow-readme-drift  Treat README drift as warning-only (non-blocking).",
		"  --fail-on-readme-drift Treat README drift as blocking failure (default).",
		"  -h, --help            Show this help message.",
	].join("\n");
}

function parseCliArgs(argv) {
	let failOnReadmeDrift;

	for (const arg of argv) {
		if (arg === "--allow-readme-drift" || arg === "--warn-readme-drift") {
			failOnReadmeDrift = false;
			continue;
		}

		if (arg === "--fail-on-readme-drift") {
			failOnReadmeDrift = true;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			return { showHelp: true };
		}

		return { error: `Unknown argument: ${arg}` };
	}

	return { failOnReadmeDrift };
}

async function runVerifyEnvContractCli(options = {}) {
	const {
		argv = process.argv.slice(2),
		verifyOptions = {},
		stdout = process.stdout,
		stderr = process.stderr,
	} = options;

	const parsedArgs = parseCliArgs(argv);
	if (parsedArgs.error) {
		stderr.write(`${parsedArgs.error}\n${formatUsage()}\n`);
		return 1;
	}

	if (parsedArgs.showHelp) {
		stdout.write(`${formatUsage()}\n`);
		return 0;
	}

	const mergedVerifyOptions = { ...verifyOptions };
	if (
		mergedVerifyOptions.failOnReadmeDrift === undefined &&
		mergedVerifyOptions.failOnReadmeMismatch === undefined &&
		parsedArgs.failOnReadmeDrift !== undefined
	) {
		mergedVerifyOptions.failOnReadmeDrift = parsedArgs.failOnReadmeDrift;
	}

	try {
		const result = await verifyEnvContract(mergedVerifyOptions);

		if (!result.ok) {
			stderr.write("ENV contract check failed.\n");
			for (const issue of result.blockingIssues) {
				stderr.write(`${issue}\n`);
			}
			if (result.failOnReadmeDrift && result.readmeIssues.length > 0) {
				stderr.write(
					"Migration hint: run with --allow-readme-drift for temporary warning-only mode while syncing README.\n",
				);
			}
			return 1;
		}

		if (!result.failOnReadmeDrift && result.readmeIssues.length > 0) {
			stdout.write(
				"ENV contract check passed with README warnings (non-blocking mode).\n",
			);
			for (const issue of result.readmeIssues) {
				stdout.write(`${issue}\n`);
			}
			return 0;
		}

		stdout.write(
			`ENV contract check passed (${result.contractKeys.length} keys).\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(
			`ENV contract check failed with unexpected error: ${
				error instanceof Error ? error.message : String(error)
			}\n`,
		);
		return 1;
	}
}

export { runVerifyEnvContractCli };
