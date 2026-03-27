import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { verifyEnvContract } from "./env-contract/check.mjs";
import { runVerifyEnvContractCli } from "./env-contract/cli.mjs";
import {
	parseEnvContractKeys,
	parseEnvExampleKeys,
	parseReadmeEnvKeys,
} from "./env-contract/parse.mjs";

const ENV_KEY_PATTERN = /^(?:OPENUI|GEMINI)_[A-Z0-9_]+$/u;
function parseDotEnv(raw) {
	const envMap = new Map();
	for (const rawLine of raw.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}
		const idx = line.indexOf("=");
		const key = (idx >= 0 ? line.slice(0, idx) : line).trim();
		const value = idx >= 0 ? line.slice(idx + 1) : "";
		if (!ENV_KEY_PATTERN.test(key)) {
			continue;
		}
		envMap.set(key, value);
	}
	return envMap;
}

function formatMissingOrExtraIssues(label, expectedKeys, actualKeys) {
	const expected = new Set(expectedKeys);
	const actual = new Set(actualKeys);
	const missing = [...expected].filter((key) => !actual.has(key)).sort();
	const extra = [...actual].filter((key) => !expected.has(key)).sort();
	const issues = [];

	if (missing.length > 0) {
		issues.push(`- Missing keys in ${label}: ${missing.join(", ")}`);
	}

	if (extra.length > 0) {
		issues.push(`- Unexpected keys in ${label}: ${extra.join(", ")}`);
	}

	return issues;
}

async function verifyLocalEnvConsistency(rootDir, contractKeys) {
	const envPath = path.join(rootDir, ".env");
	try {
		const raw = await fs.readFile(envPath, "utf8");
		const envMap = parseDotEnv(raw);
		const envKeys = [...envMap.keys()];
		const issues = formatMissingOrExtraIssues(".env", contractKeys, envKeys);
		return { checked: true, issues };
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return { checked: false, issues: [] };
		}
		throw error;
	}
}

async function verifyEnvExampleGeminiKeyPolicy(rootDir) {
	const envExamplePath = path.join(rootDir, ".env.example");
	const raw = await fs.readFile(envExamplePath, "utf8");
	const envMap = parseDotEnv(raw);
	const value = (envMap.get("GEMINI_API_KEY") ?? "").trim();
	if (value.length > 0) {
		return [
			"- .env.example must keep GEMINI_API_KEY empty; real key must come from local .env or shell/CI environment variable.",
		];
	}
	return [];
}

async function runExtendedVerifyEnvContractCli() {
	const exitCode = await runVerifyEnvContractCli();
	if (exitCode !== 0) {
		return exitCode;
	}

	const rootDir = process.cwd();
	const result = await verifyEnvContract({ rootDir, failOnReadmeDrift: true });
	const localEnv = await verifyLocalEnvConsistency(
		rootDir,
		result.contractKeys,
	);
	const envExamplePolicyIssues = await verifyEnvExampleGeminiKeyPolicy(rootDir);
	const extraBlockingIssues = [...localEnv.issues, ...envExamplePolicyIssues];

	if (extraBlockingIssues.length > 0) {
		process.stderr.write("ENV contract extended check failed.\n");
		for (const issue of extraBlockingIssues) {
			process.stderr.write(`${issue}\n`);
		}
		return 1;
	}

	const localEnvStatus = localEnv.checked
		? ".env checked"
		: ".env missing (skipped)";
	process.stdout.write(
		`ENV contract extended check passed (${result.contractKeys.length} keys; ${localEnvStatus}).\n`,
	);
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runExtendedVerifyEnvContractCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	parseDotEnv,
	parseEnvContractKeys,
	parseEnvExampleKeys,
	parseReadmeEnvKeys,
	runExtendedVerifyEnvContractCli,
	runVerifyEnvContractCli,
	verifyEnvContract,
	verifyEnvExampleGeminiKeyPolicy,
	verifyLocalEnvConsistency,
};
