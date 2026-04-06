#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const WORKFLOW_PATH = path.resolve(
	ROOT,
	".github/workflows/security-supplemental.yml",
);
const DEPENDENCY_REVIEW_CONFIG_PATH = path.resolve(
	ROOT,
	".github/dependency-review-config.yml",
);

const CHECKOUT_REF = "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd";
const DEPENDENCY_REVIEW_REF =
	"actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48";
const TRIVY_REF =
	"aquasecurity/trivy-action@b6643a29fecd7f34b3597bc6acb0a98b03d33ff8";
const ZIZMOR_REF =
	"zizmorcore/zizmor-action@71321a20a9ded102f6e9ce5718a2fcec2c4f70d8";
const UPLOAD_SARIF_REF =
	"github/codeql-action/upload-sarif@89a39a4e59826350b863aa6b6252a07ad50cf83e";

const CHECKS = {
	all: {
		description: "supplemental security workflow wiring",
		patterns: [
			`name: Security Supplemental`,
			CHECKOUT_REF,
			DEPENDENCY_REVIEW_REF,
			ZIZMOR_REF,
			TRIVY_REF,
			UPLOAD_SARIF_REF,
			`name: Dependency Review`,
			`name: Zizmor`,
			`name: Trivy Filesystem`,
		],
	},
	"dependency-review": {
		description: "dependency-review workflow wiring",
		patterns: [
			DEPENDENCY_REVIEW_REF,
			`config-file: ./.github/dependency-review-config.yml`,
			`name: Dependency Review`,
		],
		configPatterns: [
			`fail-on-severity: high`,
			`license-check: true`,
			`vulnerability-check: true`,
			`warn-only: false`,
		],
	},
	trivy: {
		description: "Trivy workflow wiring",
		patterns: [
			TRIVY_REF,
			UPLOAD_SARIF_REF,
			`scan-type: fs`,
			`scan-ref: .`,
			`severity: HIGH,CRITICAL`,
			`ignore-unfixed: true`,
			`format: sarif`,
			`exit-code: "1"`,
			`scanners: vuln`,
			`category: trivy-fs`,
		],
	},
	zizmor: {
		description: "zizmor workflow wiring",
		patterns: [
			ZIZMOR_REF,
			`advanced-security: "true"`,
			`inputs: ".github/workflows/build-ci-image.yml .github/workflows/security-supplemental.yml .github/dependabot.yml"`,
			`min-severity: high`,
			`persona: regular`,
		],
	},
};

function parseTool(argv) {
	for (const arg of argv) {
		if (arg.startsWith("--tool=")) {
			return arg.slice("--tool=".length);
		}
	}
	return "all";
}

async function readRequiredFile(filePath) {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch (error) {
		const detail =
			error instanceof Error ? error.message : String(error);
		throw new Error(`${path.relative(ROOT, filePath)} is missing: ${detail}`, {
			cause: error,
		});
	}
}

function collectMissingPatterns(content, patterns, fileLabel) {
	const missing = [];
	for (const pattern of patterns) {
		if (!content.includes(pattern)) {
			missing.push(`${fileLabel} is missing required content: ${pattern}`);
		}
	}
	return missing;
}

async function main() {
	const tool = parseTool(process.argv.slice(2));
	const check = CHECKS[tool];
	if (!check) {
		const available = Object.keys(CHECKS).join(", ");
		throw new Error(`unknown tool "${tool}". expected one of: ${available}`);
	}

	const workflowContent = await readRequiredFile(WORKFLOW_PATH);
	const errors = collectMissingPatterns(
		workflowContent,
		check.patterns,
		path.relative(ROOT, WORKFLOW_PATH),
	);

	if (check.configPatterns) {
		const configContent = await readRequiredFile(DEPENDENCY_REVIEW_CONFIG_PATH);
		errors.push(
			...collectMissingPatterns(
				configContent,
				check.configPatterns,
				path.relative(ROOT, DEPENDENCY_REVIEW_CONFIG_PATH),
			),
		);
	}

	if (errors.length > 0) {
		process.stderr.write("[supplemental-security] FAILED\n");
		for (const error of errors) {
			process.stderr.write(`- ${error}\n`);
		}
		process.exit(1);
	}

	process.stdout.write(
		`[supplemental-security] OK: ${check.description} is pinned and discoverable.\n`,
	);
}

main().catch((error) => {
	const detail =
		error instanceof Error ? (error.stack ?? error.message) : String(error);
	process.stderr.write(`[supplemental-security] fatal: ${detail}\n`);
	process.exit(1);
});
