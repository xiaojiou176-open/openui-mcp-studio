#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import {
	buildUiuxAuditFrame,
	buildUiuxStylePromptContext,
	resolveUiuxStylePack,
	type UiuxAuditCategoryId,
	type UiuxAuditFrame,
} from "../services/mcp-server/src/public/uiux-audit-foundation.js";
import { openuiChatComplete } from "../services/mcp-server/src/public/openui-client.js";
import { resetGeminiProviderForTests } from "../services/mcp-server/src/public/provider-testing.js";
import { newRequestId } from "../services/mcp-server/src/public/tool-shared.js";

const execFileAsync = promisify(execFile);

const FRONTEND_FILE_PATTERN = /\.(tsx|jsx|html?|css|scss)$/iu;
const FRONTEND_STYLE_PATTERN = /\.(html?|css|scss)$/iu;
const FRONTEND_CODE_PATH_HINT =
	/(?:^|\/)(?:app|pages|components|styles|theme|templates?|layouts?|ui)(?:\/|$)/u;
const NEXT_ENTRY_FILE_HINT =
	/(?:^|\/)(?:page|layout|loading|error|not-found|template)\.(?:tsx?|jsx?)$/iu;
const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_TOTAL_CHARS = 48_000;
const DEFAULT_MAX_DIFF_CHARS = 24_000;
const DEFAULT_MODEL = "gemini-3-flash-preview";
const STRICT_AUDIT_TIMEOUT_MS_FLOOR = 120_000;
const STRICT_AUDIT_MAX_RETRIES_FLOOR = 5;
const DEFAULT_AUDIT_TARGET_ROOT = "apps/web";
const FULL_SITE_SCAN_DIRS = Object.freeze(["app", "components", "lib"]);
const ISSUE_CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);
const ISSUE_IMPACT_VALUES = new Set(["low", "medium", "high"]);
const ISSUE_SOURCE_VALUES = new Set(["model", "heuristic"]);

type CliOptions = {
	mode: "files" | "staged" | "changed";
	strict: boolean;
	failOnWarnings: boolean;
	maxWarnings: number;
	vision: boolean;
	fullSite: boolean;
	maxFiles: number;
	targetRoot?: string;
	stylePackId?: string;
};

type AuditIssue = {
	file: string;
	severity: "error" | "warning";
	category:
		| "accessibility"
		| "design_system"
		| "usability"
		| "responsive"
		| "code_quality";
	ruleId?: string;
	line?: number;
	message: string;
	fix: string;
	confidence: "low" | "medium" | "high";
	impact: "low" | "medium" | "high";
	evidenceSnippet: string;
	source: "model" | "heuristic";
};

type AuditResult = {
	status: "pass" | "fail";
	summary: string;
	issues: AuditIssue[];
};

const SYNTAX_FALSE_POSITIVE_PATTERN =
	/syntax error|\btruncated\b|compilation error|runtime crash|prevent the application from compiling/iu;

export function shouldFailMissingGeminiKey(options: {
	strict: boolean;
	frontendFileCount: number;
}): boolean {
	return options.strict && options.frontendFileCount > 0;
}

export function isFrontendAuditCandidate(file: string): boolean {
	const normalized = file.replaceAll("\\", "/");
	if (!FRONTEND_FILE_PATTERN.test(normalized)) {
		return false;
	}
	if (FRONTEND_STYLE_PATTERN.test(normalized)) {
		return true;
	}
	return (
		FRONTEND_CODE_PATH_HINT.test(normalized) ||
		NEXT_ENTRY_FILE_HINT.test(normalized)
	);
}

function splitGitDiffByFile(raw: string): string[] {
	if (raw.trim().length === 0) {
		return [];
	}
	return raw
		.split(/^diff --git /mu)
		.filter((segment) => segment.trim().length > 0)
		.map((segment) => `diff --git ${segment}`.trimEnd());
}

function readDiffSegmentFile(segment: string): string {
	const match = segment.match(/^diff --git a\/(.+?) b\/(.+)$/mu);
	return match?.[2] ?? "<unknown-file>";
}

export function clipDiffByFileBudget(
	raw: string,
	maxChars: number,
): { text: string; truncatedFiles: string[] } {
	if (raw.length <= maxChars) {
		return { text: raw, truncatedFiles: [] };
	}
	if (maxChars <= 0) {
		return { text: "", truncatedFiles: ["<diff-budget-exhausted>"] };
	}

	const segments = splitGitDiffByFile(raw);
	if (segments.length <= 1) {
		return {
			text: raw.slice(0, maxChars),
			truncatedFiles: ["<single-diff-truncated>"],
		};
	}

	const perSegmentBudget = Math.max(
		320,
		Math.floor(maxChars / segments.length),
	);
	const chunks: string[] = [];
	const truncatedFiles: string[] = [];
	let remaining = maxChars;

	for (const segment of segments) {
		if (remaining <= 0) {
			truncatedFiles.push(readDiffSegmentFile(segment));
			continue;
		}

		const file = readDiffSegmentFile(segment);
		if (segment.length <= remaining && segment.length <= perSegmentBudget) {
			chunks.push(segment);
			remaining -= segment.length;
			continue;
		}

		const notice = `\n[uiux-audit] diff segment truncated for ${file}; originalChars=${segment.length}.\n`;
		const allowed = Math.max(
			0,
			Math.min(
				segment.length,
				Math.min(remaining, perSegmentBudget) - notice.length,
			),
		);
		if (allowed <= 0) {
			truncatedFiles.push(file);
			continue;
		}
		const clipped = `${segment.slice(0, allowed).trimEnd()}${notice}`;
		chunks.push(clipped);
		remaining -= clipped.length;
		if (allowed < segment.length) {
			truncatedFiles.push(file);
		}
	}

	if (chunks.length === 0) {
		return {
			text: raw.slice(0, maxChars),
			truncatedFiles: ["<diff-budget-exhausted>"],
		};
	}

	const omittedFromBody = Array.from(new Set(truncatedFiles)).filter(
		(file) => !chunks.some((chunk) => chunk.includes(file)),
	);
	if (omittedFromBody.length > 0) {
		const summary = `\n[uiux-audit] additional truncated diff files: ${omittedFromBody.join(", ")}.`;
		if (summary.length <= remaining) {
			chunks.push(summary.trimStart());
		} else {
			const last = chunks.pop() ?? "";
			const keep = Math.max(0, maxChars - summary.length);
			const prefix = chunks.join("\n\n");
			const prefixBudget = Math.max(
				0,
				keep - prefix.length - (prefix.length > 0 ? 2 : 0),
			);
			const trimmedLast = last.slice(0, prefixBudget).trimEnd();
			const rebuilt = [prefix, trimmedLast]
				.filter((value) => value.length > 0)
				.join("\n\n");
			chunks.length = 0;
			chunks.push(`${rebuilt}${summary}`);
		}
	}

	return {
		text: chunks.join("\n\n"),
		truncatedFiles: Array.from(new Set(truncatedFiles)),
	};
}

export function shouldFailStrictAudit(
	result: AuditResult,
	options?: { failOnWarnings?: boolean; maxWarnings?: number },
): boolean {
	const hasError = result.issues.some(
		(issue) =>
			issue.severity === "error" && (issue.source ?? "heuristic") !== "model",
	);
	if (hasError) {
		return true;
	}
	const failOnWarnings = options?.failOnWarnings ?? true;
	if (!failOnWarnings) {
		return false;
	}
	const maxWarnings = Math.max(0, Math.floor(options?.maxWarnings ?? 0));
	const warningCount = result.issues.filter(
		(issue) =>
			issue.severity === "warning" && (issue.source ?? "heuristic") !== "model",
	).length;
	return warningCount > maxWarnings;
}

export function resolveUiuxAuditTimeoutMs(options: {
	strict: boolean;
	currentTimeoutMs: string | undefined;
}): string | undefined {
	if (!options.strict) {
		return options.currentTimeoutMs;
	}

	const raw = options.currentTimeoutMs?.trim();
	if (!raw) {
		return String(STRICT_AUDIT_TIMEOUT_MS_FLOOR);
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return String(STRICT_AUDIT_TIMEOUT_MS_FLOOR);
	}

	return String(Math.max(parsed, STRICT_AUDIT_TIMEOUT_MS_FLOOR));
}

export function resolveUiuxAuditMaxRetries(options: {
	strict: boolean;
	currentMaxRetries: string | undefined;
}): string | undefined {
	if (!options.strict) {
		return options.currentMaxRetries;
	}

	const raw = options.currentMaxRetries?.trim();
	if (!raw) {
		return String(STRICT_AUDIT_MAX_RETRIES_FLOOR);
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return String(STRICT_AUDIT_MAX_RETRIES_FLOOR);
	}

	return String(Math.max(Math.floor(parsed), STRICT_AUDIT_MAX_RETRIES_FLOOR));
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		mode: "files",
		strict: false,
		failOnWarnings: false,
		maxWarnings: 0,
		vision: false,
		fullSite: false,
		maxFiles: DEFAULT_MAX_FILES,
		targetRoot: undefined,
		stylePackId: undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--strict") {
			options.strict = true;
			options.failOnWarnings = true;
			continue;
		}
		if (token === "--allow-warnings") {
			options.failOnWarnings = false;
			continue;
		}
		if (token === "--fail-on-warnings") {
			options.failOnWarnings = true;
			continue;
		}
		if (token === "--vision") {
			options.vision = true;
			continue;
		}
		if (token === "--full-site") {
			options.fullSite = true;
			continue;
		}
		if (token === "--compat-fixture") {
			throw new Error(
				"--compat-fixture has been removed. apps/web is the only default UIUX audit target.",
			);
		}
		if (token === "--target-root") {
			options.targetRoot = argv[index + 1];
			index += 1;
			continue;
		}
		if (token === "--style-pack") {
			options.stylePackId = argv[index + 1];
			index += 1;
			continue;
		}
		if (token.startsWith("--target-root=")) {
			options.targetRoot = token.slice("--target-root=".length);
			continue;
		}
		if (token.startsWith("--style-pack=")) {
			options.stylePackId = token.slice("--style-pack=".length);
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
			continue;
		}
		if (token.startsWith("--max-warnings=")) {
			const parsed = Number(token.slice("--max-warnings=".length));
			if (Number.isInteger(parsed) && parsed >= 0) {
				options.maxWarnings = parsed;
				options.failOnWarnings = true;
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

function resolveTargetRoot(options: CliOptions): string {
	const candidate = options.targetRoot?.trim();
	if (candidate) {
		return normalizeRepoPath(candidate);
	}
	return DEFAULT_AUDIT_TARGET_ROOT;
}

function isPathInsideTargetRoot(file: string, targetRoot: string): boolean {
	const normalizedFile = normalizeRepoPath(file);
	const normalizedRoot = normalizeRepoPath(targetRoot).replace(/\/+$/u, "");
	return (
		normalizedFile === normalizedRoot ||
		normalizedFile.startsWith(`${normalizedRoot}/`)
	);
}

function stripFencedJson(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("```")) {
		return trimmed;
	}
	return trimmed
		.replace(/^```(?:json)?\s*/iu, "")
		.replace(/\s*```$/u, "")
		.trim();
}

function isAuditResult(value: unknown): value is AuditResult {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Record<string, unknown>;
	if (record.status !== "pass" && record.status !== "fail") {
		return false;
	}
	if (typeof record.summary !== "string") {
		return false;
	}
	if (!Array.isArray(record.issues)) {
		return false;
	}
	return true;
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
				isFrontendAuditCandidate(line),
		);
}

async function collectFrontendFilesRecursively(
	rootDir: string,
	maxCount: number,
): Promise<string[]> {
	const resolved: string[] = [];
	const stack = [rootDir];

	while (stack.length > 0 && resolved.length < maxCount) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		let entries: Awaited<ReturnType<typeof readdir>>;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const absolutePath = path.resolve(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
				continue;
			}
			if (!entry.isFile()) {
				continue;
			}
			const relativePath = normalizeRepoPath(
				path.relative(process.cwd(), absolutePath),
			);
			if (!isFrontendAuditCandidate(relativePath)) {
				continue;
			}
			resolved.push(relativePath);
			if (resolved.length >= maxCount) {
				break;
			}
		}
	}

	return resolved.sort((a, b) => a.localeCompare(b));
}

async function resolveFullSiteFrontendFiles(
	targetRoot: string,
	maxFiles: number,
): Promise<string[]> {
	const fullSiteRoot = path.resolve(process.cwd(), targetRoot);
	const candidates: string[] = [];
	for (const dir of FULL_SITE_SCAN_DIRS) {
		const absolute = path.resolve(fullSiteRoot, dir);
		const files = await collectFrontendFilesRecursively(absolute, maxFiles);
		candidates.push(...files);
	}
	const deduped = Array.from(new Set(candidates));
	if (deduped.length > 0) {
		return deduped.slice(0, maxFiles);
	}
	return [];
}

async function readFilesWithBudget(
	files: string[],
	maxTotalChars: number,
): Promise<string> {
	let total = 0;
	const chunks: string[] = [];

	for (const file of files) {
		const raw = await readFile(file, "utf8");
		if (raw.trim().length === 0) {
			continue;
		}
		const remaining = maxTotalChars - total;
		if (remaining <= 0) {
			break;
		}
		const clipped = raw.slice(0, remaining);
		total += clipped.length;
		chunks.push(`### FILE: ${file}\n${clipped}`);
	}

	return chunks.join("\n\n");
}

async function readDiffWithBudget(
	files: string[],
	mode: "files" | "staged" | "changed",
): Promise<string> {
	if (files.length === 0) {
		return "";
	}
	const baseArgs =
		mode === "staged"
			? ["diff", "--cached", "--unified=3", "--"]
			: mode === "changed"
				? ["diff", "HEAD", "--unified=3", "--"]
				: ["diff", "--cached", "--unified=3", "--"];
	const { stdout } = await execFileAsync("git", [...baseArgs, ...files], {
		encoding: "utf8",
	});
	const clipped = clipDiffByFileBudget(stdout, DEFAULT_MAX_DIFF_CHARS);
	if (clipped.truncatedFiles.length > 0) {
		console.log(
			`[uiux-audit] diff context truncated from ${stdout.length} to ${clipped.text.length} characters across ${clipped.truncatedFiles.length} file(s): ${clipped.truncatedFiles.join(", ")}.`,
		);
	}
	return clipped.text;
}

function normalizeIssue(rawIssue: AuditIssue): AuditIssue {
	const confidence = ISSUE_CONFIDENCE_VALUES.has(rawIssue.confidence)
		? rawIssue.confidence
		: "medium";
	const impact = ISSUE_IMPACT_VALUES.has(rawIssue.impact)
		? rawIssue.impact
		: rawIssue.severity === "error"
			? "high"
			: "medium";
	const source = ISSUE_SOURCE_VALUES.has(rawIssue.source)
		? rawIssue.source
		: "model";
	const evidenceSnippet =
		typeof rawIssue.evidenceSnippet === "string" &&
		rawIssue.evidenceSnippet.trim().length > 0
			? rawIssue.evidenceSnippet.trim().slice(0, 240)
			: `${rawIssue.file}${rawIssue.line ? `:${rawIssue.line}` : ""}`;
	return {
		...rawIssue,
		confidence,
		impact,
		source,
		evidenceSnippet,
	};
}

export function normalizeAuditResult(result: AuditResult): AuditResult {
	return {
		...result,
		issues: result.issues.map((issue) => normalizeIssue(issue)),
	};
}

export function summarizeIssueCounts(issues: AuditIssue[]): {
	errors: number;
	warnings: number;
	byCategory: string;
	bySource: string;
	byImpact: string;
} {
	const errors = issues.filter((issue) => issue.severity === "error").length;
	const warnings = issues.length - errors;
	const byCategoryMap = new Map<string, number>();
	const bySourceMap = new Map<string, number>();
	const byImpactMap = new Map<string, number>();

	for (const issue of issues) {
		byCategoryMap.set(
			issue.category,
			(byCategoryMap.get(issue.category) ?? 0) + 1,
		);
		bySourceMap.set(issue.source, (bySourceMap.get(issue.source) ?? 0) + 1);
		byImpactMap.set(issue.impact, (byImpactMap.get(issue.impact) ?? 0) + 1);
	}

	const serialize = (map: Map<string, number>): string =>
		Array.from(map.entries())
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, count]) => `${key}:${String(count)}`)
			.join(",");

	return {
		errors,
		warnings,
		byCategory: serialize(byCategoryMap),
		bySource: serialize(bySourceMap),
		byImpact: serialize(byImpactMap),
	};
}

function dedupeAuditCategories(
	categories: UiuxAuditCategoryId[],
): UiuxAuditCategoryId[] {
	return Array.from(new Set(categories));
}

export function buildWorkspaceAuditFileHotspots(
	issues: AuditIssue[],
): UiuxAuditFrame["fileHotspots"] {
	const fileMap = new Map<
		string,
		{ issueCount: number; categories: UiuxAuditCategoryId[] }
	>();

	for (const issue of issues) {
		const existing = fileMap.get(issue.file) ?? {
			issueCount: 0,
			categories: [],
		};
		const mappedCategory =
			issue.category === "accessibility"
				? "accessibility"
				: issue.category === "design_system"
					? "design_system"
					: issue.category === "responsive"
						? "consistency"
						: issue.category === "usability"
							? "interaction_clarity"
							: "consistency";
		existing.issueCount += 1;
		existing.categories.push(mappedCategory);
		fileMap.set(issue.file, existing);
	}

	return Array.from(fileMap.entries())
		.map(([file, value]) => ({
			file,
			issueCount: value.issueCount,
			categories: dedupeAuditCategories(value.categories),
		}))
		.sort((left, right) => {
			if (left.issueCount !== right.issueCount) {
				return right.issueCount - left.issueCount;
			}
			return left.file.localeCompare(right.file);
		})
		.slice(0, 5);
}

export function buildWorkspaceAuditFrame(input: {
	targetRoot: string;
	auditableFileCount: number;
	issues: AuditIssue[];
	stylePackId?: string;
}): UiuxAuditFrame {
	const stylePack = resolveUiuxStylePack(input.stylePackId);
	return buildUiuxAuditFrame({
		scope: "workspace",
		target: input.targetRoot,
		stylePackId: stylePack.id,
		issues: input.issues.map((issue) => ({
			id: issue.ruleId,
			severity: issue.severity,
			title: issue.message,
			detail: issue.message,
			recommendation: issue.fix,
			priority: issue.severity === "error" ? "p1" : "p2",
			category: issue.category,
			message: issue.message,
			fix: issue.fix,
			file: issue.file,
			source: issue.source,
		})),
		fileHotspots: buildWorkspaceAuditFileHotspots(input.issues),
		auditableFileCount: input.auditableFileCount,
	});
}

function printWorkspaceAuditFrame(frame: UiuxAuditFrame): void {
	console.log(
		`[uiux-audit][frame] scope=${frame.scope} target=${frame.target} stylePack=${frame.stylePack.id} auditedFiles=${String(frame.auditableFileCount ?? 0)}`,
	);
	console.log(`[uiux-audit][frame] ${frame.summary}`);
	console.log(
		`[uiux-audit][signals] verdict=${frame.automatedSignals.verdict} issues=${String(frame.automatedSignals.issueCount)} blocking=${String(frame.automatedSignals.blockingIssueCount)} watchCategories=${String(frame.automatedSignals.watchedCategoryCount)} hotspots=${String(frame.automatedSignals.hotspotCount)} sources=${frame.automatedSignals.sourceKinds.join(",") || "none"}`,
	);
	console.log(
		`[uiux-audit][manual] required=${frame.manualReview.required ? "true" : "false"} focus=${frame.manualReview.focusAreas.join(",") || "none"} reason=${frame.manualReview.reason}`,
	);
	if (frame.nextOperatorMove) {
		console.log(
			`[uiux-audit][move:${frame.nextOperatorMove.priority}] [${frame.nextOperatorMove.category}] ${frame.nextOperatorMove.title} -> ${frame.nextOperatorMove.detail}`,
		);
	}
	for (const category of frame.categories) {
		console.log(
			`[uiux-audit][category:${category.id}] status=${category.status} issues=${String(category.issueCount)} blocking=${String(category.blockingIssueCount)} ${category.summary}`,
		);
	}
	for (const hotspot of frame.fileHotspots) {
		console.log(
			`[uiux-audit][hotspot] ${hotspot.file} issues=${String(hotspot.issueCount)} categories=${hotspot.categories.join(",")}`,
		);
	}
	for (const nextStep of frame.nextSteps) {
		console.log(
			`[uiux-audit][next:${nextStep.priority}] [${nextStep.category}] ${nextStep.title} -> ${nextStep.detail}`,
		);
	}
}

function formatEvidenceSnippet(snippet: string): string {
	return snippet.replace(/\s+/gu, " ").trim().slice(0, 120);
}

function resolveScriptKind(filePath: string): ts.ScriptKind {
	if (filePath.endsWith(".tsx")) {
		return ts.ScriptKind.TSX;
	}
	if (filePath.endsWith(".ts")) {
		return ts.ScriptKind.TS;
	}
	if (filePath.endsWith(".jsx")) {
		return ts.ScriptKind.JSX;
	}
	if (filePath.endsWith(".js")) {
		return ts.ScriptKind.JS;
	}
	return ts.ScriptKind.Unknown;
}

function hasParseDiagnostics(filePath: string, source: string): boolean {
	const scriptKind = resolveScriptKind(filePath);
	if (scriptKind === ts.ScriptKind.Unknown) {
		return false;
	}
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind,
	);
	return sourceFile.parseDiagnostics.length > 0;
}

function extractHslTriplets(text: string): Array<[number, number, number]> {
	const matches = text.matchAll(
		/HSL\s+(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%/giu,
	);
	return Array.from(matches, (match) => [
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
	]).filter((triplet) =>
		triplet.every((value) => Number.isFinite(value)),
	) as Array<[number, number, number]>;
}

function hslToRgb(
	hue: number,
	saturation: number,
	lightness: number,
): [number, number, number] {
	const normalizedSaturation = saturation / 100;
	const normalizedLightness = lightness / 100;
	const channel = (index: number) => {
		const k = (index + hue / 30) % 12;
		const a =
			normalizedSaturation *
			Math.min(normalizedLightness, 1 - normalizedLightness);
		return (
			normalizedLightness -
			a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
		);
	};
	return [channel(0), channel(8), channel(4)];
}

function relativeLuminance([red, green, blue]: [
	number,
	number,
	number,
]): number {
	const toLinear = (value: number) =>
		value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	return (
		0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
	);
}

function calculateContrastRatio(
	left: [number, number, number],
	right: [number, number, number],
): number {
	const [lighter, darker] = [
		relativeLuminance(left),
		relativeLuminance(right),
	].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

function requiredContrastRatio(text: string): number | null {
	const match = text.match(/(\d+(?:\.\d+)?)\s*:\s*1/iu);
	if (!match) {
		return null;
	}
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

export async function filterDeterministicFalsePositives(
	issues: AuditIssue[],
): Promise<{ issues: AuditIssue[]; filteredCount: number }> {
	const kept: AuditIssue[] = [];
	let filteredCount = 0;
	const parseStatusCache = new Map<string, boolean>();

	for (const issue of issues) {
		const looksLikeSyntaxHallucination =
			issue.category === "code_quality" &&
			issue.ruleId === "code_quality_state_integrity" &&
			SYNTAX_FALSE_POSITIVE_PATTERN.test(`${issue.message} ${issue.fix}`);
		if (!looksLikeSyntaxHallucination) {
			const looksLikeContrastHallucination = /contrast/iu.test(
				`${issue.ruleId ?? ""} ${issue.message} ${issue.fix}`,
			);
			if (looksLikeContrastHallucination) {
				const triplets = extractHslTriplets(`${issue.message} ${issue.fix}`);
				const threshold = requiredContrastRatio(
					`${issue.message} ${issue.fix}`,
				);
				if (triplets.length >= 2 && threshold !== null) {
					const actualContrast = calculateContrastRatio(
						hslToRgb(...triplets[0]),
						hslToRgb(...triplets[1]),
					);
					if (actualContrast >= threshold) {
						filteredCount += 1;
						continue;
					}
				}
			}

			kept.push(issue);
			continue;
		}

		const absolutePath = path.resolve(process.cwd(), issue.file);
		let hasDiagnostics = parseStatusCache.get(absolutePath);
		if (hasDiagnostics === undefined) {
			try {
				const source = await readFile(absolutePath, "utf8");
				hasDiagnostics = hasParseDiagnostics(issue.file, source);
			} catch {
				hasDiagnostics = true;
			}
			parseStatusCache.set(absolutePath, hasDiagnostics);
		}

		if (hasDiagnostics) {
			kept.push(issue);
			continue;
		}

		filteredCount += 1;
	}

	return { issues: kept, filteredCount };
}

function resolveCliFrontendFiles(argv: string[], targetRoot: string): string[] {
	return argv
		.filter((token) => !token.startsWith("--"))
		.map((token) => normalizeRepoPath(token))
		.filter((token) => isPathInsideTargetRoot(token, targetRoot))
		.filter((token) => isFrontendAuditCandidate(token));
}

async function ensureTargetRootExists(targetRoot: string): Promise<void> {
	const absolute = path.resolve(process.cwd(), targetRoot);
	try {
		await access(absolute);
	} catch {
		throw new Error(
			`[uiux-audit] target root does not exist: ${targetRoot}.`,
		);
	}
}

async function maybeLoadVisionInput(input: {
	enabled: boolean;
	targetRoot: string;
}): Promise<
	| {
			mimeType: string;
			base64Data: string;
			source: string;
		  }
		| undefined
> {
	const normalizedTargetRoot = normalizeRepoPath(input.targetRoot);
	if (!input.enabled || normalizedTargetRoot !== DEFAULT_AUDIT_TARGET_ROOT) {
		return undefined;
	}

	const candidates = [
		`.runtime-cache/runs/${
			process.env.OPENUI_RUNTIME_RUN_ID?.trim() || "playwright-local"
		}/artifacts/visual/apps-web-home.actual.png`,
		"tests/visual-golden/apps-web-home.png",
	];

	for (const file of candidates) {
		try {
			const buf = await readFile(file);
			if (buf.length === 0) {
				continue;
			}
			return {
				mimeType: "image/png",
				base64Data: buf.toString("base64"),
				source: file,
			};
		} catch {
			// Try next candidate.
		}
	}

	return undefined;
}

async function run(): Promise<void> {
	process.env.OPENUI_MCP_LOG_LEVEL =
		process.env.OPENUI_MCP_LOG_LEVEL || "error";
	process.env.OPENUI_MCP_LOG_OUTPUT =
		process.env.OPENUI_MCP_LOG_OUTPUT || "stderr";

	const options = parseArgs(process.argv.slice(2));
	const targetRoot = resolveTargetRoot(options);
	await ensureTargetRootExists(targetRoot);
	process.env.OPENUI_TIMEOUT_MS = resolveUiuxAuditTimeoutMs({
		strict: options.strict,
		currentTimeoutMs: process.env.OPENUI_TIMEOUT_MS,
	});
	process.env.OPENUI_MAX_RETRIES = resolveUiuxAuditMaxRetries({
		strict: options.strict,
		currentMaxRetries: process.env.OPENUI_MAX_RETRIES,
	});
	const cliFiles = resolveCliFrontendFiles(process.argv.slice(2), targetRoot);

	const model = process.env.GEMINI_MODEL_FAST?.trim() || DEFAULT_MODEL;
	const maxFiles = options.fullSite
		? Math.max(options.maxFiles, 32)
		: options.maxFiles;
	const files = options.fullSite
		? await resolveFullSiteFrontendFiles(targetRoot, maxFiles)
		: options.mode === "files"
			? cliFiles
			: await getFilesFromGitDiff(options.mode, targetRoot);

	const dedupedFiles = Array.from(new Set(files)).slice(0, maxFiles);
	if (dedupedFiles.length === 0) {
		if (options.strict) {
			console.error(
				`[uiux-audit] failed: strict mode found no auditable frontend files under ${targetRoot}.`,
			);
			process.exit(1);
		}
		console.log("[uiux-audit] skipped: no frontend files to audit.");
		process.exit(0);
	}
	if (options.fullSite) {
		console.log(
			`[uiux-audit] full-site mode activated: auditing ${dedupedFiles.length} frontend file(s) under ${targetRoot}.`,
		);
	}
	const geminiKey = process.env.GEMINI_API_KEY?.trim();
	if (!geminiKey) {
		const shouldFail = shouldFailMissingGeminiKey({
			strict: options.strict,
			frontendFileCount: dedupedFiles.length,
		});
		if (shouldFail) {
			console.error(
				`[uiux-audit] failed: GEMINI_API_KEY is required in strict mode when frontend files are present (files=${dedupedFiles.length}).`,
			);
			process.exit(1);
		}
		console.log(
			`[uiux-audit] skipped: GEMINI_API_KEY is not configured (files=${dedupedFiles.length}).`,
		);
		process.exit(0);
	}

	const codeContext = await readFilesWithBudget(
		dedupedFiles,
		DEFAULT_MAX_TOTAL_CHARS,
	);
	const diffContext = await readDiffWithBudget(dedupedFiles, options.mode);
	const visionInput = await maybeLoadVisionInput({
		enabled: options.vision,
		targetRoot,
	});
	const stylePack = resolveUiuxStylePack(options.stylePackId);
	const stylePromptContext = buildUiuxStylePromptContext(stylePack);

	const prompt = [
		"Audit the following frontend changes and return strict JSON.",
		"",
		stylePromptContext,
		"",
		"Focus areas:",
		"1) Accessibility (WCAG 2.2 AA, keyboard flow, semantic structure, contrast risks).",
		"2) UI consistency (design tokens, no hardcoded styles drift, hierarchy).",
		"3) UX quality (clarity, affordance, responsive behavior).",
		"4) Maintainability (over-complex render logic, low-signal class noise).",
		"",
		"Rules:",
		"- Only report concrete issues in provided files.",
		'- Severity "error" only for real blocking issues.',
		"- Every issue must include confidence, impact, evidenceSnippet, and source.",
		"- For code_quality errors, set ruleId to one of: code_quality_security_xss, code_quality_error_boundary_missing, code_quality_state_integrity, code_quality_hydration_mismatch.",
		"- Keep issue count concise and actionable.",
		"",
		`FILES:\n${dedupedFiles.join("\n")}`,
		"",
		diffContext ? `DIFF:\n${diffContext}` : "DIFF:\n<empty>",
		"",
		`CONTENT:\n${codeContext}`,
	].join("\n");

	const responseSchema: Record<string, unknown> = {
		type: "object",
		additionalProperties: false,
		properties: {
			status: { type: "string", enum: ["pass", "fail"] },
			summary: { type: "string", minLength: 1 },
			issues: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						file: { type: "string", minLength: 1 },
						severity: { type: "string", enum: ["error", "warning"] },
						category: {
							type: "string",
							enum: [
								"accessibility",
								"design_system",
								"usability",
								"responsive",
								"code_quality",
							],
						},
						ruleId: { type: "string", minLength: 1 },
						line: { type: "integer", minimum: 1 },
						message: { type: "string", minLength: 1 },
						fix: { type: "string", minLength: 1 },
						confidence: { type: "string", enum: ["low", "medium", "high"] },
						impact: { type: "string", enum: ["low", "medium", "high"] },
						evidenceSnippet: { type: "string", minLength: 1 },
						source: { type: "string", enum: ["model", "heuristic"] },
					},
					required: [
						"file",
						"severity",
						"category",
						"message",
						"fix",
						"confidence",
						"impact",
						"evidenceSnippet",
						"source",
					],
				},
			},
		},
		required: ["status", "summary", "issues"],
	};

	const inputParts = visionInput
		? [
				{
					type: "image" as const,
					mimeType: visionInput.mimeType,
					data: visionInput.base64Data,
					mediaResolution: "high" as const,
				},
			]
		: undefined;

	const raw = await openuiChatComplete({
		requestId: newRequestId("uiux_audit"),
		routeKey: "fast",
		model,
		system:
			"You are a principal frontend UI/UX auditor. Return JSON only, follow schema exactly, and keep output deterministic.",
		prompt,
		inputParts,
		responseMimeType: "application/json",
		responseJsonSchema: responseSchema,
		policyConfig: {
			structuredOutputRequired: true,
			uiWorkflow: true,
			autoIncludeThoughts: false,
			autoContextCaching: true,
			autoMediaResolution: true,
		},
	});

	const parsed = JSON.parse(stripFencedJson(raw));
	if (!isAuditResult(parsed)) {
		throw new Error("UI/UX audit returned invalid JSON shape.");
	}

	const normalizedResult = normalizeAuditResult(parsed);
	const filteredIssues = await filterDeterministicFalsePositives(
		normalizedResult.issues,
	);
	const result: AuditResult = {
		...normalizedResult,
		status:
			filteredIssues.issues.length === 0 && normalizedResult.status === "fail"
				? "pass"
				: normalizedResult.status,
		summary:
			filteredIssues.filteredCount > 0
				? `${normalizedResult.summary} Filtered ${filteredIssues.filteredCount} deterministic false-positive syntax issue(s).`
				: normalizedResult.summary,
		issues: filteredIssues.issues,
	};
	const issueCounts = summarizeIssueCounts(result.issues);
	const workspaceAudit = buildWorkspaceAuditFrame({
		targetRoot,
		auditableFileCount: dedupedFiles.length,
		issues: result.issues,
		stylePackId: stylePack.id,
	});
	const header = `[uiux-audit] model=${model} targetRoot=${targetRoot} files=${dedupedFiles.length} stylePack=${stylePack.id}${visionInput ? ` vision=${visionInput.source}` : ""}`;
	console.log(header);
	console.log(
		`[uiux-audit] summary status=${result.status} issues=${result.issues.length} errors=${issueCounts.errors} warnings=${issueCounts.warnings} categories=${issueCounts.byCategory || "none"} sources=${issueCounts.bySource || "none"} impacts=${issueCounts.byImpact || "none"}`,
	);
	console.log(`[uiux-audit] ${result.summary}`);
	printWorkspaceAuditFrame(workspaceAudit);

	const blockingIssues = result.issues.filter(
		(issue) => issue.severity === "error",
	);
	if (result.issues.length > 0) {
		for (const issue of result.issues) {
			const lineSuffix = issue.line ? `:${issue.line}` : "";
			const ruleSuffix =
				issue.ruleId && issue.ruleId.trim().length > 0
					? ` (${issue.ruleId})`
					: "";
			console.log(
				`[uiux-audit][${issue.severity}] ${issue.file}${lineSuffix} [${issue.category}${ruleSuffix}] [confidence=${issue.confidence} impact=${issue.impact} source=${issue.source}] ${issue.message} -> ${issue.fix} | evidence=${formatEvidenceSnippet(issue.evidenceSnippet)}`,
			);
		}
	}

	const strictFailed = options.strict
		? shouldFailStrictAudit(result, {
				failOnWarnings: options.failOnWarnings,
				maxWarnings: options.maxWarnings,
			})
		: false;
	if (strictFailed) {
		const warningCount = result.issues.filter(
			(issue) => issue.severity === "warning",
		).length;
		console.error(
			`[uiux-audit] failed: strict mode violation (status=${result.status}, issues=${result.issues.length}, blockingIssues=${blockingIssues.length}, warnings=${warningCount}, warningBudget=${options.maxWarnings}).`,
		);
		process.exit(1);
	}

	if (result.status === "fail") {
		console.log("[uiux-audit] completed with non-blocking fail status.");
		return;
	}
	console.log("[uiux-audit] passed.");
}

if (
	process.argv[1] &&
	pathToFileURL(process.argv[1]).href === import.meta.url
) {
	(async () => {
		let exitCode = 0;
		try {
			await run();
		} catch (error: unknown) {
			exitCode = 1;
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[uiux-audit] failed: ${message}`);
		} finally {
			await resetGeminiProviderForTests();
		}
		if (exitCode !== 0) {
			process.exit(exitCode);
		}
	})();
}
