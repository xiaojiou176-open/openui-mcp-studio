import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

async function readText(rootDir, relativePath) {
	return fs.readFile(path.resolve(rootDir, relativePath), "utf8");
}

async function runProofPackFreshnessCheck(rootDir = process.cwd()) {
	const absoluteRoot = path.resolve(rootDir);
	const errors = [];
	const readme = await readText(absoluteRoot, "README.md");
	const docsIndex = await readText(absoluteRoot, "docs/index.md");
	const releaseReadiness = await readText(
		absoluteRoot,
		"docs/release-readiness.md",
	);
	const secretsRunbook = await readText(
		absoluteRoot,
		"docs/secrets-incident-runbook.md",
	);

	for (const routeFile of ["README.md", "docs/index.md"]) {
		const content = routeFile === "README.md" ? readme : docsIndex;
		for (const requiredCommand of [
			"npm run release:public-safe:check",
			"npm run repo:doctor",
		]) {
			if (!content.includes(requiredCommand)) {
				errors.push(`${routeFile} must mention "${requiredCommand}".`);
			}
		}
	}

	for (const requiredCommand of [
		"npm run governance:remote-evidence:check:strict",
		"npm run governance:history-hygiene:check",
	]) {
		if (!releaseReadiness.includes(requiredCommand)) {
			errors.push(`docs/release-readiness.md must mention "${requiredCommand}".`);
		}
	}

	for (const requiredCommand of [
		"npm run security:history:audit",
		"npm run security:oss:audit",
		"npm run security:pii:audit",
	]) {
		if (!secretsRunbook.includes(requiredCommand)) {
			errors.push(`docs/secrets-incident-runbook.md must mention "${requiredCommand}".`);
		}
	}

	const packageJson = JSON.parse(
		await readText(absoluteRoot, "package.json"),
	);
	const scripts = packageJson.scripts ?? {};
	for (const requiredScript of [
		"repo:doctor",
		"release:public-safe:check",
		"governance:remote-evidence:check:strict",
		"security:pii:audit",
	]) {
		if (!Object.prototype.hasOwnProperty.call(scripts, requiredScript)) {
			errors.push(`package.json is missing required proof-pack script "${requiredScript}".`);
		}
	}

	return {
		ok: errors.length === 0,
		errors,
	};
}

async function main() {
	try {
		const result = await runProofPackFreshnessCheck();
		if (!result.ok) {
			console.error("[proof-pack-freshness] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[proof-pack-freshness] OK");
	} catch (error) {
		console.error(
			`[proof-pack-freshness] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runProofPackFreshnessCheck };
