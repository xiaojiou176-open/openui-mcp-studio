import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTRACT_PATH =
	"tooling/contracts/remote-governance-evidence.contract.json";
const ALLOWED_STATUSES = new Set(["verified", "repo_asserted", "unverified"]);
const ALLOWED_EVIDENCE_TYPES = new Set(["repo_path", "command_observation"]);
const REQUIRED_REMOTE_IDS = new Set([
	"default_branch",
	"branch_protection_main",
	"required_checks_main",
	"codeowners_enforcement",
	"secret_scanning",
	"push_protection",
	"code_scanning",
	"private_vulnerability_reporting",
	"live_gemini_environment",
]);
const STRICT_MAX_AGE_HOURS = 36;
const DEFAULT_PUBLIC_READY_REQUIRED_VALUES = {
	branch_protection_main: ["enabled"],
	required_checks_main: ["enforced"],
	codeowners_enforcement: ["enforced"],
	secret_scanning: ["enabled"],
	push_protection: ["enabled"],
	code_scanning: ["enabled"],
	private_vulnerability_reporting: ["enabled"],
	live_gemini_environment: ["protected_review_required"],
};

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function parseGitHubRepository(originUrl) {
	const value = readString(originUrl);
	if (!value) {
		return null;
	}

	const sshMatch = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u);
	if (sshMatch) {
		return {
			owner: sshMatch[1],
			name: sshMatch[2],
		};
	}

	const httpsMatch = value.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u);
	if (httpsMatch) {
		return {
			owner: httpsMatch[1],
			name: httpsMatch[2],
		};
	}

	return null;
}

function resolveOriginRepository(rootDir, originUrl) {
	const explicit = parseGitHubRepository(originUrl);
	if (explicit) {
		return explicit;
	}

	try {
		const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
			cwd: rootDir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return parseGitHubRepository(remoteUrl);
	} catch {
		return null;
	}
}

async function pathExists(rootDir, relativePath) {
	try {
		await fs.access(path.resolve(rootDir, relativePath));
		return true;
	} catch {
		return false;
	}
}

async function validateEvidenceEntries(rootDir, entries, owner, errors) {
	if (!Array.isArray(entries) || entries.length === 0) {
		errors.push(`${owner} must include at least one evidence entry.`);
		return;
	}

	for (const [index, entry] of entries.entries()) {
		if (!isPlainObject(entry)) {
			errors.push(`${owner}.evidence[${index}] must be an object.`);
			continue;
		}
		const type = readString(entry.type);
		const value = readString(entry.value);
		if (!ALLOWED_EVIDENCE_TYPES.has(type)) {
			errors.push(
				`${owner}.evidence[${index}].type must be one of: ${Array.from(ALLOWED_EVIDENCE_TYPES).join(", ")}`,
			);
		}
		if (!value) {
			errors.push(`${owner}.evidence[${index}].value must be non-empty.`);
			continue;
		}
		if (type === "repo_path" && !(await pathExists(rootDir, value))) {
			errors.push(`${owner}.evidence[${index}] points to missing repo path: ${value}`);
		}
	}
}

async function validateControl(rootDir, control, owner, errors) {
	if (!isPlainObject(control)) {
		errors.push(`${owner} must be an object.`);
		return;
	}
	const id = readString(control.id);
	const label = readString(control.label);
	const status = readString(control.status);
	const summary = readString(control.summary);
	if (!id) {
		errors.push(`${owner}.id must be non-empty.`);
	}
	if (!label) {
		errors.push(`${owner}.label must be non-empty.`);
	}
	if (!ALLOWED_STATUSES.has(status)) {
		errors.push(`${owner}.status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`);
	}
	if (!summary) {
		errors.push(`${owner}.summary must be non-empty.`);
	}
	await validateEvidenceEntries(rootDir, control.evidence, owner, errors);
	if (status !== "verified" && !readString(control.verificationMethod)) {
		errors.push(`${owner}.verificationMethod is required when status is not verified.`);
	}
	if (id === "required_checks_main") {
		const expectedChecks = Array.isArray(control.expectedChecks)
			? control.expectedChecks.map((value) => readString(value)).filter(Boolean)
			: [];
		if (expectedChecks.length === 0) {
			errors.push(`${owner}.expectedChecks must include at least one check name.`);
		}
	}
}

async function runRemoteGovernanceEvidenceCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const raw = await fs.readFile(contractPath, "utf8");
	const contract = JSON.parse(raw);
	const errors = [];
	const strict = options.strict === true;

	if (!isPlainObject(contract)) {
		errors.push("remote governance contract must be an object.");
		return { ok: false, errors, contractPath: toPosixPath(contractPath) };
	}
	if (Number(contract.version) !== 1) {
		errors.push("remote governance contract version must equal 1.");
	}
	if (!isPlainObject(contract.repository)) {
		errors.push("repository must be an object.");
	} else {
		if (!readString(contract.repository.owner)) {
			errors.push("repository.owner must be non-empty.");
		}
		if (!readString(contract.repository.name)) {
			errors.push("repository.name must be non-empty.");
		}
	}
	const originRepo = resolveOriginRepository(rootDir, options.originUrl);
	if (
		originRepo &&
		isPlainObject(contract.repository) &&
		(
			readString(contract.repository.owner) !== originRepo.owner ||
			readString(contract.repository.name) !== originRepo.name
		)
	) {
		errors.push(
			`repository owner/name must match git remote origin (${originRepo.owner}/${originRepo.name}).`,
		);
	}
	if (!readString(contract.checkedAt)) {
		errors.push("checkedAt must be non-empty.");
	} else if (strict) {
		const parsed = Date.parse(contract.checkedAt);
		if (Number.isNaN(parsed)) {
			errors.push("checkedAt must be a valid ISO timestamp in strict mode.");
		} else {
			const ageHours = (Date.now() - parsed) / (1000 * 60 * 60);
			if (ageHours > STRICT_MAX_AGE_HOURS) {
				errors.push(
					`remote governance evidence is stale in strict mode: checkedAt is older than ${STRICT_MAX_AGE_HOURS}h.`,
				);
			}
		}
	}

	const repoLocalControls = Array.isArray(contract.repoLocalControls)
		? contract.repoLocalControls
		: [];
	if (repoLocalControls.length === 0) {
		errors.push("repoLocalControls must contain at least one control.");
	}
	for (const [index, control] of repoLocalControls.entries()) {
		await validateControl(
			rootDir,
			control,
			`repoLocalControls[${index}]`,
			errors,
		);
	}

	const remoteControls = Array.isArray(contract.remotePlatformControls)
		? contract.remotePlatformControls
		: [];
	if (remoteControls.length === 0) {
		errors.push("remotePlatformControls must contain at least one control.");
	}
	const seenRemoteIds = new Set();
	for (const [index, control] of remoteControls.entries()) {
		await validateControl(
			rootDir,
			control,
			`remotePlatformControls[${index}]`,
			errors,
		);
		const id = readString(control?.id);
		if (id) {
			seenRemoteIds.add(id);
		}
	}
	for (const requiredId of REQUIRED_REMOTE_IDS) {
		if (!seenRemoteIds.has(requiredId)) {
			errors.push(`remotePlatformControls is missing required control "${requiredId}".`);
		}
	}

	if (strict) {
		const visibility = readString(contract.repository?.visibility);
		if (visibility !== "public") {
			errors.push(
				`public-ready remote governance requires repository.visibility to equal "public" (current: ${visibility || "missing"}).`,
			);
		}

		const requirements = isPlainObject(contract.publicReadyRequirements)
			? contract.publicReadyRequirements
			: {};
		const requiredValues = isPlainObject(requirements.requiredValues)
			? requirements.requiredValues
			: DEFAULT_PUBLIC_READY_REQUIRED_VALUES;
		const controlsById = new Map(
			remoteControls
				.filter((control) => isPlainObject(control) && readString(control.id))
				.map((control) => [readString(control.id), control]),
		);
		for (const requiredId of REQUIRED_REMOTE_IDS) {
			const control = controlsById.get(requiredId);
			if (!control) {
				continue;
			}
			const status = readString(control.status);
			if (status !== "verified") {
				errors.push(
					`public-ready remote governance requires "${requiredId}" to be verified (current: ${status || "missing"}).`,
				);
			}
			const allowedValues = Array.isArray(requiredValues[requiredId])
				? requiredValues[requiredId]
					.map((value) => readString(value))
					.filter(Boolean)
				: [];
			if (allowedValues.length > 0) {
				const currentValue = readString(control.value);
				if (!allowedValues.includes(currentValue)) {
					errors.push(
						`public-ready remote governance requires "${requiredId}" value to be one of [${allowedValues.join(", ")}] (current: ${currentValue || "missing"}).`,
					);
				}
			}
		}
	}

	return {
		ok: errors.length === 0,
		errors,
		contractPath: toPosixPath(contractPath),
	};
}

function parseArgs(argv = process.argv.slice(2)) {
	return {
		strict: argv.includes("--strict"),
	};
}

async function main() {
	try {
		const options = parseArgs();
		const result = await runRemoteGovernanceEvidenceCheck(options);
		if (!result.ok) {
			console.error(
				options.strict
					? "[remote-governance-evidence] FAILED (strict)"
					: "[remote-governance-evidence] FAILED",
			);
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			options.strict
				? `[remote-governance-evidence] OK (strict) (${result.contractPath})`
				: `[remote-governance-evidence] OK (${result.contractPath})`,
		);
	} catch (error) {
		console.error(
			`[remote-governance-evidence] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runRemoteGovernanceEvidenceCheck };
