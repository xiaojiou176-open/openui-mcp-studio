#!/usr/bin/env node

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_PATH = path.resolve(
	process.cwd(),
	"tooling/contracts/docs-registry.json",
);
const ALLOWED_ROLES = new Set([
	"entry",
	"overview",
	"reference",
	"runbook",
	"adr",
	"generated",
	"historical",
]);

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function collectMarkdownDocs(rootDir, currentDir = rootDir, output = []) {
	const entries = await readdir(currentDir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			await collectMarkdownDocs(rootDir, fullPath, output);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".md")) {
			output.push(path.relative(process.cwd(), fullPath).replaceAll("\\", "/"));
		}
	}
	return output;
}

async function main() {
	const registryRaw = await readFile(REGISTRY_PATH, "utf8");
	const registry = JSON.parse(registryRaw);
	const docs = Array.isArray(registry.documents) ? registry.documents : [];
	const errors = [];

	const registeredPaths = new Set();
	for (const doc of docs) {
		const relativePath = String(doc?.path ?? "").trim();
		const role = String(doc?.role ?? "").trim();
		if (!relativePath) {
			errors.push("docs-registry contains empty path.");
			continue;
		}
		if (!ALLOWED_ROLES.has(role)) {
			errors.push(`docs-registry role is invalid for ${relativePath}: ${role}`);
		}
		if (registeredPaths.has(relativePath)) {
			errors.push(`docs-registry contains duplicate path: ${relativePath}`);
		}
		registeredPaths.add(relativePath);
		if (!(await exists(path.resolve(process.cwd(), relativePath)))) {
			errors.push(`docs-registry points to missing file: ${relativePath}`);
		}
	}

	const firstPartyDocs = new Set([
		"README.md",
		"AGENTS.md",
		"CLAUDE.md",
		...(await collectMarkdownDocs(path.resolve(process.cwd(), "docs"))),
	]);

	for (const docPath of Array.from(firstPartyDocs).sort()) {
		if (!registeredPaths.has(docPath)) {
			errors.push(`first-party doc missing from docs-registry: ${docPath}`);
		}
	}

	if (errors.length > 0) {
		console.error("[docs-scope] FAILED");
		for (const error of errors) {
			console.error(`- ${error}`);
		}
		process.exit(1);
	}

	console.log(`[docs-scope] OK (${registeredPaths.size} docs registered)`);
}

main().catch((error) => {
	console.error(
		`[docs-scope] ERROR: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
