#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildSpaceGovernanceContext, isCanonicalRuntimePath } from "./shared/space-governance.mjs";
import { readJsonFile, toPosixPath } from "./shared/governance-utils.mjs";
import { collectToolCacheEnvStatus } from "./shared/tool-cache-env.mjs";

const ALLOWED_DIRECT_GO_TOOL_SURFACES = new Set([
	"tooling/run-go-tool.mjs",
]);

function resolveWorkspaceRelative(candidatePath, rootDir) {
	return path.isAbsolute(candidatePath)
		? candidatePath
		: path.resolve(rootDir, candidatePath);
}

async function walkFiles(rootDir, relativeDir) {
	const targetDir = path.join(rootDir, relativeDir);
	let entries;
	try {
		entries = await fs.readdir(targetDir, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}

	const files = [];
	for (const entry of entries) {
		const nextRelative = path.posix.join(relativeDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(rootDir, nextRelative)));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		files.push(nextRelative);
	}
	return files;
}

function detectDirectGoToolUsage(sourceText) {
	const patterns = [
		/spawn(?:Sync)?\(\s*["'`](go|gofmt|gofumpt|golangci-lint)(?:\.cmd)?["'`]/u,
		/\[\s*["'`](go|gofmt|gofumpt|golangci-lint)(?:\.cmd)?["'`]\s*,/u,
		/command\s*:\s*["'`](go|gofmt|gofumpt|golangci-lint)(?:\.cmd)?["'`]/u,
		/^\s*(?:exec\s+)?(go|gofmt|gofumpt|golangci-lint)\b/mu,
	];
	return patterns.some((pattern) => pattern.test(sourceText));
}

async function collectDirectGoToolViolations(rootDir) {
	const violations = [];
	const packageJson = await readJsonFile(path.join(rootDir, "package.json"));
	for (const [name, commandText] of Object.entries(packageJson.scripts ?? {})) {
		if (detectDirectGoToolUsage(String(commandText ?? ""))) {
			violations.push(`package.json:scripts.${name}`);
		}
	}

	const shellFiles = await walkFiles(rootDir, ".githooks");
	for (const relativePath of shellFiles) {
		const sourceText = await fs.readFile(path.join(rootDir, relativePath), "utf8");
		if (detectDirectGoToolUsage(sourceText)) {
			violations.push(toPosixPath(relativePath));
		}
	}

	const toolingFiles = await walkFiles(rootDir, "tooling");
	for (const relativePath of toolingFiles) {
		const normalized = toPosixPath(relativePath);
		if (ALLOWED_DIRECT_GO_TOOL_SURFACES.has(normalized)) {
			continue;
		}
		const sourceText = await fs.readFile(path.join(rootDir, relativePath), "utf8");
		if (detectDirectGoToolUsage(sourceText)) {
			violations.push(normalized);
		}
	}

	return violations;
}

async function runSpacePathSourcesCheck(options = {}) {
	const context = await buildSpaceGovernanceContext(options);
	const errors = [];
	const { status } = await collectToolCacheEnvStatus({
		rootDir: context.rootDir,
		env: options.env ?? process.env,
		createDirectories: false,
	});

	for (const entry of status) {
		if (!entry.outsideWorkspace) {
			errors.push(
				entry.error ??
					`${entry.key} must resolve outside workspace: ${entry.resolvedPath}`,
			);
		}
	}

	const rawRuntimeCacheDir = String(
		(options.env ?? process.env).OPENUI_MCP_CACHE_DIR ?? ".runtime-cache/cache",
	).trim();
	const resolvedRuntimeCacheDir = resolveWorkspaceRelative(
		rawRuntimeCacheDir,
		context.rootDir,
	);
	const relativeRuntimeCacheDir = path.relative(context.rootDir, resolvedRuntimeCacheDir);
	const normalizedRuntimeCacheDir = relativeRuntimeCacheDir.split(path.sep).join("/");
	if (!isCanonicalRuntimePath(normalizedRuntimeCacheDir, context.registry)) {
		errors.push(
			`OPENUI_MCP_CACHE_DIR must resolve to a canonical runtime path, received: ${normalizedRuntimeCacheDir}`,
		);
	}

	const directGoViolations = await collectDirectGoToolViolations(context.rootDir);
	for (const violation of directGoViolations) {
		errors.push(
			`direct Go tool invocation detected; route through tooling/run-go-tool.mjs instead: ${violation}`,
		);
	}

	return {
		ok: errors.length === 0,
		rootDir: context.rootDir,
		status,
		runtimeCacheDir: normalizedRuntimeCacheDir,
		directGoViolations,
		errors,
	};
}

async function main() {
	try {
		const result = await runSpacePathSourcesCheck();
		if (!result.ok) {
			console.error("[space-path-sources] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[space-path-sources] OK");
	} catch (error) {
		console.error(
			`[space-path-sources] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runSpacePathSourcesCheck };
