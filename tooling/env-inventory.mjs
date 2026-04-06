#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseEnvContractKeys } from "./env-contract/parse.mjs";

const RUNTIME_ENV_KEY_PATTERN =
	/^(?:(?:OPENUI|GEMINI|LIVE_TEST)_[A-Z0-9_]+|NEXT_PUBLIC_SITE_URL)$/u;
const DEFAULT_REGISTRY_PATH = path.join(
	"tooling",
	"env-contract",
	"deprecation-registry.json",
);

function toSortedUnique(values) {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

function collectRuntimeEnvKeys(env) {
	const keys = [];

	for (const key of Object.keys(env)) {
		if (RUNTIME_ENV_KEY_PATTERN.test(key)) {
			keys.push(key);
		}
	}

	return toSortedUnique(keys);
}

async function readContractKeys(rootDir) {
	const envContractPath = path.join(
		rootDir,
		"packages",
		"contracts",
		"src",
		"env-contract.ts",
	);
	const raw = await readFile(envContractPath, "utf8");
	return toSortedUnique(parseEnvContractKeys(raw));
}

async function readNonContractRegistryKeys(rootDir) {
	const registryPath = path.join(rootDir, DEFAULT_REGISTRY_PATH);
	const raw = await readFile(registryPath, "utf8");
	const parsed = JSON.parse(raw);
	const collectKeys = (entries) =>
		toSortedUnique(
			(Array.isArray(entries) ? entries : [])
				.map((entry) => String(entry?.key ?? "").trim())
				.filter((key) => key.length > 0),
		);

	return {
		nonContractKeys: collectKeys(parsed.nonContractKeys),
		ciOnlyKeys: collectKeys(parsed.ciOnlyKeys),
		testOnlyKeys: collectKeys(parsed.testOnlyKeys),
	};
}

async function main() {
	const rootDir = process.cwd();
	const [contractVars, registryKeys] = await Promise.all([
		readContractKeys(rootDir),
		readNonContractRegistryKeys(rootDir),
	]);
	const runtimeVars = collectRuntimeEnvKeys(process.env);
	const contractSet = new Set(contractVars);
	const discoveredNonContractVars = runtimeVars.filter(
		(key) => !contractSet.has(key),
	);
	const nonContractVars = toSortedUnique([
		...discoveredNonContractVars,
		...registryKeys.nonContractKeys,
	]);

	const payload = {
		generatedAt: new Date().toISOString(),
		contractVars,
		runtimeVars,
		nonContractVars,
		ciOnlyVars: registryKeys.ciOnlyKeys,
		testOnlyVars: registryKeys.testOnlyKeys,
	};

	console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
	console.error(
		JSON.stringify(
			{
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			},
			null,
			2,
		),
	);
	process.exit(1);
});
