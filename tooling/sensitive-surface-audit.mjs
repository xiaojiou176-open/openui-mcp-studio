#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTRACT_PATH = "tooling/contracts/sensitive-surface-audit.contract.json";
const EMAIL_REGEX = /\b([A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,}))\b/gu;
const PHONE_WITH_CONTEXT_REGEX =
	/\b(?:phone|mobile|telephone|tel|contact(?:Number|Info)?|sms|whatsapp)\b[^\n]{0,40}?[:=][^\n]{0,12}?["']?(\+?[1-9][0-9 .()-]{7,}[0-9])/giu;
const MACOS_USER_PREFIX = ["/", "Users", "/"].join("");
const LINUX_HOME_PREFIX = ["/", "home", "/"].join("");
const MACOS_PRIVATE_VAR_PREFIX = ["/", "private", "/", "var", "/"].join("");
const MACOS_VAR_FOLDERS_PREFIX = ["/", "var", "/", "folders", "/"].join("");
const WINDOWS_USERS_SEGMENT = ["\\", "Users", "\\"].join("");

function escapeForRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const HOST_PATH_DETECTORS = [
	{
		detectorId: "macos_user_path",
		regex: new RegExp(
			`(^|[^A-Za-z0-9._-])(${escapeForRegex(MACOS_USER_PREFIX)}[^/\\s"']+(?:/[^\\s"']+)*)`,
			"gu",
		),
	},
	{
		detectorId: "linux_home_path",
		regex: new RegExp(
			`(^|[^A-Za-z0-9._-])(${escapeForRegex(LINUX_HOME_PREFIX)}[^/\\s"']+(?:/[^\\s"']+)*)`,
			"gu",
		),
	},
	{
		detectorId: "macos_private_var_path",
		regex: new RegExp(
			`(^|[^A-Za-z0-9._-])(${escapeForRegex(MACOS_PRIVATE_VAR_PREFIX)}[^\\s"']+(?:/[^\\s"']+)*)`,
			"gu",
		),
	},
	{
		detectorId: "macos_var_folders_path",
		regex: new RegExp(
			`(^|[^A-Za-z0-9._-])(${escapeForRegex(MACOS_VAR_FOLDERS_PREFIX)}[^\\s"']+(?:/[^\\s"']+)*)`,
			"gu",
		),
	},
	{
		detectorId: "windows_user_path",
		regex: new RegExp(
			`(^|[^A-Za-z0-9._-])([A-Za-z]:${escapeForRegex(WINDOWS_USERS_SEGMENT)}[^\\s"']+(?:\\\\[^\\s"']+)*)`,
			"g",
		),
	},
];

function readString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function isLikelyText(buffer) {
	return !buffer.includes(0);
}

function redactEmail(email) {
	const [localPart = "", domain = ""] = email.split("@");
	if (!domain) {
		return "***";
	}
	return `${localPart.length > 0 ? `${localPart[0]}***` : "***"}@${domain}`;
}

function redactPhone(phone) {
	const digits = phone.replace(/\D/gu, "");
	if (digits.length <= 4) {
		return "***";
	}
	return `${digits.startsWith("1") ? "+1" : ""}***${digits.slice(-4)}`;
}

function compileRegexList(values) {
	return values
		.map((value) => readString(value))
		.filter(Boolean)
		.map((value) => new RegExp(value, "u"));
}

function listTrackedFiles(rootDir) {
	const raw = execFileSync("git", ["ls-files", "-z"], {
		cwd: rootDir,
		encoding: "buffer",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return raw
		.toString("utf8")
		.split("\0")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function shouldIgnorePath(relativePath, ignoredPathRegexes) {
	return ignoredPathRegexes.some((pattern) => pattern.test(relativePath));
}

function normalizeHostPath(candidate) {
	return readString(candidate).replace(/[),.;:]+$/u, "");
}

function redactHostPath(hostPath) {
	if (hostPath.startsWith(MACOS_USER_PREFIX)) {
		return ["/", "Users", "/***"].join("");
	}
	if (hostPath.startsWith(LINUX_HOME_PREFIX)) {
		return ["/", "home", "/***"].join("");
	}
	if (hostPath.startsWith(MACOS_PRIVATE_VAR_PREFIX)) {
		return ["/", "private", "/", "var", "/***"].join("");
	}
	if (hostPath.startsWith(MACOS_VAR_FOLDERS_PREFIX)) {
		return ["/", "var", "/", "folders", "/***"].join("");
	}
	if (new RegExp(`^[A-Za-z]:${escapeForRegex(WINDOWS_USERS_SEGMENT)}`, "u").test(hostPath)) {
		return ["C:", "\\", "Users", "\\***"].join("");
	}
	return "***";
}

function summarizeByDetector(findings) {
	return findings.reduce((accumulator, finding) => {
		accumulator[finding.detectorId] = (accumulator[finding.detectorId] ?? 0) + 1;
		return accumulator;
	}, {});
}

function scanLineForSensitiveFindings({
	line,
	lineNumber,
	file,
	allowedEmailDomains,
	allowedEmailAddresses,
	allowedPhoneRegexes,
	allowedHostPathRegexes,
}) {
	const findings = [];

	for (const match of line.matchAll(EMAIL_REGEX)) {
		const email = readString(match[1]);
		const domain = readString(match[2]).toLowerCase();
		const emailLower = email.toLowerCase();
		if (
			allowedEmailAddresses.has(emailLower) ||
			allowedEmailDomains.has(domain)
		) {
			continue;
		}
		findings.push({
			detectorId: "email_address",
			file,
			line: lineNumber,
			redactedMatch: redactEmail(email),
		});
	}

	for (const match of line.matchAll(PHONE_WITH_CONTEXT_REGEX)) {
		const phone = readString(match[1]);
		if (allowedPhoneRegexes.some((pattern) => pattern.test(phone))) {
			continue;
		}
		findings.push({
			detectorId: "phone_like_contact_field",
			file,
			line: lineNumber,
			redactedMatch: redactPhone(phone),
		});
	}

	for (const detector of HOST_PATH_DETECTORS) {
		for (const match of line.matchAll(detector.regex)) {
			const hostPath = normalizeHostPath(match[2] ?? match[0]);
			if (!hostPath) {
				continue;
			}
			if (allowedHostPathRegexes.some((pattern) => pattern.test(hostPath))) {
				continue;
			}
			findings.push({
				detectorId: detector.detectorId,
				file,
				line: lineNumber,
				redactedMatch: redactHostPath(hostPath),
			});
		}
	}

	return findings;
}

async function loadSensitiveSurfaceContract(rootDir, contractPathRaw) {
	const contractPath = path.resolve(rootDir, contractPathRaw ?? DEFAULT_CONTRACT_PATH);
	const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
	if (!isPlainObject(contract)) {
		throw new Error("Sensitive-surface audit contract must be an object.");
	}
	if (Number(contract.version) !== 1) {
		throw new Error("Sensitive-surface audit contract version must equal 1.");
	}
	return {
		contractPath,
		reportPath: path.resolve(rootDir, readString(contract.reportPath)),
		historyReportPath: path.resolve(
			rootDir,
			readString(contract.historyReportPath),
		),
		allowedEmailDomains: new Set(
			(Array.isArray(contract.allowedEmailDomains)
				? contract.allowedEmailDomains
				: []
			)
				.map((value) => readString(value).toLowerCase())
				.filter(Boolean),
		),
		allowedEmailAddresses: new Set(
			(Array.isArray(contract.allowedEmailAddresses)
				? contract.allowedEmailAddresses
			: []
			)
				.map((value) => readString(value).toLowerCase())
				.filter(Boolean),
		),
		allowedPhoneRegexes: compileRegexList(
			Array.isArray(contract.allowedPhoneRegexes)
				? contract.allowedPhoneRegexes
				: [],
		),
		allowedHostPathRegexes: compileRegexList(
			Array.isArray(contract.allowedHostPathRegexes)
				? contract.allowedHostPathRegexes
				: [],
		),
		ignoredPathRegexes: compileRegexList(
			Array.isArray(contract.ignoredPathRegexes) ? contract.ignoredPathRegexes : [],
		),
	};
}

async function runSensitiveSurfaceAudit(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contract = await loadSensitiveSurfaceContract(
		rootDir,
		options.contractPath,
	);
	const contractRelativePath = toPosixPath(
		path.relative(rootDir, contract.contractPath),
	);
	const trackedFiles = Array.isArray(options.trackedFiles)
		? options.trackedFiles.map((entry) => readString(entry)).filter(Boolean)
		: listTrackedFiles(rootDir);
	const findings = [];

	for (const relativePath of trackedFiles) {
		const normalizedPath = toPosixPath(relativePath);
		if (normalizedPath === contractRelativePath) {
			continue;
		}
		if (shouldIgnorePath(normalizedPath, contract.ignoredPathRegexes)) {
			continue;
		}
		const absolutePath = path.resolve(rootDir, relativePath);
		let buffer;
		try {
			buffer = await fs.readFile(absolutePath);
		} catch {
			continue;
		}
		if (!isLikelyText(buffer)) {
			continue;
		}
		const lines = buffer.toString("utf8").split(/\r?\n/u);
		for (const [lineIndex, line] of lines.entries()) {
			findings.push(
				...scanLineForSensitiveFindings({
					line,
					lineNumber: lineIndex + 1,
					file: normalizedPath,
					allowedEmailDomains: contract.allowedEmailDomains,
					allowedEmailAddresses: contract.allowedEmailAddresses,
					allowedPhoneRegexes: contract.allowedPhoneRegexes,
					allowedHostPathRegexes: contract.allowedHostPathRegexes,
				}),
			);
		}
	}

	const report = {
		checkedAt: new Date().toISOString(),
		contractPath: toPosixPath(path.relative(rootDir, contract.contractPath)),
		scannedFileCount: trackedFiles.length,
		findingCount: findings.length,
		summaryByDetector: summarizeByDetector(findings),
		findings,
		notes: [
			"Heuristic current-tree audit only.",
			"Scans tracked text files for personal contact fields and host-local absolute paths.",
			"Use tracked-surface hygiene and remote GitHub review to cover tracked logs and remote-only residue.",
		],
	};

	await fs.mkdir(path.dirname(contract.reportPath), { recursive: true });
	await fs.writeFile(
		contract.reportPath,
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);

	return {
		ok: findings.length === 0,
		reportPath: toPosixPath(path.relative(rootDir, contract.reportPath)),
		report,
	};
}

async function main() {
	try {
		const result = await runSensitiveSurfaceAudit();
		if (!result.ok) {
			console.error(
				`[sensitive-surface-audit] FAILED (${result.reportPath}; findings=${result.report.findingCount})`,
			);
			for (const finding of result.report.findings) {
				console.error(
					`- ${finding.detectorId} ${finding.file}:${finding.line} ${finding.redactedMatch}`,
				);
			}
			process.exit(1);
		}
		console.log(
			`[sensitive-surface-audit] OK (${result.reportPath}; scannedFiles=${result.report.scannedFileCount})`,
		);
	} catch (error) {
		console.error(
			`[sensitive-surface-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export {
	loadSensitiveSurfaceContract,
	runSensitiveSurfaceAudit,
	scanLineForSensitiveFindings,
};
