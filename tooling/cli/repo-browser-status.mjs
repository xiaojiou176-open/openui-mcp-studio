#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import { inspectChromeCdpLane } from "../shared/local-chrome-profile.mjs";

async function runRepoBrowserStatusCli(options = {}) {
	const result = await inspectChromeCdpLane({
		env: options.env ?? process.env,
		cwd: options.cwd ?? process.cwd(),
	});
	const stdout = options.stdout ?? process.stdout;
	stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runRepoBrowserStatusCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { runRepoBrowserStatusCli };
