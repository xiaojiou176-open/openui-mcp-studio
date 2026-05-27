import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_ROOT_FILES = [
	"LICENSE",
	"SECURITY.md",
	"CONTRIBUTING.md",
	"CODEOWNERS",
	"CODE_OF_CONDUCT.md",
	"SUPPORT.md",
];

async function exists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function parseGitHubRepository(originUrl) {
	const value = String(originUrl ?? "").trim();
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

async function runOpenSourceSurfaceCheck(rootDir = process.cwd(), options = {}) {
	const absoluteRoot = path.resolve(rootDir);
	const errors = [];

	for (const relativePath of REQUIRED_ROOT_FILES) {
		if (!(await exists(path.resolve(absoluteRoot, relativePath)))) {
			errors.push(`missing required public surface file "${relativePath}"`);
		}
	}

	const readme = await fs.readFile(path.resolve(absoluteRoot, "README.md"), "utf8");
	const docsIndex = await fs.readFile(path.resolve(absoluteRoot, "docs/index.md"), "utf8");

	for (const relativePath of REQUIRED_ROOT_FILES) {
		if (!readme.includes(relativePath)) {
			errors.push(`README.md must route to "${relativePath}"`);
		}
		if (!docsIndex.includes(relativePath)) {
			errors.push(`docs/index.md must route to "${relativePath}"`);
		}
	}

	const security = await fs.readFile(
		path.resolve(absoluteRoot, "SECURITY.md"),
		"utf8",
	);
	const support = await fs.readFile(
		path.resolve(absoluteRoot, "SUPPORT.md"),
		"utf8",
	);
	const contributing = await fs.readFile(
		path.resolve(absoluteRoot, "CONTRIBUTING.md"),
		"utf8",
	);
	const issueConfig = await fs.readFile(
		path.resolve(absoluteRoot, ".github/ISSUE_TEMPLATE/config.yml"),
		"utf8",
	);

	if (!support.includes("SECURITY.md")) {
		errors.push('SUPPORT.md must route security-sensitive reports to "SECURITY.md".');
	}
	if (!contributing.includes("SECURITY.md")) {
		errors.push('CONTRIBUTING.md must reference "SECURITY.md".');
	}
	for (const requiredTarget of ["SECURITY.md", "SUPPORT.md", "docs/index.md"]) {
		if (!issueConfig.includes(requiredTarget)) {
			errors.push(`.github/ISSUE_TEMPLATE/config.yml must route to "${requiredTarget}".`);
		}
	}
	const originRepo = resolveOriginRepository(absoluteRoot, options.originUrl);
	if (originRepo) {
		for (const requiredTarget of ["SECURITY.md", "SUPPORT.md", "docs/index.md"]) {
			const expectedUrl = `https://github.com/${originRepo.owner}/${originRepo.name}/blob/main/${requiredTarget}`;
			if (!issueConfig.includes(expectedUrl)) {
				errors.push(
					`.github/ISSUE_TEMPLATE/config.yml must point "${requiredTarget}" at ${expectedUrl}.`,
				);
			}
		}
	}
	if (!security.includes("Reporting a Vulnerability")) {
		errors.push('SECURITY.md must contain a "Reporting a Vulnerability" section.');
	}

	return {
		ok: errors.length === 0,
		errors,
	};
}

async function main() {
	try {
		const result = await runOpenSourceSurfaceCheck();
		if (!result.ok) {
			console.error("[open-source-surface] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[open-source-surface] OK");
	} catch (error) {
		console.error(
			`[open-source-surface] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runOpenSourceSurfaceCheck };
