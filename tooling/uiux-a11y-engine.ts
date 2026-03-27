#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import axe from "axe-core";
import { chromium, type Page } from "playwright";

const execFileAsync = promisify(execFile);
const HTML_FILE_PATTERN = /\.(html?)$/iu;
const DEFAULT_MAX_FILES = 8;
const DEFAULT_A11Y_TARGET_ROOT = "apps/web";
const WCAG_22_AA_RULE_TAGS = Object.freeze([
	"wcag2a",
	"wcag2aa",
	"wcag21a",
	"wcag21aa",
	"wcag22aa",
]);

type CliOptions = {
	mode: "files" | "staged" | "changed";
	strict: boolean;
	maxFiles: number;
	targetRoot?: string;
};

type AxeNodeResult = {
	html?: string;
	target?: string[];
	failureSummary?: string;
};

type AxeViolation = {
	id: string;
	impact?: string;
	description: string;
	help: string;
	helpUrl: string;
	nodes: AxeNodeResult[];
};

type FileA11yResult = {
	file: string;
	violations: AxeViolation[];
};

type AxeRuntime = {
	run: (
		context: Document,
		options: { runOnly: { type: string; values: string[] } },
	) => Promise<{ violations: unknown }>;
};

export function shouldFailStrictA11y(results: FileA11yResult[]): boolean {
	return results.some((result) => result.violations.length > 0);
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		mode: "files",
		strict: false,
		maxFiles: DEFAULT_MAX_FILES,
		targetRoot: undefined,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--strict") {
			options.strict = true;
			continue;
		}
		if (token === "--compat-fixture") {
			throw new Error(
				"--compat-fixture has been removed. apps/web is the only default a11y target.",
			);
		}
		if (token === "--target-root") {
			options.targetRoot = argv[index + 1];
			index += 1;
			continue;
		}
		if (token.startsWith("--target-root=")) {
			options.targetRoot = token.slice("--target-root=".length);
			continue;
		}
		if (token.startsWith("--mode=")) {
			const mode = token.slice("--mode=".length);
			if (mode === "files" || mode === "staged" || mode === "changed") {
				options.mode = mode;
			}
			continue;
		}
		if (token.startsWith("--max-files=")) {
			const parsed = Number(token.slice("--max-files=".length));
			if (Number.isInteger(parsed) && parsed > 0) {
				options.maxFiles = parsed;
			}
		}
	}
	return options;
}

function normalizeRepoPath(filePath: string): string {
	return filePath
		.replaceAll("\\", "/")
		.replace(/^\.\/+/u, "")
		.replace(/\/{2,}/gu, "/");
}

function isPathOutsideRoot(rootPath: string, candidatePath: string): boolean {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function resolveTargetRoot(options: CliOptions): string {
	const workspaceRoot = path.resolve(process.cwd());
	const rawTargetRoot = options.targetRoot?.trim() || DEFAULT_A11Y_TARGET_ROOT;
	const resolvedTargetRoot = path.resolve(workspaceRoot, rawTargetRoot);
	if (isPathOutsideRoot(workspaceRoot, resolvedTargetRoot)) {
		throw new Error(
			`--target-root must stay within workspace (received: ${rawTargetRoot}).`,
		);
	}
	const relativeTargetRoot = path.relative(workspaceRoot, resolvedTargetRoot);
	if (relativeTargetRoot.length === 0) {
		throw new Error(
			`--target-root must not resolve to the workspace root (received: ${rawTargetRoot}).`,
		);
	}
	return normalizeRepoPath(relativeTargetRoot);
}

function isPathInsideTargetRoot(file: string, targetRoot: string): boolean {
	const normalizedFile = normalizeRepoPath(file);
	const normalizedRoot = normalizeRepoPath(targetRoot).replace(/\/+$/u, "");
	return (
		normalizedFile === normalizedRoot ||
		normalizedFile.startsWith(`${normalizedRoot}/`)
	);
}

async function getFilesFromGitDiff(
	mode: "staged" | "changed",
	targetRoot: string,
): Promise<string[]> {
	const args =
		mode === "staged"
			? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
			: ["diff", "HEAD", "--name-only", "--diff-filter=ACMR"];
	const { stdout } = await execFileAsync("git", args, { encoding: "utf8" });
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(
			(line) =>
				line.length > 0 &&
				isPathInsideTargetRoot(line, targetRoot) &&
				HTML_FILE_PATTERN.test(line),
		);
}

async function collectHtmlFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectHtmlFiles(entryPath)));
			continue;
		}
		if (entry.isFile() && HTML_FILE_PATTERN.test(entry.name)) {
			files.push(entryPath);
		}
	}
	return files;
}

async function disableMotion(page: Page): Promise<void> {
	await page.addStyleTag({
		content:
			"*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;}",
	});
}

function normalizeViolations(raw: unknown): AxeViolation[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw
		.map((item) => item as Record<string, unknown>)
		.filter((item) => typeof item.id === "string" && Array.isArray(item.nodes))
		.map((item) => ({
			id: String(item.id),
			impact: item.impact ? String(item.impact) : undefined,
			description: String(item.description || ""),
			help: String(item.help || ""),
			helpUrl: String(item.helpUrl || ""),
			nodes: (item.nodes as unknown[]).map((node) => {
				const record = (node || {}) as Record<string, unknown>;
				return {
					html: typeof record.html === "string" ? record.html : undefined,
					target: Array.isArray(record.target)
						? record.target.map((value) =>
								typeof value === "string" ? value : String(value),
							)
						: undefined,
					failureSummary:
						typeof record.failureSummary === "string"
							? record.failureSummary
							: undefined,
				};
			}),
		}));
}

async function runAxeForFile(file: string): Promise<FileA11yResult> {
	const html = await readFile(file, "utf8");
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: "domcontentloaded" });
		await page.addScriptTag({ content: axe.source });
		const rawViolations = await page.evaluate(
			async (ruleTags: string[]) => {
				const axeRuntime = (window as unknown as { axe?: AxeRuntime }).axe;
				if (!axeRuntime?.run) {
					throw new Error("axe runtime missing in browser context");
				}
				const result = await axeRuntime.run(document, {
					runOnly: { type: "tag", values: ruleTags },
				});
				return result.violations;
			},
			[...WCAG_22_AA_RULE_TAGS],
		);
		return {
			file,
			violations: normalizeViolations(rawViolations),
		};
	} finally {
		await browser.close();
	}
}

function printResults(results: FileA11yResult[]): void {
	const total = results.reduce((sum, item) => sum + item.violations.length, 0);
	console.log(
		`[uiux-a11y] scanned_files=${results.length} total_violations=${total}`,
	);
	for (const result of results) {
		for (const violation of result.violations) {
			for (const node of violation.nodes) {
				const target =
					node.target && node.target.length > 0
						? node.target.join(" ")
						: "<unknown-target>";
				console.log(
					`[uiux-a11y][error] ${result.file} [${violation.id}] ${violation.help} (${target})`,
				);
			}
		}
	}
}

async function run(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const targetRoot = resolveTargetRoot(options);
	const cliFiles = process.argv
		.slice(2)
		.filter((token) => !token.startsWith("--"))
		.filter((token) => HTML_FILE_PATTERN.test(token));
	const files =
		options.mode === "files"
			? cliFiles
			: await getFilesFromGitDiff(options.mode, targetRoot);
	const dedupedFiles = Array.from(new Set(files)).slice(0, options.maxFiles);
	if (dedupedFiles.length === 0) {
		console.log(
			"[uiux-a11y] skipped: no auditable html files under the selected target root.",
		);
		process.exit(0);
	}

	const results: FileA11yResult[] = [];
	for (const file of dedupedFiles) {
		results.push(await runAxeForFile(file));
	}
	printResults(results);

	if (options.strict && shouldFailStrictA11y(results)) {
		console.error(
			"[uiux-a11y] failed: strict mode found accessibility issues.",
		);
		process.exit(1);
	}
	console.log("[uiux-a11y] passed.");
}

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	run().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[uiux-a11y] failed: ${message}`);
		process.exit(1);
	});
}
