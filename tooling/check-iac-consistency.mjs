#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const CANDIDATE_IAC_FILES = [
	".devcontainer/devcontainer.json",
	"docker-compose.yml",
	"docker-compose.yaml",
	"compose.yml",
	"compose.yaml",
	"flake.nix",
	"shell.nix",
];
const CONTAINER_ACTION_REFERENCE = "uses: ./.github/actions/run-in-ci-container";
const ACTIVE_SIDECAR_REQUIREMENTS = "services/gemini-sidecar/requirements.txt";
const ACTIVE_SIDECAR_CONSTRAINTS = "services/gemini-sidecar/constraints.txt";
const REMOVED_SIDECAR_REQUIREMENTS = "python/requirements.txt";
const WORKFLOW_CONTAINER_CONTRACT = Object.freeze([
	{
		path: ".github/workflows/ci.yml",
		requiredSnippets: [
			CONTAINER_ACTION_REFERENCE,
			"npm run ci:gate:container",
			"name: Quality (Node 22.22.0)",
		],
	},
	{
		path: ".github/workflows/mutation-weekly.yml",
		requiredSnippets: [CONTAINER_ACTION_REFERENCE],
	},
	{
		path: ".github/workflows/quality-trend-weekly.yml",
		requiredSnippets: [CONTAINER_ACTION_REFERENCE, "id: ci_gate_run"],
	},
	{
		path: ".github/workflows/weekly-env-audit.yml",
		requiredSnippets: [CONTAINER_ACTION_REFERENCE, "weekly_env_audit:"],
	},
	{
		path: ".github/workflows/reusable-quality-gate.yml",
		requiredSnippets: [CONTAINER_ACTION_REFERENCE, "quality_gate:"],
	},
]);

async function assertContainerWorkflowContract(rootDir) {
	for (const contract of WORKFLOW_CONTAINER_CONTRACT) {
		const workflowPath = path.join(rootDir, contract.path);
		if (!(await exists(workflowPath))) {
			throw new Error(`Missing required workflow file: ${contract.path}`);
		}
		const content = await readFile(workflowPath, "utf8");
		for (const snippet of contract.requiredSnippets) {
			if (!content.includes(snippet)) {
				throw new Error(
					`${contract.path} is missing required container contract snippet: ${snippet}`,
				);
			}
		}

		if (/npm run ci:gate(?!:container)\b/.test(content)) {
			throw new Error(
				`${contract.path} contains host ci:gate invocation; use ci:gate:container in CI workflows.`,
			);
		}

		if (/node-version:\s*"22"\b/.test(content)) {
			throw new Error(
				`${contract.path} still uses floating node-version 22; pin to 22.22.0.`,
			);
		}
	}
}

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function assertDevcontainerConsistency(rootDir) {
	const devcontainerPath = path.join(
		rootDir,
		".devcontainer",
		"devcontainer.json",
	);
	if (!(await exists(devcontainerPath))) {
		return;
	}

	const raw = await readFile(devcontainerPath, "utf8");
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(
			`.devcontainer/devcontainer.json is not valid JSON: ${detail}`,
			{ cause: error },
		);
	}

	const dockerfile = parsed?.build?.dockerfile;
	if (typeof dockerfile !== "string" || dockerfile.trim().length === 0) {
		throw new Error(
			".devcontainer/devcontainer.json must define build.dockerfile for reproducible container builds.",
		);
	}

	const dockerfilePath = path.join(rootDir, ".devcontainer", dockerfile);
	if (!(await exists(dockerfilePath))) {
		throw new Error(
			`.devcontainer/devcontainer.json references missing Dockerfile: .devcontainer/${dockerfile}`,
		);
	}

	const dockerfileContent = await readFile(dockerfilePath, "utf8");
	if (!dockerfileContent.includes(`COPY ${ACTIVE_SIDECAR_REQUIREMENTS} `)) {
		throw new Error(
			`.devcontainer/${dockerfile} must copy ${ACTIVE_SIDECAR_REQUIREMENTS} as the active sidecar requirements source.`,
		);
	}
	if (!dockerfileContent.includes(`COPY ${ACTIVE_SIDECAR_CONSTRAINTS} `)) {
		throw new Error(
			`.devcontainer/${dockerfile} must copy ${ACTIVE_SIDECAR_CONSTRAINTS} so the sidecar lock can be consumed during container bootstrap.`,
		);
	}
	if (dockerfileContent.includes(`COPY ${REMOVED_SIDECAR_REQUIREMENTS} `)) {
		throw new Error(
			`.devcontainer/${dockerfile} still references removed sidecar requirements path ${REMOVED_SIDECAR_REQUIREMENTS}.`,
		);
	}

	const lockPath = path.join(rootDir, ".github", "ci-image.lock.json");
	if (!(await exists(lockPath))) {
		throw new Error("Missing required CI image lock file: .github/ci-image.lock.json");
	}
	const rawLock = await readFile(lockPath, "utf8");
	let parsedLock;
	try {
		parsedLock = JSON.parse(rawLock);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`.github/ci-image.lock.json is not valid JSON: ${detail}`, {
			cause: error,
		});
	}

	const bootstrapDockerfile = parsedLock?.bootstrap?.dockerfile;
	const bootstrapContext = parsedLock?.bootstrap?.context;
	if (bootstrapDockerfile !== `.devcontainer/${dockerfile}`) {
		throw new Error(
			`.github/ci-image.lock.json bootstrap.dockerfile must match .devcontainer/${dockerfile}.`,
		);
	}
	if (bootstrapContext !== ".") {
		throw new Error(
			`.github/ci-image.lock.json bootstrap.context must remain "." so immutable digest metadata stays reproducible against the repository root.`,
		);
	}
}

async function main() {
	const rootDir = process.cwd();
	const existing = [];

	for (const relativePath of CANDIDATE_IAC_FILES) {
		if (await exists(path.join(rootDir, relativePath))) {
			existing.push(relativePath);
		}
	}

	if (existing.length === 0) {
		throw new Error(
			"No executable IaC baseline found. Add at least one of: .devcontainer/devcontainer.json, docker-compose.yml, flake.nix.",
		);
	}

	await assertDevcontainerConsistency(rootDir);
	await assertContainerWorkflowContract(rootDir);
	process.stdout.write(`[iac-check] OK: ${existing.join(", ")}\n`);
}

main().catch((error) => {
	process.stderr.write(
		`[iac-check] FAILED: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
});
