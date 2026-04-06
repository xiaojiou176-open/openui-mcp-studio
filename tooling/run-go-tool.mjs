#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { buildSafeToolCacheEnv } from "./shared/tool-cache-env.mjs";

const ALLOWED_TOOLS = new Set(["gofmt", "gofumpt", "golangci-lint"]);

function parseArgs(argv = process.argv.slice(2)) {
	const [tool, ...rest] = argv;
	if (!tool || !ALLOWED_TOOLS.has(tool)) {
		throw new Error(
			`Unknown or unsupported Go tool: ${JSON.stringify(tool)}. Allowed: ${Array.from(ALLOWED_TOOLS).join(", ")}`,
		);
	}
	const separatorIndex = rest.indexOf("--");
	return {
		tool,
		args: separatorIndex === -1 ? rest : rest.slice(separatorIndex + 1),
	};
}

async function runGoToolCli(options = {}) {
	const { tool, args } = options.parsedArgs ?? parseArgs(options.argv);
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const env = await buildSafeToolCacheEnv({
		rootDir,
		env: options.env ?? process.env,
	});
	const executable = tool;
	const available = spawnSync(executable, ["--version"], {
		encoding: "utf8",
		stdio: ["ignore", "ignore", "ignore"],
		env,
	});
	if ((available.status ?? 1) !== 0) {
		const reason = available.error?.message?.trim()
			? available.error.message.trim()
			: `${tool} is not available in PATH`;
		process.stderr.write(`[run-go-tool] ${reason}\n`);
		return available.status ?? 1;
	}
	const result = spawnSync(executable, args, {
		cwd: rootDir,
		env,
		stdio: "inherit",
	});
	return result.status ?? 1;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runGoToolCli({ argv: process.argv.slice(2) }).then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { ALLOWED_TOOLS, parseArgs, runGoToolCli };
