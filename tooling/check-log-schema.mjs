import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";

const DEFAULT_POLICY_PATH = "contracts/observability/log-event.schema.json";
const DEFAULT_LOGGER_PATH = "services/mcp-server/src/logger.ts";
const DEFAULT_LOG_DIR = ".runtime-cache/runs";

async function collectJsonlFiles(logDir, files = []) {
	let entries;
	try {
		entries = await fs.readdir(logDir, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		const absolutePath = path.join(logDir, entry.name);
		if (entry.isDirectory()) {
			await collectJsonlFiles(absolutePath, files);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".jsonl")) {
			files.push(absolutePath);
		}
	}
	return files;
}

async function runLogSchemaCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const policyPath = path.resolve(rootDir, options.policyPath ?? DEFAULT_POLICY_PATH);
	const loggerPath = path.resolve(rootDir, options.loggerPath ?? DEFAULT_LOGGER_PATH);
	const logDir = path.resolve(
		rootDir,
		options.logDir ?? process.env.OPENUI_MCP_LOG_DIR?.trim() ?? DEFAULT_LOG_DIR,
	);

	const policy = await readJsonFile(policyPath);
	const loggerSource = await fs.readFile(loggerPath, "utf8");
	const requiredFields = policy?.requiredCommonFields ?? [];
	const errors = [];

	if (!loggerSource.includes("redactSensitiveMeta")) {
		errors.push(
			"services/mcp-server/src/logger.ts must route metadata through redactSensitiveMeta",
		);
	}
	for (const field of requiredFields.filter((value) =>
		["ts", "level", "event", "runId", "traceId", "requestId", "service", "component", "stage", "context"].includes(String(value)),
	)) {
		if (!loggerSource.includes(`${field},`) && !loggerSource.includes(`${field}:`)) {
			errors.push(
				`services/mcp-server/src/logger.ts does not obviously emit required field "${field}"`,
			);
		}
	}

	const logFiles = await collectJsonlFiles(logDir);
	for (const logFile of logFiles) {
		const raw = await fs.readFile(logFile, "utf8");
		for (const [index, line] of raw.split(/\r?\n/u).entries()) {
			if (!line.trim()) {
				continue;
			}
			let payload;
			try {
				payload = JSON.parse(line);
			} catch (error) {
				errors.push(
					`${path.relative(rootDir, logFile)}:${index + 1} contains invalid JSONL (${error instanceof Error ? error.message : String(error)})`,
				);
				continue;
			}
			for (const field of requiredFields) {
				if (!(field in payload)) {
					errors.push(
						`${path.relative(rootDir, logFile)}:${index + 1} is missing required log field "${field}"`,
					);
				}
			}
		}
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		policyPath: toPosixPath(path.relative(rootDir, policyPath)),
		logDir: toPosixPath(path.relative(rootDir, logDir)),
		errors,
	};
}

async function main() {
	try {
		const result = await runLogSchemaCheck();
		if (!result.ok) {
			globalThis.console.error("[log-schema] FAILED");
			for (const error of result.errors) {
				globalThis.console.error(`- ${error}`);
			}
			process.exit(1);
		}
		globalThis.console.log(`[log-schema] OK (${result.policyPath})`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[log-schema] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runLogSchemaCheck };
