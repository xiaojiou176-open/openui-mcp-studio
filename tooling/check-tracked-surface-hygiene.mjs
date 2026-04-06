import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const FORBIDDEN_PREFIXES = [
	".agents/",
	".agent/",
	".codex/",
	".claude/",
	".runtime-cache/",
	"logs/",
];

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
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
		.filter(Boolean)
		.map((entry) => toPosixPath(entry));
}

function classifyViolation(relativePath) {
	if (FORBIDDEN_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) {
		return "forbidden tracked directory surface";
	}
	if (relativePath.endsWith(".log")) {
		return "tracked log file";
	}
	if (
		relativePath.endsWith(".jsonl") &&
		(relativePath.includes("/logs/") ||
			relativePath.startsWith(".runtime-cache/") ||
			relativePath.startsWith("logs/"))
	) {
		return "tracked runtime/log jsonl file";
	}
	return null;
}

async function runTrackedSurfaceHygieneCheck(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const trackedFiles = Array.isArray(options.trackedFiles)
		? options.trackedFiles.map((entry) => toPosixPath(String(entry ?? "").trim())).filter(Boolean)
		: listTrackedFiles(rootDir);
	const errors = [];

	for (const relativePath of trackedFiles) {
		const violation = classifyViolation(relativePath);
		if (violation) {
			errors.push(`${violation}: ${relativePath}`);
		}
	}

	return {
		ok: errors.length === 0,
		errors,
	};
}

async function main() {
	try {
		const result = await runTrackedSurfaceHygieneCheck();
		if (!result.ok) {
			console.error("[tracked-surface-hygiene] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[tracked-surface-hygiene] OK");
	} catch (error) {
		console.error(
			`[tracked-surface-hygiene] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runTrackedSurfaceHygieneCheck };
