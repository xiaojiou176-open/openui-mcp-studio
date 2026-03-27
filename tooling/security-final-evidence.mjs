#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runPiiAudit } from "./pii-audit.mjs";

const DEFAULT_REPORT_ROOT = ".runtime-cache/reports/security";

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function formatMarkdownDate(value) {
	return new Date(value).toISOString();
}

function formatMarkdownList(items) {
	return items.map((item) => `- ${item}`).join("\n");
}

function runCommandCapture(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return {
		command,
		args,
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

async function readJsonIfExists(filePath) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch {
		return null;
	}
}

function summarizeScancodeReport(report) {
	if (!report || typeof report !== "object") {
		return {
			scannedFileCount: null,
			licenseFindingCount: null,
			copyrightFindingCount: null,
			emailFindingCount: null,
			urlFindingCount: null,
		};
	}

	const files = Array.isArray(report.files) ? report.files : [];
	let licenseFindingCount = 0;
	let copyrightFindingCount = 0;
	let emailFindingCount = 0;
	let urlFindingCount = 0;
	for (const file of files) {
		licenseFindingCount += Array.isArray(file.licenses) ? file.licenses.length : 0;
		copyrightFindingCount += Array.isArray(file.copyrights)
			? file.copyrights.length
			: 0;
		emailFindingCount += Array.isArray(file.emails) ? file.emails.length : 0;
		urlFindingCount += Array.isArray(file.urls) ? file.urls.length : 0;
	}
	return {
		scannedFileCount: files.length,
		licenseFindingCount,
		copyrightFindingCount,
		emailFindingCount,
		urlFindingCount,
	};
}

function formatPiiMarkdown(report) {
	return [
		"# PII Final Evidence",
		"",
		`- Generated at: ${formatMarkdownDate(report.generatedAt)}`,
		`- Command: \`${report.command}\``,
		`- Raw report: \`${report.rawReportPath}\``,
		`- Findings: **${report.findingCount}**`,
		`- Scanned files: **${report.scannedFileCount}**`,
		"",
		"## Boundary",
		"",
		formatMarkdownList(report.boundaryNotes),
		"",
	].join("\n");
}

function formatScancodeMarkdown(report) {
	return [
		"# ScanCode Keyfiles Final Evidence",
		"",
		`- Generated at: ${formatMarkdownDate(report.generatedAt)}`,
		`- Command: \`${report.command}\``,
		`- Raw report: \`${report.rawReportPath}\``,
		`- Exit code: **${report.exitCode}**`,
		`- Scanned files: **${report.scannedFileCount ?? "unknown"}**`,
		`- License findings: **${report.licenseFindingCount ?? "unknown"}**`,
		`- Copyright findings: **${report.copyrightFindingCount ?? "unknown"}**`,
		`- Email findings: **${report.emailFindingCount ?? "unknown"}**`,
		`- URL findings: **${report.urlFindingCount ?? "unknown"}**`,
		"",
		"## Boundary",
		"",
		formatMarkdownList(report.boundaryNotes),
		"",
	].join("\n");
}

function formatSummaryMarkdown(report) {
	return [
		"# Security Final Evidence Summary",
		"",
		`- Generated at: ${formatMarkdownDate(report.generatedAt)}`,
		"",
		"| Evidence | Status | Raw report |",
		"| --- | --- | --- |",
		`| PII heuristic audit | ${report.pii.ok ? "passed" : "failed"} | \`${report.pii.rawReportPath}\` |`,
		`| ScanCode keyfiles audit | ${report.scancode.ok ? "passed" : "failed"} | \`${report.scancode.rawReportPath}\` |`,
		"",
		"## Notes",
		"",
		formatMarkdownList(report.notes),
		"",
	].join("\n");
}

async function writeJsonAndMarkdown(rootDir, baseName, report, markdownFormatter) {
	const jsonPath = path.resolve(rootDir, DEFAULT_REPORT_ROOT, `${baseName}.json`);
	const markdownPath = path.resolve(rootDir, DEFAULT_REPORT_ROOT, `${baseName}.md`);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${markdownFormatter(report)}\n`, "utf8"),
	]);
	return {
		jsonPath: toPosixPath(path.relative(rootDir, jsonPath)),
		markdownPath: toPosixPath(path.relative(rootDir, markdownPath)),
	};
}

async function runSecurityFinalEvidence(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const reportRoot = path.resolve(rootDir, DEFAULT_REPORT_ROOT);
	await fs.mkdir(reportRoot, { recursive: true });

	const piiResult = await runPiiAudit({ rootDir });
	const piiReport = {
		generatedAt: new Date().toISOString(),
		command: "npm run security:pii:audit",
		rawReportPath: piiResult.reportPath,
		ok: piiResult.ok,
		findingCount: Number(piiResult.report.findingCount ?? 0),
		scannedFileCount: Number(piiResult.report.scannedFileCount ?? 0),
		boundaryNotes: [
			"Repo-side heuristic evidence only.",
			"Scans tracked text files for email addresses and phone-like contact fields.",
			"Does not replace formal DLP, privacy review, or legal review.",
		],
	};
	const piiEvidencePaths = await writeJsonAndMarkdown(
		rootDir,
		"pii-final-evidence",
		piiReport,
		formatPiiMarkdown,
	);

	const scancodeRawReportPath = path.resolve(
		rootDir,
		DEFAULT_REPORT_ROOT,
		"scancode-keyfiles.json",
	);
	const scancodeCommand = runCommandCapture(
		"bash",
		[
			"tooling/scancode-keyfiles-audit.sh",
			"--report-path",
			toPosixPath(path.relative(rootDir, scancodeRawReportPath)),
		],
		{ cwd: rootDir },
	);
	if (scancodeCommand.exitCode !== 0) {
		throw new Error(
			`ScanCode keyfiles audit failed: ${scancodeCommand.stderr.trim() || scancodeCommand.stdout.trim() || "unknown error"}`,
		);
	}
	const scancodeRawReport = await readJsonIfExists(scancodeRawReportPath);
	const scancodeSummary = summarizeScancodeReport(scancodeRawReport);
	const scancodeReport = {
		generatedAt: new Date().toISOString(),
		command: "npm run security:scancode:keyfiles",
		rawReportPath: toPosixPath(path.relative(rootDir, scancodeRawReportPath)),
		ok: scancodeCommand.exitCode === 0,
		exitCode: scancodeCommand.exitCode,
		...scancodeSummary,
		boundaryNotes: [
			"Scans legal and manifest keyfiles only.",
			"Captures license, copyright, email, and URL evidence for public-release review.",
			"Does not replace full legal review.",
		],
	};
	const scancodeEvidencePaths = await writeJsonAndMarkdown(
		rootDir,
		"scancode-keyfiles-final-evidence",
		scancodeReport,
		formatScancodeMarkdown,
	);

	const summaryReport = {
		generatedAt: new Date().toISOString(),
		pii: {
			ok: piiReport.ok,
			rawReportPath: piiReport.rawReportPath,
			evidenceJsonPath: piiEvidencePaths.jsonPath,
			evidenceMarkdownPath: piiEvidencePaths.markdownPath,
		},
		scancode: {
			ok: scancodeReport.ok,
			rawReportPath: scancodeReport.rawReportPath,
			evidenceJsonPath: scancodeEvidencePaths.jsonPath,
			evidenceMarkdownPath: scancodeEvidencePaths.markdownPath,
		},
		notes: [
			"PII final evidence remains heuristic by design and must not be described as formal DLP.",
			"ScanCode evidence covers key legal and manifest surfaces, not every file in the repository.",
		],
	};
	const summaryPaths = await writeJsonAndMarkdown(
		rootDir,
		"security-final-evidence-summary",
		summaryReport,
		formatSummaryMarkdown,
	);

	return {
		ok: piiReport.ok && scancodeReport.ok,
		piiEvidence: piiEvidencePaths,
		scancodeEvidence: scancodeEvidencePaths,
		summary: summaryPaths,
	};
}

async function main() {
	try {
		const result = await runSecurityFinalEvidence();
		console.log(JSON.stringify(result, null, 2));
		process.exitCode = result.ok ? 0 : 1;
	} catch (error) {
		console.error(
			`[security-final-evidence] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	void main();
}

export { runSecurityFinalEvidence };
