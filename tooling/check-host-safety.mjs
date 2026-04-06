#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT_SCAN_DIRECTORIES = [
	"apps",
	"ops",
	"packages",
	"services",
	"tests",
	"tooling",
];
const SOURCE_FILE_PATTERN = /\.(?:[cm]?js|[jt]sx?|sh)$/u;
const SELF_PATH = path.resolve(fileURLToPath(import.meta.url));

const FORBIDDEN_PATTERNS = Object.freeze([
	{
		id: "killall",
		pattern: /\bkillall\b/u,
		reason:
			"`killall` can target shared-machine processes outside the current repo lane.",
	},
	{
		id: "pkill",
		pattern: /\bpkill\b/u,
		reason:
			"`pkill` is pattern-based host cleanup and is not allowed in this repository.",
	},
	{
		id: "osascript",
		pattern: /\bosascript\b/u,
		reason:
			"AppleScript desktop control is forbidden for unattended repo automation.",
	},
	{
		id: "system-events",
		pattern: /\bSystem Events\b/u,
		reason:
			"`System Events` implies desktop-wide GUI automation and is not allowed.",
	},
	{
		id: "loginwindow",
		pattern: /\bloginwindow\b/u,
		reason:
			"`loginwindow` belongs to host-session control and must never be automated here.",
	},
	{
		id: "appleevent",
		pattern: /\bAppleEvent\b|\bkAEShowApplicationWindow\b|\baevt,apwn\b/u,
		reason:
			"Force-Quit or system AppleEvent primitives are forbidden in repo-owned code paths.",
	},
	{
		id: "force-quit-panel",
		pattern: /\bshowForceQuitPanel\b/u,
		reason:
			"Force Quit panel automation is forbidden in repo-owned code paths.",
	},
	{
		id: "negative-process-kill",
		pattern: /\bprocess\.kill\(\s*-\s*/u,
		reason:
			"Negative-PID `process.kill` targets a process group and can overshoot repo-owned scope.",
	},
	{
		id: "negative-os-kill",
		pattern: /\bos\.kill\(\s*-\s*/u,
		reason:
			"Negative-PID `os.kill` targets a process group and is forbidden here.",
	},
	{
		id: "killpg",
		pattern: /\bkillpg\s*\(/u,
		reason:
			"`killpg(...)` is process-group termination and is forbidden here.",
	},
]);

function shouldScanFile(relativePath) {
	const normalized = relativePath.replaceAll("\\", "/");
	if (!SOURCE_FILE_PATTERN.test(normalized)) {
		return false;
	}
	if (
		normalized.startsWith("docs/") ||
		normalized.startsWith(".runtime-cache/")
	) {
		return false;
	}
	if (normalized === "tooling/check-host-safety.mjs") {
		return false;
	}
	if (normalized === "tests/host-safety-check.test.ts") {
		return false;
	}
	return true;
}

async function collectNestedSourceFiles(rootDir, currentDir) {
	const files = [];
	const entries = await readdir(currentDir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(currentDir, entry.name);
		if (entry.isDirectory()) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".next" ||
				entry.name === "dist" ||
				entry.name === "build" ||
				entry.name === ".runtime-cache"
			) {
				continue;
			}
			files.push(...(await collectNestedSourceFiles(rootDir, fullPath)));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const relativePath = path.relative(rootDir, fullPath);
		if (shouldScanFile(relativePath)) {
			files.push(relativePath);
		}
	}
	return files;
}

async function collectSourceFiles(rootDir) {
	const files = [];
	const rootEntries = await readdir(rootDir, { withFileTypes: true });

	for (const entry of rootEntries) {
		const fullPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			if (!ROOT_SCAN_DIRECTORIES.includes(entry.name)) {
				continue;
			}
			files.push(...(await collectNestedSourceFiles(rootDir, fullPath)));
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const relativePath = path.relative(rootDir, fullPath);
		if (shouldScanFile(relativePath)) {
			files.push(relativePath);
		}
	}

	return files.sort();
}

export function findHostSafetyViolations(entries) {
	const violations = [];
	for (const entry of entries) {
		const lines = String(entry.content ?? "").split(/\r?\n/u);
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index] ?? "";
			for (const forbidden of FORBIDDEN_PATTERNS) {
				if (!forbidden.pattern.test(line)) {
					continue;
				}
				violations.push({
					path: entry.path,
					line: index + 1,
					ruleId: forbidden.id,
					reason: forbidden.reason,
					snippet: line.trim(),
				});
			}
		}
	}
	return violations;
}

export async function inspectRepositoryHostSafety(rootDir = process.cwd()) {
	const files = await collectSourceFiles(rootDir);
	const entries = await Promise.all(
		files.map(async (relativePath) => {
			const fullPath = path.resolve(rootDir, relativePath);
			return {
				path: relativePath.replaceAll("\\", "/"),
				content: await readFile(fullPath, "utf8"),
			};
		}),
	);
	return findHostSafetyViolations(entries);
}

export async function runHostSafetyCheck(rootDir = process.cwd()) {
	const violations = await inspectRepositoryHostSafety(rootDir);
	if (violations.length > 0) {
		console.error("[host-safety] FAILED");
		for (const violation of violations) {
			console.error(
				`- ${violation.path}:${violation.line} [${violation.ruleId}] ${violation.reason}`,
			);
			if (violation.snippet) {
				console.error(`  ${violation.snippet}`);
			}
		}
		return 1;
	}

	console.log("[host-safety] OK (no forbidden host-safety primitives found)");
	return 0;
}

const isDirectExecution =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === SELF_PATH;

if (isDirectExecution) {
	runHostSafetyCheck().then((exitCode) => {
		process.exit(exitCode);
	});
}
