#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_INVENTORY_SCRIPT = path.join("tooling", "env-inventory.mjs");
const DEFAULT_REGISTRY_PATH = path.join(
	"tooling",
	"env-contract",
	"deprecation-registry.json",
);
const DEFAULT_OUTPUT_DIR = path.join(".runtime-cache", "env-governance");

function toSortedUnique(values) {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function parseCliArgs(argv) {
	const options = {};
	for (const arg of argv) {
		if (!arg.startsWith("--")) {
			throw new Error(`Unknown argument: ${arg}`);
		}

		const [flag, value = ""] = arg.slice(2).split("=");
		if (!value) {
			throw new Error(`Missing value for --${flag}`);
		}

		if (flag === "root") {
			options.rootDir = value;
			continue;
		}
		if (flag === "output-dir") {
			options.outputDir = value;
			continue;
		}
		if (flag === "inventory-script") {
			options.inventoryScript = value;
			continue;
		}
		if (flag === "registry-path") {
			options.registryPath = value;
			continue;
		}

		throw new Error(`Unknown argument: --${flag}`);
	}
	return options;
}

async function readEnvInventory(rootDir, inventoryScript) {
	const inventoryPath = path.resolve(rootDir, inventoryScript);
	const { stdout } = await execFileAsync(process.execPath, [inventoryPath], {
		cwd: rootDir,
		env: process.env,
		maxBuffer: 10 * 1024 * 1024,
	});
	return JSON.parse(stdout);
}

async function readDeprecationRegistry(rootDir, registryPath) {
	const fullPath = path.resolve(rootDir, registryPath);
	const raw = await fs.readFile(fullPath, "utf8");
	return JSON.parse(raw);
}

function buildReport({ inventory, registry, now }) {
	const runtimeNonContract = toSortedUnique(
		Array.isArray(inventory.nonContractVars) ? inventory.nonContractVars : [],
	);
	const runtimeVars = toSortedUnique(
		Array.isArray(inventory.runtimeVars) ? inventory.runtimeVars : [],
	);
	const contractVars = toSortedUnique(
		Array.isArray(inventory.contractVars) ? inventory.contractVars : [],
	);

	const nonContractRegistryEntries = Array.isArray(registry.nonContractKeys)
		? registry.nonContractKeys
		: [];

	const registeredNonContractSet = new Set(
		toSortedUnique(
			nonContractRegistryEntries
				.map((entry) => String(entry?.key ?? "").trim())
				.filter(Boolean),
		),
	);

	const unregisteredNonContractRuntime = runtimeNonContract.filter(
		(key) => !registeredNonContractSet.has(key),
	);
	const registryNonContractUnused = Array.from(registeredNonContractSet).filter(
		(key) => !runtimeNonContract.includes(key),
	);
	return {
		generatedAt: now.toISOString(),
		inputs: {
			inventoryGeneratedAt: String(inventory.generatedAt ?? ""),
		},
		counts: {
			contractVars: contractVars.length,
			runtimeVars: runtimeVars.length,
			runtimeNonContractVars: runtimeNonContract.length,
			registryNonContractVars: registeredNonContractSet.size,
			unregisteredNonContractRuntime: unregisteredNonContractRuntime.length,
		},
		sections: {
			unregisteredNonContractRuntime,
			registryNonContractUnused: toSortedUnique(registryNonContractUnused),
		},
	};
}

function formatMarkdownReport(report) {
	const lines = [
		"# Env Governance Report",
		"",
		`- Generated at: ${report.generatedAt}`,
		`- Inventory generated at: ${report.inputs.inventoryGeneratedAt || "unknown"}`,
		"",
		"## Summary",
		"",
		`- Contract vars: ${report.counts.contractVars}`,
		`- Runtime vars: ${report.counts.runtimeVars}`,
		`- Runtime non-contract vars: ${report.counts.runtimeNonContractVars}`,
		`- Registry non-contract vars: ${report.counts.registryNonContractVars}`,
		`- Unregistered runtime non-contract vars: ${report.counts.unregisteredNonContractRuntime}`,
		"",
		"## Unregistered Runtime Non-Contract Vars",
		"",
		...(report.sections.unregisteredNonContractRuntime.length > 0
			? report.sections.unregisteredNonContractRuntime.map((key) => `- ${key}`)
			: ["- none"]),
	];

	return lines.join("\n");
}

async function generateEnvGovernanceReport(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const inventoryScript = options.inventoryScript ?? DEFAULT_INVENTORY_SCRIPT;
	const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH;
	const outputDir = path.resolve(
		rootDir,
		options.outputDir ?? DEFAULT_OUTPUT_DIR,
	);
	const now = options.now instanceof Date ? options.now : new Date();

	const [inventory, registry] = await Promise.all([
		readEnvInventory(rootDir, inventoryScript),
		readDeprecationRegistry(rootDir, registryPath),
	]);
	const report = buildReport({ inventory, registry, now });
	const markdown = formatMarkdownReport(report);

	await fs.mkdir(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, "report.json");
	const markdownPath = path.join(outputDir, "report.md");

	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, markdown, "utf8"),
	]);

	return { report, outputDir, jsonPath, markdownPath };
}

async function runEnvGovernanceReportCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	try {
		const parsed =
			options.parsedArgs ?? parseCliArgs(options.argv ?? process.argv.slice(2));
		const result = await generateEnvGovernanceReport({
			...parsed,
			...options.generateOptions,
		});
		stdout.write(
			`ENV governance report generated: ${path.relative(process.cwd(), result.jsonPath)} and ${path.relative(process.cwd(), result.markdownPath)}\n`,
		);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`ENV governance report failed: ${message}\n`);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runEnvGovernanceReportCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	buildReport,
	formatMarkdownReport,
	generateEnvGovernanceReport,
	runEnvGovernanceReportCli,
};
