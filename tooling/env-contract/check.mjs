import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { formatDefaultForEnvExample, formatMismatch } from "./format.mjs";
import {
	parseEnvContract,
	parseEnvExample,
	parseReadmeDefaultLineKeys,
	parseReadmeEnvKeys,
} from "./parse.mjs";

function readRequiredFile(filePath) {
	return fs.readFile(filePath, "utf8");
}

function resolveFailOnReadmeDrift(options) {
	if (typeof options.failOnReadmeDrift === "boolean") {
		return options.failOnReadmeDrift;
	}

	if (typeof options.failOnReadmeMismatch === "boolean") {
		return options.failOnReadmeMismatch;
	}

	return true;
}

function verifyEnvExampleMetadata(contractEntries, envExampleMetadata) {
	const issues = [];

	for (const [key, contract] of Object.entries(contractEntries)) {
		const metadata = envExampleMetadata[key];
		if (!metadata) {
			issues.push(`- Missing metadata block in .env.example for ${key}`);
			continue;
		}

		if (!metadata.hasValueLine) {
			issues.push(`- Missing value line in .env.example for ${key}`);
		}

		const expectedDefault = formatDefaultForEnvExample(contract.defaultValue);
		if (metadata.defaultValue !== expectedDefault) {
			issues.push(
				`- .env.example default mismatch for ${key}: expected "${expectedDefault}", received "${metadata.defaultValue ?? "<missing>"}"`,
			);
		}

		if (metadata.validation !== contract.validation) {
			issues.push(
				`- .env.example validation mismatch for ${key}: expected "${contract.validation}", received "${metadata.validation ?? "<missing>"}"`,
			);
		}

		if (
			(metadata.sensitive ?? "").toLowerCase() !== String(contract.sensitive)
		) {
			issues.push(
				`- .env.example sensitive mismatch for ${key}: expected "${String(contract.sensitive)}", received "${metadata.sensitive ?? "<missing>"}"`,
			);
		}

		if (metadata.description !== contract.description) {
			issues.push(
				`- .env.example description mismatch for ${key}: expected "${contract.description}", received "${metadata.description ?? "<missing>"}"`,
			);
		}
	}

	return issues;
}

async function verifyEnvContract(options = {}) {
	const rootDir = options.rootDir
		? path.resolve(options.rootDir)
		: process.cwd();
	const failOnReadmeDrift = resolveFailOnReadmeDrift(options);
	const readmePath = path.join(rootDir, "docs", "environment-governance.md");
	const envExamplePath = path.join(rootDir, ".env.example");
	const envContractPath = path.join(
		rootDir,
		"packages",
		"contracts",
		"src",
		"env-contract.ts",
	);

	const [readmeRaw, envExampleRaw, envContractRaw] = await Promise.all([
		readRequiredFile(readmePath),
		readRequiredFile(envExamplePath),
		readRequiredFile(envContractPath),
	]);

	const contract = parseEnvContract(envContractRaw);
	const envExample = parseEnvExample(envExampleRaw);
	const readmeKeys = parseReadmeEnvKeys(readmeRaw);
	const readmeDefaultLineKeys = parseReadmeDefaultLineKeys(readmeRaw);

	const issues = [
		...formatMismatch(
			"OPENUI_ENV_CONTRACT object keys",
			contract.keyTuple,
			contract.entryKeys,
		),
		...formatMismatch(
			".env.example key list",
			contract.keyTuple,
			envExample.keys,
		),
		...verifyEnvExampleMetadata(contract.entries, envExample.metadata),
	];

	const readmeIssues = [
		...formatMismatch(
			"docs/environment-governance.md runtime variables section keys",
			contract.keyTuple,
			readmeKeys,
		),
		...formatMismatch(
			"docs/environment-governance.md runtime variables default lines",
			contract.keyTuple,
			readmeDefaultLineKeys,
		),
	];
	const blockingIssues = failOnReadmeDrift
		? [...issues, ...readmeIssues]
		: [...issues];

	return {
		ok: blockingIssues.length === 0,
		failOnReadmeDrift,
		contractKeys: contract.keyTuple,
		envExampleKeys: envExample.keys,
		readmeKeys,
		readmeDefaultLineKeys,
		envExampleMetadata: envExample.metadata,
		issues,
		readmeIssues,
		blockingIssues,
	};
}

export { verifyEnvContract, verifyEnvExampleMetadata };
