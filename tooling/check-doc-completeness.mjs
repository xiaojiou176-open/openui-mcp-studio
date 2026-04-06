import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTRACT_PATH = path.resolve(
	process.cwd(),
	"tooling/contracts/docs-completeness.contract.json",
);

function toPosixPath(value) {
	return value.split(path.sep).join("/");
}

async function collectFiles(rootDir) {
	const output = [];
	const stack = [rootDir];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(fullPath);
				continue;
			}
			output.push(fullPath);
		}
	}

	return output;
}

async function discoverRegisteredTools(rootDir) {
	const toolsDir = path.join(
		rootDir,
		"services",
		"mcp-server",
		"src",
		"tools",
	);
	const files = await collectFiles(toolsDir);
	const toolNamePattern = /registerTool\(\s*"([a-z0-9_]+)"/g;
	const toolNames = new Set();

	for (const filePath of files) {
		if (!filePath.endsWith(".ts")) {
			continue;
		}

		const raw = await fs.readFile(filePath, "utf8");
		let match = toolNamePattern.exec(raw);
		while (match) {
			toolNames.add(match[1]);
			match = toolNamePattern.exec(raw);
		}
	}

	return Array.from(toolNames).sort((left, right) => left.localeCompare(right));
}

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function isSafeRelativePath(filePath) {
	if (!filePath || path.isAbsolute(filePath)) {
		return false;
	}
	return !filePath.split(/[\\/]/u).includes("..");
}

function validateToolContractEntry(toolName, entry, errors) {
	if (!entry || typeof entry !== "object") {
		errors.push(`Tool ${toolName} is missing contract object.`);
		return;
	}

	const minimumRequest = readString(entry.minimumRequest);
	const success = readString(entry.success);
	const failure = readString(entry.failure);

	if (!minimumRequest) {
		errors.push(`Tool ${toolName} is missing minimumRequest.`);
	}
	if (!success) {
		errors.push(`Tool ${toolName} is missing success.`);
	}
	if (!failure) {
		errors.push(`Tool ${toolName} is missing failure.`);
	}
}

function validateScenarioMatrix(contract, allToolNames, errors) {
	const matrix = contract.scenarioMatrix;
	if (!matrix || typeof matrix !== "object") {
		errors.push("scenarioMatrix is missing.");
		return;
	}

	const layers = ["default", "advanced"];
	for (const layer of layers) {
		const scenarios = matrix[layer];
		if (!Array.isArray(scenarios) || scenarios.length === 0) {
			errors.push(`scenarioMatrix.${layer} must be a non-empty array.`);
			continue;
		}

		for (const [index, scenario] of scenarios.entries()) {
			const title = `scenarioMatrix.${layer}[${index}]`;
			if (!scenario || typeof scenario !== "object") {
				errors.push(`${title} must be an object.`);
				continue;
			}

			if (!readString(scenario.name)) {
				errors.push(`${title}.name is required.`);
			}
			if (!readString(scenario.expected)) {
				errors.push(`${title}.expected is required.`);
			}

			if (!Array.isArray(scenario.tools) || scenario.tools.length === 0) {
				errors.push(`${title}.tools must be a non-empty array.`);
				continue;
			}

			for (const toolName of scenario.tools) {
				if (typeof toolName !== "string" || !allToolNames.has(toolName)) {
					errors.push(
						`${title}.tools contains unknown tool: ${String(toolName)}`,
					);
				}
			}
		}
	}
}

async function validateGeneratedSurfaces(contract, rootDir, errors) {
	const surfaces = Array.isArray(contract.generatedSurfaces)
		? contract.generatedSurfaces
		: [];
	for (const surfacePathRaw of surfaces) {
		const surfacePath = readString(surfacePathRaw);
		if (!surfacePath) {
			errors.push("generatedSurfaces contains empty path.");
			continue;
		}
		if (!isSafeRelativePath(surfacePath)) {
			errors.push(`generatedSurfaces contains unsafe path: ${surfacePath}`);
			continue;
		}
		const absolutePath = path.resolve(rootDir, surfacePath);
		try {
			const stat = await fs.stat(absolutePath);
			if (!stat.isFile()) {
				errors.push(`generated surface is not a file: ${surfacePath}`);
			}
		} catch {
			errors.push(`generated surface is missing: ${surfacePath}`);
		}
	}
}

async function runDocsCompletenessCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const toolNames = await discoverRegisteredTools(rootDir);
	const toolSet = new Set(toolNames);

	const raw = await fs.readFile(contractPath, "utf8");
	const contract = JSON.parse(raw);

	const errors = [];

	const toolsSection = contract.tools;
	if (!toolsSection || typeof toolsSection !== "object") {
		errors.push("tools section is missing.");
	} else {
		for (const toolName of toolNames) {
			validateToolContractEntry(toolName, toolsSection[toolName], errors);
		}

		for (const toolName of Object.keys(toolsSection)) {
			if (!toolSet.has(toolName)) {
				errors.push(`Contract contains unknown tool: ${toolName}`);
			}
		}
	}

	validateScenarioMatrix(contract, toolSet, errors);
	await validateGeneratedSurfaces(contract, rootDir, errors);

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(contractPath),
		discoveredTools: toolNames,
		errors,
	};
}

async function main() {
	try {
		const result = await runDocsCompletenessCheck();

		if (!result.ok) {
			globalThis.console.error("[docs-completeness] FAILED");
			for (const issue of result.errors) {
				globalThis.console.error(`- ${issue}`);
			}
			process.exit(1);
		}

		globalThis.console.log(
			`[docs-completeness] OK (${result.discoveredTools.length} tools validated)`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[docs-completeness] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { discoverRegisteredTools, runDocsCompletenessCheck };
