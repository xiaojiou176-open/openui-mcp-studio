#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPO_VERIFY_LIVE_STEPS = [
	["npm", "run", "-s", "repo:upstream:check"],
	["npm", "run", "-s", "repo:browser:verify"],
	["npm", "run", "test:live"],
];

async function runRepoVerifyLiveCli(options = {}) {
	const steps = options.steps ?? REPO_VERIFY_LIVE_STEPS;
	const runner = options.runner ?? spawnSync;
	for (const [cmd, ...args] of steps) {
		const result = runner(cmd, args, {
			stdio: options.stdio ?? "inherit",
			cwd: options.cwd ?? process.cwd(),
			env: options.env ?? process.env,
		});
		if ((result.status ?? 1) !== 0) {
			return result.status ?? 1;
		}
	}
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runRepoVerifyLiveCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { REPO_VERIFY_LIVE_STEPS, runRepoVerifyLiveCli };
