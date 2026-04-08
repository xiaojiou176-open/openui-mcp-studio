import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ALLOWLIST_PATH = "tooling/contracts/public-boundary-allowlist.json";
const DEFAULT_WORKFLOW_FILES = [
	".github/workflows/build-ci-image.yml",
	".github/workflows/ci.yml",
	".github/workflows/mutation-manual.yml",
	".github/workflows/quality-trend-manual.yml",
	".github/workflows/release-readiness.yml",
	".github/workflows/reusable-quality-gate.yml",
	".github/workflows/security-supplemental.yml",
	".github/workflows/shared-runner-health.yml",
	".github/workflows/runtime-cleanup-nightly.yml",
	".github/workflows/env-audit-manual.yml",
];

const FORBIDDEN_PATTERNS = [
	{
		id: "self-hosted-label",
		message: "self-hosted runner labels must not appear in the public workflow contract",
		pattern: /\bself-hosted\b/giu,
	},
	{
		id: "shared-pool-label",
		message: "shared runner pool labels must stay out of the public workflow contract",
		pattern: /\bshared-pool\b/giu,
	},
	{
		id: "gcp-env",
		message: "GCP-specific environment names expose internal topology details",
		pattern: /\bGCP_[A-Z0-9_]+\b/gu,
	},
	{
		id: "gcloud-cli",
		message: "gcloud references expose internal cloud topology details",
		pattern: /\bgcloud\b/giu,
	},
	{
		id: "google-actions",
		message: "Google Cloud GitHub actions expose internal cloud integration details",
		pattern: /\bgoogle-github-actions\/(?:auth|setup-gcloud)\b/giu,
	},
	{
		id: "wif-detail",
		message: "workload identity details must not appear in public workflows",
		pattern: /\b(?:workload_identity_provider|service_account)\b/giu,
	},
	{
		id: "gce-topology",
		message: "GCE-specific topology details must not appear in public workflows",
		pattern: /\bGCE\b/gu,
	},
	{
		id: "zone-detail",
		message: "cloud zone identifiers must not appear in public workflows",
		pattern: /\bus-central1-[a-z]\b/giu,
	},
	{
		id: "machine-name",
		message: "named runner machines expose internal topology details",
		pattern: /\bgithub-runner-core-\d+\b/giu,
	},
	{
		id: "runner-pool-member",
		message: "named runner pool members expose internal topology details",
		pattern: /\bpool-core\d+-\d+\b/giu,
	},
	{
		id: "org-runner-token",
		message: "organization runner tokens must not appear in public workflow contracts",
		pattern: /\bORG_RUNNER_TOKEN\b/gu,
	},
	{
		id: "runner-api-query",
		message: "direct org runner API queries expose internal runner management details",
		pattern: /actions\/runners\?per_page=/giu,
	},
];

function parsePublicInfraBoundaryArgs(argv) {
	const files = [];
	let rootDir = process.cwd();

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--workflow") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--workflow requires a path value");
			}
			files.push(value);
			index += 1;
			continue;
		}
		if (token === "--root") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--root requires a path value");
			}
			rootDir = value;
			index += 1;
			continue;
		}
		throw new Error(`unknown argument: ${token}`);
	}

	return {
		rootDir,
		files: files.length > 0 ? files : DEFAULT_WORKFLOW_FILES,
	};
}

async function readDefaultScanPaths(rootDir) {
	const allowlistPath = path.resolve(rootDir, DEFAULT_ALLOWLIST_PATH);
	const raw = await fs.readFile(allowlistPath, "utf8");
	const contract = JSON.parse(raw);
	const scanPaths = Array.isArray(contract?.publicInfraBoundary?.scanPaths)
		? contract.publicInfraBoundary.scanPaths
				.map((value) => String(value ?? "").trim())
				.filter(Boolean)
		: [];
	const allowedExceptions = Array.isArray(contract?.publicInfraBoundary?.allowedExceptions)
		? contract.publicInfraBoundary.allowedExceptions
		: [];
	return { scanPaths, allowedExceptions };
}

function scanContentForPublicInfraBoundaryViolations(relativePath, content) {
	const violations = [];
	const lines = content.split(/\r?\n/u);

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
		const line = lines[lineNumber];
		for (const entry of FORBIDDEN_PATTERNS) {
			entry.pattern.lastIndex = 0;
			if (!entry.pattern.test(line)) {
				continue;
			}
			violations.push({
				ruleId: entry.id,
				message: entry.message,
				file: relativePath,
				line: lineNumber + 1,
				excerpt: line.trim(),
			});
		}
	}

	return violations;
}

function isAllowedViolation(violation, allowedExceptions) {
	return allowedExceptions.some((entry) => {
		const entryPath = String(entry?.path ?? "").trim();
		const ruleIds = Array.isArray(entry?.ruleIds)
			? entry.ruleIds.map((value) => String(value ?? "").trim())
			: [];
		return (
			entryPath === violation.file &&
			ruleIds.includes(violation.ruleId)
		);
	});
}

async function runPublicInfraBoundaryCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const defaults = await readDefaultScanPaths(rootDir);
	const files = Array.isArray(options.files) && options.files.length > 0
		? options.files
		: defaults.scanPaths;
	const violations = [];

	for (const relativePath of files) {
		const absolutePath = path.resolve(rootDir, relativePath);
		const content = await fs.readFile(absolutePath, "utf8");
		const fileViolations = scanContentForPublicInfraBoundaryViolations(
			relativePath,
			content,
		).filter((violation) => !isAllowedViolation(violation, defaults.allowedExceptions));
		violations.push(...fileViolations);
	}

	return {
		ok: violations.length === 0,
		files,
		violations,
	};
}

async function main() {
	try {
		const options = parsePublicInfraBoundaryArgs(process.argv.slice(2));
		const result = await runPublicInfraBoundaryCheck(options);
		if (!result.ok) {
			console.error("[public-infra-boundary] FAILED");
			for (const violation of result.violations) {
				console.error(
					`- ${violation.file}:${violation.line} [${violation.ruleId}] ${violation.message}`,
				);
				console.error(`  ${violation.excerpt}`);
			}
			process.exit(1);
		}
		console.log(
			`[public-infra-boundary] OK (${result.files.length} workflow file${result.files.length === 1 ? "" : "s"})`,
		);
	} catch (error) {
		console.error(
			`[public-infra-boundary] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export {
	DEFAULT_WORKFLOW_FILES,
	parsePublicInfraBoundaryArgs,
	runPublicInfraBoundaryCheck,
	scanContentForPublicInfraBoundaryViolations,
};
