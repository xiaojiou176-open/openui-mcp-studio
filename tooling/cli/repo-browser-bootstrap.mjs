#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
	bootstrapChromeProfileLane,
	DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME,
} from "../shared/local-chrome-profile.mjs";

function parseCliArgs(argv = process.argv.slice(2)) {
	const options = {
		force: false,
		json: false,
	};
	for (const arg of argv) {
		if (arg === "--force") {
			options.force = true;
			continue;
		}
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg.startsWith("--source-root=")) {
			options.sourceRoot = arg.slice("--source-root=".length).trim();
			continue;
		}
		if (arg.startsWith("--target-root=")) {
			options.targetRoot = arg.slice("--target-root=".length).trim();
			continue;
		}
		if (arg.startsWith("--display-name=")) {
			options.displayName = arg.slice("--display-name=".length).trim();
			continue;
		}
		if (arg.startsWith("--target-profile-directory=")) {
			options.targetProfileDirectory = arg
				.slice("--target-profile-directory=".length)
				.trim();
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

async function runRepoBrowserBootstrapCli(options = {}) {
	const parsed = options.parsedArgs ?? parseCliArgs(options.argv);
	const result = await bootstrapChromeProfileLane({
		rootDir: options.cwd ?? process.cwd(),
		sourceRoot: parsed.sourceRoot,
		targetRoot: parsed.targetRoot,
		displayName:
			parsed.displayName || DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME,
		targetProfileDirectory: parsed.targetProfileDirectory,
		force: parsed.force,
	});
	const stdout = options.stdout ?? process.stdout;
	if (parsed.json) {
		stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		return 0;
	}
	stdout.write(
		[
			"Repo browser bootstrap complete",
			`- source root: ${result.sourceRoot}`,
			`- source profile: ${result.sourceProfileDirectory}`,
			`- target root: ${result.targetRoot}`,
			`- target profile: ${result.targetProfileDirectory}`,
			`- receipt: ${result.receiptJsonPath}`,
			"",
		].join("\n"),
	);
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runRepoBrowserBootstrapCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { parseCliArgs, runRepoBrowserBootstrapCli };
