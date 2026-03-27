import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = 1;
const REQUIRED_SECTIONS = ["env", "testing", "docs", "governance"];
const DEFAULT_CONTRACT_PATH = path.resolve(
	process.cwd(),
	"tooling/contracts/governance-contract.json",
);
const DEFAULT_PACKAGE_JSON_PATH = path.resolve(process.cwd(), "package.json");

function toPosixPath(value) {
	return value.split(path.sep).join("/");
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

function validateSectionSchema(sectionName, sectionValue, errors) {
	if (!sectionValue || typeof sectionValue !== "object") {
		errors.push(`Section "${sectionName}" must be an object.`);
		return;
	}

	const scripts = sectionValue.scripts;
	if (!Array.isArray(scripts) || scripts.length === 0) {
		errors.push(`Section "${sectionName}.scripts" must be a non-empty array.`);
	} else {
		const seen = new Set();
		for (const scriptNameRaw of scripts) {
			const scriptName = readString(scriptNameRaw);
			if (!scriptName) {
				errors.push(
					`Section "${sectionName}.scripts" contains empty script name.`,
				);
				continue;
			}
			if (seen.has(scriptName)) {
				errors.push(
					`Section "${sectionName}.scripts" contains duplicate script "${scriptName}".`,
				);
				continue;
			}
			seen.add(scriptName);
		}
	}

	const files = sectionValue.files;
	if (!Array.isArray(files) || files.length === 0) {
		errors.push(`Section "${sectionName}.files" must be a non-empty array.`);
	} else {
		const seen = new Set();
		for (const filePathRaw of files) {
			const filePath = readString(filePathRaw);
			if (!filePath) {
				errors.push(`Section "${sectionName}.files" contains empty file path.`);
				continue;
			}
			if (!isSafeRelativePath(filePath)) {
				errors.push(
					`Section "${sectionName}.files" contains unsafe path "${filePath}".`,
				);
				continue;
			}
			if (seen.has(filePath)) {
				errors.push(
					`Section "${sectionName}.files" contains duplicate path "${filePath}".`,
				);
				continue;
			}
			seen.add(filePath);
		}
	}
}

async function pathExists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function runGovernanceContractCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const packageJsonPath = path.resolve(
		options.packageJsonPath ?? DEFAULT_PACKAGE_JSON_PATH,
	);
	const errors = [];

	const [contractRaw, packageJsonRaw] = await Promise.all([
		fs.readFile(contractPath, "utf8"),
		fs.readFile(packageJsonPath, "utf8"),
	]);
	const contract = JSON.parse(contractRaw);
	const packageJson = JSON.parse(packageJsonRaw);
	const scriptMap = packageJson?.scripts ?? {};

	const version = contract?.version;
	if (!Number.isInteger(version)) {
		errors.push('Contract field "version" must be an integer.');
	} else if (version !== EXPECTED_VERSION) {
		errors.push(
			`Contract version mismatch: expected ${EXPECTED_VERSION}, received ${version}.`,
		);
	}

	for (const sectionName of REQUIRED_SECTIONS) {
		validateSectionSchema(sectionName, contract?.[sectionName], errors);
	}

	const missingScripts = [];
	const missingFiles = [];
	for (const sectionName of REQUIRED_SECTIONS) {
		const section = contract?.[sectionName];
		if (!section || typeof section !== "object") {
			continue;
		}

		for (const scriptNameRaw of section.scripts ?? []) {
			const scriptName = readString(scriptNameRaw);
			if (!scriptName) {
				continue;
			}
			if (typeof scriptMap[scriptName] !== "string") {
				missingScripts.push(`${sectionName}:${scriptName}`);
			}
		}

		for (const filePathRaw of section.files ?? []) {
			const relativeFilePath = readString(filePathRaw);
			if (!isSafeRelativePath(relativeFilePath)) {
				continue;
			}
			const absolutePath = path.resolve(rootDir, relativeFilePath);
			// Contract files must point to concrete files, not directories.
			if (!(await pathExists(absolutePath))) {
				missingFiles.push(`${sectionName}:${relativeFilePath}`);
				continue;
			}
			const stat = await fs.stat(absolutePath);
			if (!stat.isFile()) {
				missingFiles.push(`${sectionName}:${relativeFilePath}`);
			}
		}
	}

	if (missingScripts.length > 0) {
		errors.push(
			`Missing npm scripts referenced by contract: ${missingScripts.join(", ")}`,
		);
	}
	if (missingFiles.length > 0) {
		errors.push(
			`Missing files referenced by contract: ${missingFiles.join(", ")}`,
		);
	}

	return {
		ok: errors.length === 0,
		rootDir: toPosixPath(rootDir),
		contractPath: toPosixPath(contractPath),
		packageJsonPath: toPosixPath(packageJsonPath),
		version: Number.isInteger(version) ? version : null,
		errors,
	};
}

async function main() {
	try {
		const result = await runGovernanceContractCheck();
		if (!result.ok) {
			globalThis.console.error("[governance-contract] FAILED");
			for (const issue of result.errors) {
				globalThis.console.error(`- ${issue}`);
			}
			process.exit(1);
		}

		globalThis.console.log(
			`[governance-contract] OK (version=${result.version})`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		globalThis.console.error(`[governance-contract] ERROR: ${message}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runGovernanceContractCheck };
