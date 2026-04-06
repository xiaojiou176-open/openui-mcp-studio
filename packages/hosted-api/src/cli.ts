#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
	HOSTED_API_VERSION,
	parseHostedApiBaseConfig,
	parseHostedApiConfig,
	startHostedApiServer,
} from "./server.js";

async function readHostedOpenapi(workspaceRoot: string) {
	const contractPath = path.join(
		workspaceRoot,
		"docs/contracts/openui-hosted-api.openapi.json",
	);
	const raw = await fs.readFile(contractPath, "utf8");
	return {
		contractPath,
		document: JSON.parse(raw) as Record<string, unknown>,
	};
}

function readFlagValue(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	if (index === -1) {
		return undefined;
	}
	return args[index + 1];
}

async function main(argv = process.argv.slice(2)): Promise<void> {
	const command = argv[0] ?? "info";
	const env = {
		...process.env,
		OPENUI_HOSTED_API_HOST:
			readFlagValue(argv, "--host") ?? process.env.OPENUI_HOSTED_API_HOST,
		OPENUI_HOSTED_API_PORT:
			readFlagValue(argv, "--port") ?? process.env.OPENUI_HOSTED_API_PORT,
		OPENUI_HOSTED_API_BEARER_TOKEN:
			readFlagValue(argv, "--token") ??
			process.env.OPENUI_HOSTED_API_BEARER_TOKEN,
		OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE:
			readFlagValue(argv, "--rate-limit-rpm") ??
			process.env.OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE,
	};
	const baseConfig = parseHostedApiBaseConfig(env);

	if (command === "info") {
		process.stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					service: "openui-hosted-api",
					version: HOSTED_API_VERSION,
					host: baseConfig.host,
					port: baseConfig.port,
					authEnv: "OPENUI_HOSTED_API_BEARER_TOKEN",
					rateLimitRpm: baseConfig.rateLimitMax,
					runtimeScope: "self-hosted-http",
					note: "Self-hosted runtime surfaced through the root repo CLI. Managed deployment remains operator-owned.",
				},
				null,
				2,
			)}\n`,
		);
		return;
	}

	if (command === "openapi") {
		const { document } = await readHostedOpenapi(baseConfig.workspaceRoot);
		process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
		return;
	}

	if (command === "serve") {
		const config = parseHostedApiConfig(env);
		const handle = await startHostedApiServer(config);
		process.stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					service: "openui-hosted-api",
					url: handle.url,
					port: handle.port,
					auth: "bearer",
					rateLimitRpm: config.rateLimitMax,
				},
				null,
				2,
			)}\n`,
		);
		return;
	}

	throw new Error(
		`Unknown hosted-api command: ${command}. Use info, openapi, or serve.`,
	);
}

void main().catch((error) => {
	process.stderr.write(
		`[openui-mcp-studio-hosted-api] ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
});
