#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import process from "node:process";

const VERIFY_FAST_STEPS = [
	["npm", "run", "-s", "governance:identity-alignment:check"],
	["npm", "run", "-s", "governance:language-boundary:check"],
	["npm", "run", "-s", "governance:tracked-surface:check"],
	["npm", "run", "-s", "governance:open-source-surface:check"],
	["npm", "run", "-s", "governance:remote-evidence:check"],
	["npm", "run", "-s", "governance:ssot:check"],
	["npm", "run", "-s", "governance:module-readme:check"],
	["npm", "run", "-s", "governance:topology:check"],
	["npm", "run", "-s", "governance:root:check"],
	["npm", "run", "-s", "governance:root-pristine:check"],
	["npm", "run", "-s", "governance:runtime:check"],
	["npm", "run", "-s", "governance:runtime-layout:check"],
	["npm", "run", "-s", "governance:cache-lifecycle:check"],
	["npm", "run", "-s", "governance:space:check"],
	["npm", "run", "-s", "governance:deps:check"],
	["npm", "run", "-s", "governance:history-hygiene:check"],
	["npm", "run", "-s", "governance:log-schema:check"],
	["npm", "run", "-s", "governance:evidence:check"],
	["npm", "run", "-s", "governance:run-correlation:check"],
];

function defaultRunner(cmd, args, options) {
	return spawnSync(cmd, args, options);
}

async function runRepoVerifyFastCli({
	steps = VERIFY_FAST_STEPS,
	runner = defaultRunner,
	cwd = process.cwd(),
	env = process.env,
	stdio = "inherit",
} = {}) {
	for (const [cmd, ...args] of steps) {
		const result = runner(cmd, args, {
			stdio,
			cwd,
			env,
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
	runRepoVerifyFastCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { VERIFY_FAST_STEPS, runRepoVerifyFastCli };
