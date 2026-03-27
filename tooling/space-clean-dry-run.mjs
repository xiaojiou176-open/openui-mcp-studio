#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseCliArgs, runSpaceClean } from "./space-clean.mjs";

async function runSpaceCleanDryRun(options = {}) {
	const parsed =
		options.parsedArgs ??
		parseCliArgs(
			options.argv ??
				[
					...(options.targetSet ? [`--target-set=${options.targetSet}`] : []),
					...(Array.isArray(options.targets)
						? options.targets.map((target) => `--target=${target}`)
						: []),
				],
		);
	try {
		return await runSpaceClean({
			...options,
			parsedArgs: {
				...parsed,
				apply: false,
			},
		});
	} catch (error) {
		return {
			ok: false,
			mode: "dry-run",
			targetSet: parsed.targetSet ?? "low-risk",
			candidates: [],
			reclaimableBytes: 0,
			reclaimableHuman: "0 B",
			errors: [error instanceof Error ? error.message : String(error)],
		};
	}
}

async function runSpaceCleanDryRunCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const parsed = options.parsedArgs ?? parseCliArgs(options.argv);
		const result = await runSpaceCleanDryRun(parsed);
		if (!result.ok) {
			stderr.write(`[space-clean-dry-run] FAILED\n`);
			for (const error of result.errors) {
				stderr.write(`- ${error}\n`);
			}
			return 1;
		}
		stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	} catch (error) {
		stderr.write(
			`[space-clean-dry-run] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runSpaceCleanDryRunCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { runSpaceCleanDryRun, runSpaceCleanDryRunCli };
