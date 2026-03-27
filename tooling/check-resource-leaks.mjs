#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const HOOK_PATTERN =
	/\b(afterEach|afterAll)\s*\(\s*(?:(async\s*)?\([^)]*\)\s*=>|(async\s+)?function(?:\s+[A-Za-z_$][A-Za-z0-9_$]*)?\s*\([^)]*\))\s*\{/g;
const HOOK_EXPRESSION_VOID_PATTERN =
	/\b(afterEach|afterAll)\s*\(\s*(async\s*)?\([^)]*\)\s*=>\s*\(?\s*void\b/g;
const TEST_ROOT_DIRS = ["tests", "src"];
const TEST_FILE_PATTERN = /(\.test\.tsx?|\.spec\.tsx?)$/u;

function parseArgs(argv) {
	return {
		staged: argv.includes("--staged"),
		ci: argv.includes("--ci"),
	};
}

function toPosixPath(value) {
	return value.split(path.sep).join("/");
}

function getStagedFiles() {
	try {
		const output = execFileSync(
			"git",
			["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		return output
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

function getAllTestFiles() {
	try {
		const output = execFileSync(
			"rg",
			[
				"--files",
				...TEST_ROOT_DIRS,
				"-g",
				"**/*.test.ts",
				"-g",
				"**/*.test.tsx",
				"-g",
				"**/*.spec.ts",
				"-g",
				"**/*.spec.tsx",
			],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		return output
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return getAllTestFilesWithGlob();
	}
}

function getAllTestFilesWithGlob() {
	const results = [];
	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (
				entry.isFile() &&
				(entry.name.endsWith(".test.ts") ||
					entry.name.endsWith(".spec.ts") ||
					entry.name.endsWith(".test.tsx") ||
					entry.name.endsWith(".spec.tsx"))
			) {
				results.push(path.relative(process.cwd(), full));
			}
		}
	};
	for (const rootDir of TEST_ROOT_DIRS) {
		walk(path.resolve(process.cwd(), rootDir));
	}
	return results;
}

function isCandidateTestFile(filePath) {
	const normalized = toPosixPath(filePath);
	return (
		/^(tests|src)\//u.test(normalized) && TEST_FILE_PATTERN.test(normalized)
	);
}

function lineOfIndex(content, index) {
	return content.slice(0, index).split("\n").length;
}

function sanitizeForScan(content) {
	let result = "";
	let state = "code";
	for (let index = 0; index < content.length; index += 1) {
		const char = content[index];
		const next = content[index + 1] ?? "";

		if (state === "code") {
			if (char === "'" || char === '"' || char === "`") {
				state = char;
				result += " ";
				continue;
			}
			if (char === "/" && next === "/") {
				state = "line-comment";
				result += "  ";
				index += 1;
				continue;
			}
			if (char === "/" && next === "*") {
				state = "block-comment";
				result += "  ";
				index += 1;
				continue;
			}
			result += char;
			continue;
		}

		if (state === "line-comment") {
			if (char === "\n") {
				state = "code";
				result += "\n";
			} else {
				result += " ";
			}
			continue;
		}

		if (state === "block-comment") {
			if (char === "*" && next === "/") {
				state = "code";
				result += "  ";
				index += 1;
			} else if (char === "\n") {
				result += "\n";
			} else {
				result += " ";
			}
			continue;
		}

		if (state === "'" || state === '"' || state === "`") {
			if (char === "\\" && next) {
				result += "  ";
				index += 1;
				continue;
			}
			if (char === state) {
				state = "code";
				result += " ";
			} else if (char === "\n") {
				result += "\n";
			} else {
				result += " ";
			}
		}
	}
	return result;
}

function extractHookBlocks(content) {
	const hooks = [];
	const hookPattern = new RegExp(HOOK_PATTERN.source, HOOK_PATTERN.flags);
	for (;;) {
		const match = hookPattern.exec(content);
		if (match === null) {
			break;
		}
		const hookName = match[1] ?? "afterEach";
		const isAsync = Boolean(match[2]);
		const openBraceIndex = content.indexOf("{", match.index);
		if (openBraceIndex === -1) {
			continue;
		}
		let cursor = openBraceIndex + 1;
		let depth = 1;
		while (cursor < content.length && depth > 0) {
			const char = content[cursor];
			if (char === "{") {
				depth += 1;
			} else if (char === "}") {
				depth -= 1;
			}
			cursor += 1;
		}
		if (depth !== 0) {
			continue;
		}
		const body = content.slice(openBraceIndex + 1, cursor - 1);
		hooks.push({
			hookName,
			isAsync: isAsync || Boolean(match[3]),
			body,
			line: lineOfIndex(content, match.index),
		});
	}
	return hooks;
}

function hasCleanupCall(body) {
	return /(?:\bfs\.(?:rm|unlink|rmdir)\s*\()|(?:\.\s*(?:close|stop|cleanup|dispose|kill|terminate)\s*\()/u.test(
		body,
	);
}

function hasReturnedPromise(body) {
	return (
		/return\s+Promise\.all\s*\(/u.test(body) ||
		/return\s+.*\bfs\.(?:rm|unlink|rmdir)\s*\(/u.test(body) ||
		/return\s+.*\.\s*(?:close|stop|cleanup|dispose|kill|terminate)\s*\(/u.test(
			body,
		)
	);
}

function hasExplicitVoidCleanup(body) {
	return /void\s+[^;\n]*(?:\bfs\.(?:rm|unlink|rmdir)\s*\(|\.\s*(?:close|stop|cleanup|dispose|kill|terminate)\s*\()/u.test(
		body,
	);
}

function hasEnvModification(content) {
	return /process\.env\s*(?:\[\s*[^\]]+\s*\]|\.[A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\|\|=|&&=|\?\?=|=(?!=))/u.test(
		content,
	);
}

function hasEnvRestoration(body) {
	return /(?:process\.env\s*(?:\[\s*[^\]]+\s*\]|\.[A-Za-z_$][A-Za-z0-9_$]*)\s*=)|(?:delete\s+process\.env\s*(?:\[\s*[^\]]+\s*\]|\.[A-Za-z_$][A-Za-z0-9_$]*))|(?:\brestoreEnv\s*\(\s*\))|(?:Object\.assign\s*\(\s*process\.env)|(?:vi\.unstubAllEnvs\s*\(\s*\))/u.test(
		body,
	);
}

function extractKeywordBlocks(content, keyword) {
	const matcher = new RegExp(`\\b${keyword}\\s*\\{`, "g");
	const blocks = [];
	let match = matcher.exec(content);
	while (match !== null) {
		const openBraceIndex = content.indexOf("{", match.index);
		if (openBraceIndex === -1) {
			match = matcher.exec(content);
			continue;
		}
		let cursor = openBraceIndex + 1;
		let depth = 1;
		while (cursor < content.length && depth > 0) {
			const char = content[cursor];
			if (char === "{") {
				depth += 1;
			} else if (char === "}") {
				depth -= 1;
			}
			cursor += 1;
		}
		if (depth === 0) {
			blocks.push(content.slice(openBraceIndex + 1, cursor - 1));
		}
		match = matcher.exec(content);
	}
	return blocks;
}

function hasTryFinallyEnvRestoration(content) {
	const finallyBlocks = extractKeywordBlocks(content, "finally");
	return finallyBlocks.some((block) => hasEnvRestoration(block));
}

function hasMockCreation(content) {
	return /vi\.(?:mock|spyOn|stubEnv|stubGlobal)\s*\(/u.test(content);
}

function hasMockCleanup(body) {
	return (
		/vi\.(?:restoreAllMocks|unstubAllEnvs|unstubAllGlobals)\s*\(\s*\)/u.test(
			body,
		) ||
		/\.mockRestore\s*\(\s*\)/u.test(body) ||
		/\.mockReset\s*\(\s*\)/u.test(body) ||
		/\.mockClear\s*\(\s*\)/u.test(body)
	);
}

function scanFile(content, filePath) {
	const issues = [];
	const sanitized = sanitizeForScan(content);
	const hooks = extractHookBlocks(sanitized);
	const hookExpressionPattern = new RegExp(
		HOOK_EXPRESSION_VOID_PATTERN.source,
		HOOK_EXPRESSION_VOID_PATTERN.flags,
	);
	let expressionMatch = hookExpressionPattern.exec(sanitized);
	while (expressionMatch !== null) {
		issues.push({
			filePath,
			line: lineOfIndex(sanitized, expressionMatch.index),
			rule: "void-cleanup-call",
			message:
				"afterEach/afterAll expression body contains void cleanup call; return/await the promise to guarantee teardown completion.",
		});
		expressionMatch = hookExpressionPattern.exec(sanitized);
	}

	const hasEnvMod = hasEnvModification(sanitized);
	const hasMocks = hasMockCreation(sanitized);
	const hasAnyHook = hooks.length > 0;

	let hasEnvRestore = false;
	let hasMockRestore = false;

	for (const hook of hooks) {
		if (hasExplicitVoidCleanup(hook.body)) {
			issues.push({
				filePath,
				line: hook.line,
				rule: "void-cleanup-call",
				message: `${hook.hookName} contains void cleanup call; await/return the promise to guarantee teardown completion.`,
			});
		}

		if (
			!hook.isAsync &&
			hasCleanupCall(hook.body) &&
			!hasReturnedPromise(hook.body)
		) {
			issues.push({
				filePath,
				line: hook.line,
				rule: "non-async-hook-async-cleanup",
				message: `${hook.hookName} appears to run async cleanup in a non-async callback without returning a promise.`,
			});
		}

		if (hasEnvRestoration(hook.body)) {
			hasEnvRestore = true;
		}
		if (hasMockCleanup(hook.body)) {
			hasMockRestore = true;
		}
	}
	const hasFinallyEnvRestore = hasTryFinallyEnvRestoration(sanitized);
	if (hasEnvMod && !hasEnvRestore && !hasFinallyEnvRestore) {
		const remediation = hasAnyHook
			? "cleanup hooks do not restore environment variables."
			: "no cleanup hook restores environment variables.";
		issues.push({
			filePath,
			line: 1,
			rule: "env-modification-no-restore",
			message: `Test modifies process.env but ${remediation} Consider using vi.stubEnv() or restoring in afterEach.`,
		});
	}

	if (hasMocks && !hasMockRestore) {
		const remediation = hasAnyHook
			? "cleanup hooks do not call vi.restoreAllMocks() or equivalent."
			: "no cleanup hook calls vi.restoreAllMocks() or equivalent.";
		issues.push({
			filePath,
			line: 1,
			rule: "mock-no-restore",
			message: `Test creates mocks but ${remediation} Consider adding mock cleanup in afterEach.`,
		});
	}

	return issues;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const candidates = options.staged
		? getStagedFiles().filter(isCandidateTestFile)
		: getAllTestFiles();

	if (candidates.length === 0) {
		console.log(
			`[resource-leak-audit] no candidate test files (${options.staged ? "staged" : "full"})`,
		);
		return;
	}

	const issues = [];
	for (const candidate of candidates) {
		const fullPath = path.resolve(process.cwd(), candidate);
		let content;
		try {
			content = await readFile(fullPath, "utf8");
		} catch {
			continue;
		}
		issues.push(...scanFile(content, candidate));
	}

	if (issues.length > 0) {
		console.error("[resource-leak-audit] FAILED");
		for (const issue of issues) {
			console.error(
				`  - ${issue.filePath}:${issue.line} [${issue.rule}] ${issue.message}`,
			);
		}
		console.error(
			"  - remediation: use `afterEach(async () => await Promise.all(...))` or `return Promise.all(...)`; avoid `void` for cleanup promises.",
		);
		console.error(
			"  - for env vars: use vi.stubEnv() or restore original values in afterEach.",
		);
		console.error("  - for mocks: call vi.restoreAllMocks() in afterEach.");
		process.exit(1);
	}

	console.log(
		`[resource-leak-audit] PASSED (${options.ci ? "ci" : options.staged ? "staged" : "full"}) on ${candidates.length} file(s)`,
	);
}

main().catch((error) => {
	const detail =
		error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`[resource-leak-audit] fatal: ${detail}`);
	process.exit(1);
});
