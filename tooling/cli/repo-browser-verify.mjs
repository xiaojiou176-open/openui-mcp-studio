#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import { verifyChromeCdpLane } from "../shared/local-chrome-profile.mjs";

function parseCliArgs(argv = process.argv.slice(2)) {
	const options = {};
	for (const arg of argv) {
		if (arg.startsWith("--url=")) {
			options.url = arg.slice("--url=".length).trim();
			continue;
		}
		if (arg.startsWith("--logged-in-selector=")) {
			options.loggedInSelector = arg.slice("--logged-in-selector=".length).trim();
			continue;
		}
		if (arg.startsWith("--logged-out-selector=")) {
			options.loggedOutSelector = arg
				.slice("--logged-out-selector=".length)
				.trim();
			continue;
		}
		if (arg.startsWith("--run-id=")) {
			options.runId = arg.slice("--run-id=".length).trim();
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

async function runRepoBrowserVerifyCli(options = {}) {
	const parsed = options.parsedArgs ?? parseCliArgs(options.argv);
	const verify = options.verify ?? verifyChromeCdpLane;
	const env = {
		...(options.env ?? process.env),
		OPENUI_CHROME_ALLOW_DETACHED_LAUNCH: "1",
	};
	const result = await verify({
		rootDir: options.cwd ?? process.cwd(),
		env,
		url: parsed.url,
		loggedInSelector: parsed.loggedInSelector,
		loggedOutSelector: parsed.loggedOutSelector,
		runId: parsed.runId,
	});
	const stdout = options.stdout ?? process.stdout;
	stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	return result.ok ? 0 : 1;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runRepoBrowserVerifyCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { parseCliArgs, runRepoBrowserVerifyCli };
