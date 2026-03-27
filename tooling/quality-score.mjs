import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { resolveRunLayout } from "./shared/run-layout.mjs";

const DEFAULT_CI_SUMMARY_PATH = ".runtime-cache/runs/<latest-run>/summary.json";
const DEFAULT_QUALITY_SCORE_PATH = ".runtime-cache/runs/<latest-run>/quality-score.json";
const SUMMARY_ROOT_DIR = ".runtime-cache/runs";
const DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD = 85;

const STATUS_SCORES = Object.freeze({
	passed: 100,
	passed_with_warnings: 85,
	warning: 70,
	skipped: 60,
	failed: 0,
});

const SCORE_COMPONENTS = Object.freeze([
	Object.freeze({
		key: "tests",
		weight: 20,
		optional: false,
		taskMatcher: (task) => task.id === "test",
	}),
	Object.freeze({
		key: "e2e",
		weight: 20,
		optional: false,
		taskMatcher: (task) =>
			task.id === "testE2E" ||
			task.id === "smokeE2E" ||
			task.id === "testE2EResilience" ||
			task.id === "testE2EFirefox" ||
			task.id === "testE2EWebkit",
	}),
	Object.freeze({
		key: "live",
		weight: 10,
		optional: true,
		taskMatcher: (task) =>
			task.id.toLowerCase().includes("live") ||
			task.command.toLowerCase().includes("test:live"),
	}),
		Object.freeze({
			key: "mutation",
			weight: 15,
			optional: true,
			taskMatcher: (task) => task.id === "mutationFullGate",
		}),
	Object.freeze({
		key: "coverage",
		weight: 15,
		optional: false,
		taskMatcher: (task) =>
			task.id === "testCoverageAdvisory" || task.id === "coreCoverageGate",
	}),
	Object.freeze({
		key: "coreGates",
		weight: 20,
		optional: false,
		taskMatcher: (task) =>
			task.id === "audit" ||
			task.id === "lint" ||
			task.id === "envContract" ||
			task.id === "envGovernance" ||
			task.id === "iacConsistency" ||
			task.id === "typecheck" ||
			task.id === "build" ||
			task.id === "coreCoverageGate",
	}),
]);

function roundTo(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function resolveTaskStatus(task) {
	const normalized = String(task?.status ?? "").trim();
	if (normalized && Object.hasOwn(STATUS_SCORES, normalized)) {
		return normalized;
	}
	return "failed";
}

function scoreFromStatus(status) {
	return STATUS_SCORES[status] ?? 0;
}

function summarizeBucket(tasks, { optional }) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return {
			present: false,
			optional,
			score: null,
			status: optional ? "not_present" : "missing",
			taskCount: 0,
			statusCounts: {
				passed: 0,
				warning: 0,
				failed: 0,
				skipped: 0,
			},
			tasks: [],
		};
	}

	const statusCounts = {
		passed: 0,
		warning: 0,
		failed: 0,
		skipped: 0,
	};

	let total = 0;
	let allSkipped = true;
	let hasWarning = false;
	let hasFailure = false;

	for (const task of tasks) {
		const status = resolveTaskStatus(task);
		const score = scoreFromStatus(status);
		total += score;
		if (status !== "skipped") {
			allSkipped = false;
		}
		if (status === "failed") {
			hasFailure = true;
			statusCounts.failed += 1;
		} else if (status === "warning" || status === "passed_with_warnings") {
			hasWarning = true;
			statusCounts.warning += 1;
		} else if (status === "skipped") {
			statusCounts.skipped += 1;
		} else {
			statusCounts.passed += 1;
		}
	}

	const score = roundTo(total / tasks.length);
	const status = hasFailure
		? "failed"
		: hasWarning
			? "warning"
			: allSkipped
				? "skipped"
				: "passed";

	return {
		present: true,
		optional,
		score,
		status,
		taskCount: tasks.length,
		statusCounts,
		tasks: tasks.map((task) => ({
			id: task.id,
			status: resolveTaskStatus(task),
			exitCode: task.exitCode ?? null,
			stageId: task.stageId,
		})),
	};
}

function collectTasks(summary) {
	const stages = Array.isArray(summary?.stages) ? summary.stages : [];
	const tasks = [];
	for (const stage of stages) {
		const stageId = String(stage?.id ?? "");
		for (const task of Array.isArray(stage?.tasks) ? stage.tasks : []) {
			tasks.push({
				id: String(task?.id ?? ""),
				command: String(task?.command ?? ""),
				status: String(task?.status ?? ""),
				exitCode: task?.exitCode,
				stageId,
			});
		}
	}
	return tasks;
}

function pickGrade(score) {
	if (score >= 95) {
		return "excellent";
	}
	if (score >= 85) {
		return "strong";
	}
	if (score >= 70) {
		return "moderate";
	}
	return "weak";
}

function generateQualityScoreFromSummary(summary, options = {}) {
	const summaryPath = String(options.summaryPath ?? DEFAULT_CI_SUMMARY_PATH);
	const allTasks = collectTasks(summary);

	const components = {};
	let weightedTotal = 0;
	let appliedWeight = 0;
	const missingRequiredComponents = [];

	for (const component of SCORE_COMPONENTS) {
		const selected = allTasks.filter(component.taskMatcher);
		const bucket = summarizeBucket(selected, { optional: component.optional });
		components[component.key] = {
			weight: component.weight,
			...bucket,
		};

		if (typeof bucket.score === "number") {
			weightedTotal += bucket.score * component.weight;
			appliedWeight += component.weight;
		} else if (!component.optional) {
			// Required components must not be skipped in aggregation.
			missingRequiredComponents.push(component.key);
			appliedWeight += component.weight;
		}
	}

	const baseScore =
		appliedWeight > 0 ? roundTo(weightedTotal / appliedWeight) : 0;
	const hasMissingRequired = missingRequiredComponents.length > 0;
	const overallScore = hasMissingRequired ? 0 : baseScore;
	const overallStatus = hasMissingRequired
		? "fail"
		: overallScore >= 85
			? "pass"
			: overallScore >= 70
				? "needs_attention"
				: "fail";

	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		summaryPath,
		overall: {
			score: overallScore,
			grade: pickGrade(overallScore),
			status: overallStatus,
			weightApplied: appliedWeight,
			requiredComponentsMissing: missingRequiredComponents,
		},
		components,
	};
}

function assertOutputPathIsSafe(outputPath) {
	if (!outputPath || outputPath.trim().length === 0) {
		throw new Error("Output path cannot be empty.");
	}
	if (path.isAbsolute(outputPath)) {
		throw new Error("Output path must be workspace-relative.");
	}
	if (!outputPath.endsWith(".json")) {
		throw new Error("Output path must use .json extension.");
	}
	if (!/\.runtime-cache\/runs\/[^/]+\/quality-score\.json$/u.test(outputPath)) {
		throw new Error(
			`Output path must target .runtime-cache/runs/<run_id>/quality-score.json (received: ${outputPath}).`,
		);
	}
	const workspaceRoot = path.resolve(process.cwd());
	const allowedRoot = path.resolve(workspaceRoot, SUMMARY_ROOT_DIR);
	const resolvedPath = path.resolve(workspaceRoot, outputPath);
	const relative = path.relative(allowedRoot, resolvedPath);
	const outside = relative.startsWith("..") || path.isAbsolute(relative);
	if (outside) {
		throw new Error(
			`Output path must stay within ${SUMMARY_ROOT_DIR} (received: ${outputPath}).`,
		);
	}
}

function isPathOutsideRoot(rootPath, candidatePath) {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function isErrorWithCode(error, code) {
	return (
		Boolean(error) &&
		typeof error === "object" &&
		"code" in error &&
		error.code === code
	);
}

async function resolveSafeOutputWriteTarget(outputPath) {
	assertOutputPathIsSafe(outputPath);

	const workspaceRoot = await realpath(process.cwd());
	const allowedRoot = path.resolve(workspaceRoot, SUMMARY_ROOT_DIR);
	const resolvedPath = path.resolve(workspaceRoot, outputPath);
	const outputDir = path.dirname(resolvedPath);

	await mkdir(allowedRoot, { recursive: true });
	const allowedRootRealPath = await realpath(allowedRoot);
	if (isPathOutsideRoot(workspaceRoot, allowedRootRealPath)) {
		throw new Error(
			`Output path root ${SUMMARY_ROOT_DIR} resolves outside workspace via symlink.`,
		);
	}

	await mkdir(outputDir, { recursive: true });
	const outputDirRealPath = await realpath(outputDir);
	if (isPathOutsideRoot(allowedRootRealPath, outputDirRealPath)) {
		throw new Error(
			`Output path directory resolves outside ${SUMMARY_ROOT_DIR} via symlink (received: ${outputPath}).`,
		);
	}

	try {
		const targetStats = await lstat(resolvedPath);
		if (targetStats.isSymbolicLink()) {
			throw new Error(
				`Output path target must not be a symlink (received: ${outputPath}).`,
			);
		}
		const targetRealPath = await realpath(resolvedPath);
		if (isPathOutsideRoot(allowedRootRealPath, targetRealPath)) {
			throw new Error(
				`Output path target resolves outside ${SUMMARY_ROOT_DIR} via symlink (received: ${outputPath}).`,
			);
		}
	} catch (error) {
		if (!isErrorWithCode(error, "ENOENT")) {
			throw error;
		}
	}

	return resolvedPath;
}

async function writeQualityScoreFile(outputPath, report) {
	const resolvedPath = await resolveSafeOutputWriteTarget(outputPath);
	await writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function parseCliArgs(argv) {
	let ciSummaryPath = "";
	let outputPath = "";

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--ci-summary") {
			const nextValue = argv[index + 1];
			if (!nextValue) {
				throw new Error("--ci-summary requires a file path.");
			}
			ciSummaryPath = nextValue;
			index += 1;
			continue;
		}
		if (argument.startsWith("--ci-summary=")) {
			ciSummaryPath = argument.slice("--ci-summary=".length);
			continue;
		}
		if (argument === "--out") {
			const nextValue = argv[index + 1];
			if (!nextValue) {
				throw new Error("--out requires a file path.");
			}
			outputPath = nextValue;
			index += 1;
			continue;
		}
		if (argument.startsWith("--out=")) {
			outputPath = argument.slice("--out=".length);
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}

	return {
		ciSummaryPath: ciSummaryPath.trim(),
		outputPath: outputPath.trim(),
	};
}

function isDirectExecution() {
	if (!process.argv[1]) {
		return false;
	}
	return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
	try {
		const { ciSummaryPath, outputPath } = parseCliArgs(process.argv.slice(2));
		const layout =
			ciSummaryPath || outputPath
				? null
				: await resolveRunLayout({
						preferLatestExistingRun: true,
						requiredRunFiles: ["summary.json"],
					});
		const finalSummaryPath =
			ciSummaryPath || layout?.summaryPathRelative || DEFAULT_CI_SUMMARY_PATH;
		const finalOutputPath =
			outputPath || layout?.qualityScorePathRelative || DEFAULT_QUALITY_SCORE_PATH;
		const summaryRaw = await readFile(finalSummaryPath, "utf8");
		const summary = JSON.parse(summaryRaw);
		const report = generateQualityScoreFromSummary(summary, {
			summaryPath: finalSummaryPath,
		});
		await writeQualityScoreFile(finalOutputPath, report);
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		process.exitCode = 0;
	} catch (error) {
		process.stderr.write(
			`quality-score runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	}
}

export {
	DEFAULT_CI_SUMMARY_PATH,
	DEFAULT_QUALITY_SCORE_BLOCKING_THRESHOLD,
	DEFAULT_QUALITY_SCORE_PATH,
	generateQualityScoreFromSummary,
	resolveSafeOutputWriteTarget,
	writeQualityScoreFile,
};
