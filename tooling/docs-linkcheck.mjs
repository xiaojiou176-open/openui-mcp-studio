#!/usr/bin/env node

import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = process.cwd();
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const DOCS_INDEX_PATH = path.join(DOCS_DIR, "index.md");
const DOCS_INDEX_REQUIRED_LINKS = Object.freeze([
	"../README.md",
	"./architecture.md",
	"./environment-governance.md",
	"./secrets-incident-runbook.md",
]);
const MARKDOWN_FILES = collectMarkdownFiles();
const failures = [];
let checkedLinks = 0;

const EXEMPT_LINKS = new Set([]);

for (const filePath of MARKDOWN_FILES) {
	const content = fs.readFileSync(filePath, "utf8");
	const links = extractMarkdownLinks(content);

	for (const link of links) {
		const target = parseLinkTarget(link.href);
		if (!target) {
			continue;
		}

		if (isExemptLink(filePath, target)) {
			continue;
		}

		const absoluteTarget = resolveTarget(filePath, target);
		if (!absoluteTarget) {
			continue;
		}

		checkedLinks += 1;
		if (!existsTarget(absoluteTarget, target)) {
			failures.push({
				file: path.relative(REPO_ROOT, filePath),
				line: link.line,
				href: link.href,
				resolvedTo: path.relative(REPO_ROOT, absoluteTarget),
			});
		}
	}
}

failures.push(...validateDocsIndexKeyLinks());

if (failures.length > 0) {
	console.error(
		`docs-linkcheck failed: ${failures.length} broken relative link(s) in README/docs markdown.`,
	);
	for (const failure of failures) {
		const reason = failure.reason ? ` [${failure.reason}]` : "";
		console.error(
			`- ${failure.file}:${failure.line} -> "${failure.href}" (resolved: ${failure.resolvedTo})${reason}`,
		);
	}
	process.exit(1);
}

console.log(
	`docs-linkcheck passed: checked ${checkedLinks} relative markdown link(s) across ${MARKDOWN_FILES.length} file(s).`,
);

function collectMarkdownFiles() {
	const files = [];
	const readmePath = path.join(REPO_ROOT, "README.md");
	if (fs.existsSync(readmePath)) {
		files.push(readmePath);
	}

	if (fs.existsSync(DOCS_DIR) && fs.statSync(DOCS_DIR).isDirectory()) {
		walkDirectory(DOCS_DIR, files);
	}

	return files.sort();
}

function walkDirectory(dirPath, files) {
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			walkDirectory(fullPath, files);
			continue;
		}
		if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			files.push(fullPath);
		}
	}
}

function extractMarkdownLinks(content) {
	const links = [];
	const linkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
	const lines = content.split(/\r?\n/);
	let inFence = false;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			continue;
		}

		let match = linkRegex.exec(line);
		while (match !== null) {
			links.push({ href: match[1].trim(), line: i + 1 });
			match = linkRegex.exec(line);
		}
	}

	return links;
}

function parseLinkTarget(href) {
	if (!href) {
		return null;
	}

	let normalized = href.trim();
	if (normalized.startsWith("<") && normalized.endsWith(">")) {
		normalized = normalized.slice(1, -1);
	}

	const titleSeparator = normalized.search(/\s(?=(?:[^"]*"[^"]*")*[^"]*$)/);
	if (titleSeparator !== -1) {
		normalized = normalized.slice(0, titleSeparator);
	}

	if (!normalized || normalized.startsWith("#")) {
		return null;
	}

	if (/^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/\/)/.test(normalized)) {
		return null;
	}

	return normalized;
}

function resolveTarget(sourceFile, rawTarget) {
	const sanitized = rawTarget.split("#")[0].split("?")[0];
	if (!sanitized) {
		return null;
	}

	if (path.isAbsolute(sanitized)) {
		return path.resolve(REPO_ROOT, `.${sanitized}`);
	}

	return path.resolve(path.dirname(sourceFile), sanitized);
}

function isExemptLink(sourceFile, target) {
	const source = path.relative(REPO_ROOT, sourceFile).replace(/\\/g, "/");
	return EXEMPT_LINKS.has(`${source}::${target}`);
}

function existsTarget(targetPath, rawTarget) {
	if (fs.existsSync(targetPath)) {
		return true;
	}

	// Allow extension-less markdown links and directory index links.
	if (!path.extname(targetPath) && !rawTarget.endsWith("/")) {
		const withMarkdown = `${targetPath}.md`;
		if (fs.existsSync(withMarkdown)) {
			return true;
		}

		const asIndexMarkdown = path.join(targetPath, "index.md");
		if (fs.existsSync(asIndexMarkdown)) {
			return true;
		}
	}

	return false;
}

function validateDocsIndexKeyLinks() {
	if (!fs.existsSync(DOCS_INDEX_PATH)) {
		return [
			{
				file: path.relative(REPO_ROOT, DOCS_INDEX_PATH),
				line: 1,
				href: "(required file)",
				resolvedTo: path.relative(REPO_ROOT, DOCS_INDEX_PATH),
				reason: "docs-index-missing",
			},
		];
	}

	const content = fs.readFileSync(DOCS_INDEX_PATH, "utf8");
	const links = extractMarkdownLinks(content);
	const availableTargets = new Set(
		links
			.map((link) => parseLinkTarget(link.href))
			.filter((target) => Boolean(target)),
	);
	const failures = [];

	for (const requiredTarget of DOCS_INDEX_REQUIRED_LINKS) {
		if (availableTargets.has(requiredTarget)) {
			continue;
		}

		const resolvedTarget = resolveTarget(DOCS_INDEX_PATH, requiredTarget);
		failures.push({
			file: path.relative(REPO_ROOT, DOCS_INDEX_PATH),
			line: 1,
			href: requiredTarget,
			resolvedTo: resolvedTarget
				? path.relative(REPO_ROOT, resolvedTarget)
				: "(unresolved)",
			reason: "missing-key-link",
		});
	}

	return failures;
}
