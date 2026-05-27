#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTRACT_PATH = "tooling/contracts/pii-audit.contract.json";
const EMAIL_REGEX = /\b([A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,}))\b/gu;
const PHONE_WITH_CONTEXT_REGEX =
	/\b(?:phone|mobile|telephone|tel|contact(?:Number|Info)?|sms|whatsapp)\b[^\n]{0,40}?[:=][^\n]{0,12}?["']?(\+?[1-9][0-9 .()-]{7,}[0-9])/giu;

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
	const prefix = localPart.length > 0 ? `${localPart[0]}***` : "***";
	return `${prefix}@${domain}`;
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

function shouldIgnorePath(relativePath, ignoredPathRegexes) {
	return ignoredPathRegexes.some((pattern) => pattern.test(relativePath));
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

async function runPiiAudit(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
	if (!isPlainObject(contract)) {
		throw new Error("PII audit contract must be an object.");
	}
	if (Number(contract.version) !== 1) {
		throw new Error("PII audit contract version must equal 1.");
	}

	const reportPath = path.resolve(rootDir, readString(contract.reportPath));
	const allowedEmailDomains = new Set(
		(Array.isArray(contract.allowedEmailDomains) ? contract.allowedEmailDomains : [])
			.map((value) => readString(value).toLowerCase())
			.filter(Boolean),
	);
	const allowedEmailAddresses = new Set(
		(Array.isArray(contract.allowedEmailAddresses) ? contract.allowedEmailAddresses : [])
			.map((value) => readString(value).toLowerCase())
			.filter(Boolean),
	);
	const ignoredPathRegexes = compileRegexList(
		Array.isArray(contract.ignoredPathRegexes) ? contract.ignoredPathRegexes : [],
	);

	const trackedFiles = Array.isArray(options.trackedFiles)
		? options.trackedFiles.map((entry) => readString(entry)).filter(Boolean)
		: listTrackedFiles(rootDir);
	const findings = [];

	for (const relativePath of trackedFiles) {
		const normalizedPath = toPosixPath(relativePath);
		if (shouldIgnorePath(normalizedPath, ignoredPathRegexes)) {
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

		const content = buffer.toString("utf8");
		const lines = content.split(/\r?\n/u);
		for (const [lineIndex, line] of lines.entries()) {
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
					file: normalizedPath,
					line: lineIndex + 1,
					redactedMatch: redactEmail(email),
				});
			}

			for (const match of line.matchAll(PHONE_WITH_CONTEXT_REGEX)) {
				const phone = readString(match[1]);
				findings.push({
					detectorId: "phone_like_contact_field",
					file: normalizedPath,
					line: lineIndex + 1,
					redactedMatch: redactPhone(phone),
				});
			}
		}
	}

	const summaryByDetector = findings.reduce((accumulator, finding) => {
		accumulator[finding.detectorId] = (accumulator[finding.detectorId] ?? 0) + 1;
		return accumulator;
	}, {});
	const report = {
		checkedAt: new Date().toISOString(),
		contractPath: toPosixPath(path.relative(rootDir, contractPath)),
		scannedFileCount: trackedFiles.length,
		findingCount: findings.length,
		summaryByDetector,
		findings,
		notes: [
			"Heuristic scan only: this audit targets email addresses and phone-like contact fields in tracked text files.",
			"Use a dedicated privacy review or DLP tooling for stronger coverage.",
		],
	};

	await fs.mkdir(path.dirname(reportPath), { recursive: true });
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

	return {
		ok: findings.length === 0,
		reportPath: toPosixPath(path.relative(rootDir, reportPath)),
		report,
	};
}

async function main() {
	try {
		const result = await runPiiAudit();
		if (!result.ok) {
			console.error(
				`[pii-audit] FAILED (${result.reportPath}; findings=${result.report.findingCount})`,
			);
			for (const finding of result.report.findings) {
				console.error(
					`- ${finding.detectorId} ${finding.file}:${finding.line} ${finding.redactedMatch}`,
				);
			}
			process.exit(1);
		}
		console.log(
			`[pii-audit] OK (${result.reportPath}; scannedFiles=${result.report.scannedFileCount})`,
		);
	} catch (error) {
		console.error(`[pii-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runPiiAudit };
