import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const WARNING_THRESHOLD = 500;
const ERROR_THRESHOLD = 800;
const DEFAULT_DUPLICATION_THRESHOLD_PERCENT = 3;
const DUPLICATE_CHECK_STATUS_CODES = Object.freeze({
	pass: 0,
	fail: 1,
	unavailable: 2,
	error: 3,
});

const DEFAULT_ROOTS = Object.freeze([
	"services/mcp-server/src",
	"tooling",
]);
const CODE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
]);
const DEFAULT_EXCLUDED_DIR_NAMES = Object.freeze([
	"node_modules",
	"dist",
	"build",
	"coverage",
	"tests",
	"fixtures",
	".git",
]);
const EXCLUDED_FILE_PATTERNS = [
	/\.test\.[^.]+$/i,
	/\.spec\.[^.]+$/i,
	/\.d\.ts$/i,
];

function toPortablePath(targetPath) {
	return targetPath.split(path.sep).join("/");
}

function parseCommaSeparatedList(value) {
	if (!value) {
		return [];
	}

	return value
		.split(",")
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function createExcludedDirectorySet(excludedDirectoryNames) {
	const source =
		Array.isArray(excludedDirectoryNames) && excludedDirectoryNames.length > 0
			? excludedDirectoryNames
			: DEFAULT_EXCLUDED_DIR_NAMES;
	return new Set(source.map((segment) => segment.toLowerCase()));
}

function resolveIncludeRoots(options) {
	if (Array.isArray(options.includeRoots) && options.includeRoots.length > 0) {
		return options.includeRoots;
	}

	const envRoots = parseCommaSeparatedList(
		process.env.FILE_GOVERNANCE_INCLUDE_ROOTS,
	);
	if (envRoots.length > 0) {
		return envRoots;
	}

	return DEFAULT_ROOTS;
}

function resolveExcludedDirectoryNames(options) {
	if (
		Array.isArray(options.excludedDirectoryNames) &&
		options.excludedDirectoryNames.length > 0
	) {
		return options.excludedDirectoryNames;
	}

	const envExcludes = parseCommaSeparatedList(
		process.env.FILE_GOVERNANCE_EXCLUDE_DIRS,
	);
	if (envExcludes.length > 0) {
		return envExcludes;
	}

	return DEFAULT_EXCLUDED_DIR_NAMES;
}

function countLines(raw) {
	if (raw.length === 0) {
		return 0;
	}
	const parts = raw.split(/\r?\n/u);
	if (parts.at(-1) === "") {
		parts.pop();
	}
	return parts.length;
}

function hasExcludedSegment(relativePath, excludedDirectorySet) {
	const segments = relativePath
		.split(path.sep)
		.map((segment) => segment.toLowerCase());
	return segments.some((segment) => excludedDirectorySet.has(segment));
}

function shouldExcludeFile(relativePath, excludedDirectorySet) {
	if (hasExcludedSegment(relativePath, excludedDirectorySet)) {
		return true;
	}
	const portablePath = toPortablePath(relativePath);
	return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(portablePath));
}

function classifyFile(lines) {
	if (lines > ERROR_THRESHOLD) {
		return "error";
	}
	if (lines > WARNING_THRESHOLD) {
		return "warning";
	}
	return "ok";
}

async function collectFiles(rootDir, projectRoot, excludedDirectorySet) {
	let entries;
	try {
		entries = await fs.readdir(rootDir, { withFileTypes: true });
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return [];
		}
		throw error;
	}

	const files = [];
	for (const entry of entries) {
		const absolutePath = path.join(rootDir, entry.name);
		const relativePath = path.relative(projectRoot, absolutePath);

		if (entry.isDirectory()) {
			if (hasExcludedSegment(relativePath, excludedDirectorySet)) {
				continue;
			}
			files.push(
				...(await collectFiles(
					absolutePath,
					projectRoot,
					excludedDirectorySet,
				)),
			);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		const extension = path.extname(entry.name).toLowerCase();
		if (!CODE_EXTENSIONS.has(extension)) {
			continue;
		}

		if (shouldExcludeFile(relativePath, excludedDirectorySet)) {
			continue;
		}

		files.push(absolutePath);
	}

	return files;
}

async function inspectFile(filePath, projectRoot) {
	const raw = await fs.readFile(filePath, "utf8");
	const lines = countLines(raw);
	const relativePath = toPortablePath(path.relative(projectRoot, filePath));
	return {
		path: relativePath,
		lines,
		status: classifyFile(lines),
	};
}

function resolveGovernanceContext(options = {}) {
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const projectRoot =
		options.projectRoot ?? path.resolve(scriptDirectory, "..");
	const includeRoots = resolveIncludeRoots(options);
	const excludedDirectoryNames = resolveExcludedDirectoryNames(options);
	const excludedDirectorySet = createExcludedDirectorySet(
		excludedDirectoryNames,
	);
	const absoluteRoots = includeRoots.map((root) =>
		path.resolve(projectRoot, root),
	);

	return {
		projectRoot,
		includeRoots,
		excludedDirectoryNames,
		excludedDirectorySet,
		absoluteRoots,
	};
}

async function runFileGovernance(options = {}) {
	const {
		projectRoot,
		includeRoots,
		excludedDirectoryNames,
		excludedDirectorySet,
		absoluteRoots,
	} = resolveGovernanceContext(options);

	const files = [];
	for (const root of absoluteRoots) {
		files.push(
			...(await collectFiles(root, projectRoot, excludedDirectorySet)),
		);
	}

	const uniqueFiles = Array.from(new Set(files)).sort((left, right) =>
		left.localeCompare(right),
	);
	const evaluatedFiles = await Promise.all(
		uniqueFiles.map((filePath) => inspectFile(filePath, projectRoot)),
	);

	evaluatedFiles.sort(
		(left, right) =>
			right.lines - left.lines || left.path.localeCompare(right.path),
	);

	const warnings = evaluatedFiles.filter((file) => file.status === "warning");
	const failures = evaluatedFiles.filter((file) => file.status === "error");

	return {
		ok: failures.length === 0,
		generatedAt: new Date().toISOString(),
		thresholds: {
			warningLinesExclusive: WARNING_THRESHOLD,
			failLinesExclusive: ERROR_THRESHOLD,
		},
		scope: {
			includeRoots: includeRoots.map((root) => toPortablePath(root)),
			excludedDirectoryNames: excludedDirectoryNames
				.map((name) => name.toLowerCase())
				.sort(),
			excludedFilePatterns: EXCLUDED_FILE_PATTERNS.map(
				(pattern) => pattern.source,
			),
			codeExtensions: Array.from(CODE_EXTENSIONS).sort(),
		},
		totals: {
			scannedFiles: evaluatedFiles.length,
			warningFiles: warnings.length,
			failedFiles: failures.length,
			maxLineCount: evaluatedFiles[0]?.lines ?? 0,
		},
		violations: {
			warnings,
			failures,
		},
		files: evaluatedFiles,
	};
}

async function resolveJscpdBinaryPath(projectRoot) {
	const executableName = process.platform === "win32" ? "jscpd.cmd" : "jscpd";
	const candidates = [
		path.join(projectRoot, "node_modules", ".bin", executableName),
		path.join(projectRoot, "node_modules", ".bin", "jscpd"),
	];

	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			return candidate;
		} catch {
			// Keep checking fallback candidates.
		}
	}

	return null;
}

function executeCommand(command, args, input = {}) {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: input.cwd ?? process.cwd(),
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk) => {
			stdout += String(chunk);
		});

		child.stderr?.on("data", (chunk) => {
			stderr += String(chunk);
		});

		child.on("error", (error) => {
			resolve({
				exitCode: null,
				stdout: stdout.trim(),
				stderr: [stderr.trim(), error.message].filter(Boolean).join("\n"),
			});
		});

		child.on("close", (code) => {
			resolve({
				exitCode: typeof code === "number" ? code : null,
				stdout: stdout.trim(),
				stderr: stderr.trim(),
			});
		});
	});
}

function buildJscpdIgnorePattern(excludedDirectoryNames) {
	return excludedDirectoryNames.map((name) => `**/${name}/**`).join(",");
}

async function runDuplicateRateCheck(options = {}) {
	const { projectRoot, includeRoots, excludedDirectoryNames } =
		resolveGovernanceContext(options);
	const thresholdPercent =
		typeof options.thresholdPercent === "number" &&
		Number.isFinite(options.thresholdPercent)
			? Math.max(0, options.thresholdPercent)
			: DEFAULT_DUPLICATION_THRESHOLD_PERCENT;
	const jscpdBinaryPath =
		options.jscpdBinaryPath ?? (await resolveJscpdBinaryPath(projectRoot));

	if (!jscpdBinaryPath) {
		return {
			ok: true,
			status: "degraded",
			statusCode: DUPLICATE_CHECK_STATUS_CODES.unavailable,
			reason: "missing_jscpd_dependency",
			message:
				"jscpd is not installed in node_modules; duplicate rate check downgraded.",
			scope: {
				includeRoots: includeRoots.map((root) => toPortablePath(root)),
				excludedDirectoryNames: excludedDirectoryNames
					.map((name) => name.toLowerCase())
					.sort(),
			},
			thresholdPercent,
		};
	}

	const outputDirectory = path.resolve(projectRoot, ".runtime-cache", "jscpd");
	await fs.mkdir(outputDirectory, { recursive: true });

	const includeTargets = includeRoots.map((root) => toPortablePath(root));
	const args = [
		"--silent",
		"--reporters",
		"json",
		"--output",
		outputDirectory,
		"--threshold",
		String(thresholdPercent),
		"--ignore",
		buildJscpdIgnorePattern(excludedDirectoryNames),
		...includeTargets,
	];

	const executor = options.executor ?? executeCommand;
	const result = await executor(jscpdBinaryPath, args, { cwd: projectRoot });
	const command = toPortablePath(path.relative(projectRoot, jscpdBinaryPath));

	if (result.exitCode === 0) {
		return {
			ok: true,
			status: "passed",
			statusCode: DUPLICATE_CHECK_STATUS_CODES.pass,
			command,
			args,
			stdout: result.stdout,
			stderr: result.stderr,
			thresholdPercent,
		};
	}

	if (result.exitCode === 1) {
		return {
			ok: false,
			status: "failed",
			statusCode: DUPLICATE_CHECK_STATUS_CODES.fail,
			command,
			args,
			stdout: result.stdout,
			stderr: result.stderr,
			thresholdPercent,
		};
	}

	return {
		ok: false,
		status: "error",
		statusCode: DUPLICATE_CHECK_STATUS_CODES.error,
		command,
		args,
		stdout: result.stdout,
		stderr: result.stderr,
		thresholdPercent,
	};
}

function parseCliOptions(argv) {
	const options = {
		mode: "governance",
		includeRoots: undefined,
		excludedDirectoryNames: undefined,
		thresholdPercent: undefined,
	};

	for (const token of argv) {
		if (token === "--check-duplicates") {
			options.mode = "duplicates";
			continue;
		}

		if (token === "--all") {
			options.mode = "all";
			continue;
		}

		if (token.startsWith("--include-roots=")) {
			options.includeRoots = parseCommaSeparatedList(
				token.slice("--include-roots=".length),
			);
			continue;
		}

		if (token.startsWith("--exclude-dirs=")) {
			options.excludedDirectoryNames = parseCommaSeparatedList(
				token.slice("--exclude-dirs=".length),
			);
			continue;
		}

		if (token.startsWith("--dup-threshold=")) {
			const value = Number(token.slice("--dup-threshold=".length));
			if (Number.isFinite(value)) {
				options.thresholdPercent = value;
			}
		}
	}

	return options;
}

function isDirectExecution() {
	if (!process.argv[1]) {
		return false;
	}
	return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function main() {
	try {
		const cliOptions = parseCliOptions(process.argv.slice(2));

		if (cliOptions.mode === "duplicates") {
			const duplicateReport = await runDuplicateRateCheck(cliOptions);
			process.stdout.write(`${JSON.stringify(duplicateReport, null, 2)}\n`);
			process.exitCode = duplicateReport.statusCode;
			return;
		}

		const governanceReport = await runFileGovernance(cliOptions);

		if (cliOptions.mode === "all") {
			const duplicateReport = await runDuplicateRateCheck(cliOptions);
			const ok =
				governanceReport.ok &&
				(duplicateReport.statusCode === DUPLICATE_CHECK_STATUS_CODES.pass ||
					duplicateReport.statusCode ===
						DUPLICATE_CHECK_STATUS_CODES.unavailable);

			const combinedReport = {
				ok,
				generatedAt: new Date().toISOString(),
				governance: governanceReport,
				duplication: duplicateReport,
			};

			process.stdout.write(`${JSON.stringify(combinedReport, null, 2)}\n`);
			process.exitCode = ok ? duplicateReport.statusCode : 1;
			return;
		}

		process.stdout.write(`${JSON.stringify(governanceReport, null, 2)}\n`);
		process.exitCode = governanceReport.ok ? 0 : 1;
	} catch (error) {
		process.stdout.write(
			`${JSON.stringify(
				{
					ok: false,
					generatedAt: new Date().toISOString(),
					error: error instanceof Error ? error.message : String(error),
				},
				null,
				2,
			)}\n`,
		);
		process.exitCode = 1;
	}
}

if (isDirectExecution()) {
	await main();
}

export {
	CODE_EXTENSIONS,
	DEFAULT_ROOTS,
	DEFAULT_EXCLUDED_DIR_NAMES,
	DEFAULT_DUPLICATION_THRESHOLD_PERCENT,
	DUPLICATE_CHECK_STATUS_CODES,
	ERROR_THRESHOLD,
	EXCLUDED_FILE_PATTERNS,
	WARNING_THRESHOLD,
	parseCliOptions,
	runDuplicateRateCheck,
	runFileGovernance,
};
