#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { resolveRunLayout } from "./shared/run-layout.mjs";

const DEFAULT_SUMMARY_PATH = ".runtime-cache/runs/<latest-run>/summary.json";
const DEFAULT_OUTPUT_PATH = "";
const DEFAULT_COMPAT_OUTPUT_PATH = "";
const DEFAULT_HISTORY_PATH = "";
const DEFAULT_PLAYWRIGHT_DIRS = [];
const DEFAULT_WINDOW_SIZE = 20;
const DEFAULT_THRESHOLD_PERCENT = 1;

function parseNumber(value, fallback) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return parsed;
}

function toIsoTimestamp(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		return null;
	}
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		return null;
	}
	return new Date(parsed).toISOString();
}

function roundTo(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

async function readJson(filePath) {
	try {
		const content = await readFile(filePath, "utf8");
		try {
			return {
				path: filePath,
				status: "available",
				data: JSON.parse(content),
			};
		} catch (error) {
			return {
				path: filePath,
				status: "invalid",
				reason: `invalid_json:${error instanceof Error ? error.message : String(error)}`,
				data: null,
			};
		}
	} catch (error) {
		const code =
			error && typeof error === "object" && "code" in error
				? error.code
				: "UNKNOWN";
		if (code === "ENOENT") {
			return {
				path: filePath,
				status: "unavailable",
				reason: "not_found",
				data: null,
			};
		}
		return {
			path: filePath,
			status: "unavailable",
			reason: `read_error:${error instanceof Error ? error.message : String(error)}`,
			data: null,
		};
	}
}

function parseConfiguredRetries(command) {
	if (typeof command !== "string") {
		return null;
	}
	const match = command.match(/--retries=(\d+)/);
	if (!match) {
		return null;
	}
	return parseNumber(match[1], null);
}

function parseObservedRetryStats(stdout, stderr) {
	const text = `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
	const retryMatches = Array.from(
		text.matchAll(/\bretry(?:\s*#|\s+)?(\d+)\b/gi),
	);
	const retryEvents = retryMatches.length;
	const maxRetryObserved = retryMatches.reduce((maxValue, match) => {
		const parsed = parseNumber(match[1], 0);
		return parsed > maxValue ? parsed : maxValue;
	}, 0);
	return {
		retryEvents,
		maxRetryObserved,
		flaggedFlaky: retryEvents > 0 || /\bflaky\b/i.test(text),
	};
}

function extractPlaywrightTaskStats(summary) {
	const stages = Array.isArray(summary?.stages) ? summary.stages : [];
	const playwrightTasks = [];
	for (const stage of stages) {
		const tasks = Array.isArray(stage?.tasks) ? stage.tasks : [];
		for (const task of tasks) {
			const command = String(task?.command ?? "");
			const id = String(task?.id ?? "");
			if (!command.includes("playwright test") && !id.startsWith("testE2E")) {
				continue;
			}
			playwrightTasks.push(task);
		}
	}

	const configuredRetries = playwrightTasks
		.map((task) => parseConfiguredRetries(task?.command))
		.filter((value) => typeof value === "number");
	const configuredRetryCap =
		configuredRetries.length > 0 ? Math.max(...configuredRetries) : null;

	let retryEvents = 0;
	let tasksWithObservedRetries = 0;
	let maxObservedRetry = 0;
	let flakyTasks = 0;

	for (const task of playwrightTasks) {
		const observed = parseObservedRetryStats(task?.stdout, task?.stderr);
		retryEvents += observed.retryEvents;
		if (observed.retryEvents > 0) {
			tasksWithObservedRetries += 1;
		}
		if (observed.maxRetryObserved > maxObservedRetry) {
			maxObservedRetry = observed.maxRetryObserved;
		}
		if (observed.flaggedFlaky) {
			flakyTasks += 1;
		}
	}

	return {
		totalPlaywrightTasks: playwrightTasks.length,
		tasksWithConfiguredRetries: configuredRetries.length,
		configuredRetryCap,
		tasksWithObservedRetries,
		retryEvents,
		maxObservedRetry,
		flakyTasks,
	};
}

async function readPlaywrightLastRuns(directories) {
	const results = [];
	for (const directory of directories) {
		const filePath = path.join(directory, ".last-run.json");
		const parsed = await readJson(filePath);
		const failedTests = Array.isArray(parsed.data?.failedTests)
			? parsed.data.failedTests.length
			: 0;
		results.push({
			directory,
			path: filePath,
			status: parsed.status,
			reason: parsed.reason ?? null,
			runStatus:
				typeof parsed.data?.status === "string"
					? parsed.data.status
					: "unknown",
			failedTests,
		});
	}
	return results;
}

function computePlaywrightLastRunSummary(playwrightLastRuns) {
	const available = playwrightLastRuns.filter(
		(run) => run.status === "available",
	);
	const unavailableCount = playwrightLastRuns.length - available.length;
	const failedProjectCount = available.filter(
		(run) => run.runStatus === "failed" || run.failedTests > 0,
	).length;
	const passedProjectCount = available.filter(
		(run) => run.runStatus === "passed" && run.failedTests === 0,
	).length;
	return {
		totalProjects: playwrightLastRuns.length,
		availableProjects: available.length,
		unavailableProjects: unavailableCount,
		failedProjectCount,
		passedProjectCount,
	};
}

function normalizeHistoryEntries(historyData) {
	const source = Array.isArray(historyData?.samples) ? historyData.samples : [];
	const normalized = source
		.map((entry) => ({
			runId: String(entry?.runId ?? ""),
			timestamp: toIsoTimestamp(entry?.timestamp) ?? null,
			flaky: entry?.flaky === true,
			retryEvents: parseNumber(entry?.retryEvents, 0),
			flakyTasks: parseNumber(entry?.flakyTasks, 0),
			playwrightTasks: parseNumber(entry?.playwrightTasks, 0),
			summaryOk: typeof entry?.summaryOk === "boolean" ? entry.summaryOk : null,
		}))
		.filter((entry) => entry.runId.length > 0 && entry.timestamp !== null)
		.map((entry) => ({
			...entry,
			timestamp: entry.timestamp ?? new Date().toISOString(),
		}));

	const deduped = new Map();
	for (const entry of normalized) {
		deduped.set(entry.runId, entry);
	}
	return Array.from(deduped.values()).sort((a, b) =>
		a.timestamp.localeCompare(b.timestamp),
	);
}

function computeWindowStats(entries, windowSize, thresholdPercent) {
	const windowEntries = entries.slice(-windowSize);
	const sampleCount = windowEntries.length;
	const flakyCount = windowEntries.filter((entry) => entry.flaky).length;
	const cleanCount = sampleCount - flakyCount;
	const retryEvents = windowEntries.reduce(
		(sum, entry) => sum + (entry.retryEvents || 0),
		0,
	);
	const flakyTasks = windowEntries.reduce(
		(sum, entry) => sum + (entry.flakyTasks || 0),
		0,
	);
	const totalPlaywrightTasks = windowEntries.reduce(
		(sum, entry) => sum + (entry.playwrightTasks || 0),
		0,
	);
	const flakeRate =
		sampleCount > 0 ? roundTo((flakyCount / sampleCount) * 100) : null;
	const breached =
		flakeRate !== null ? flakeRate > roundTo(thresholdPercent) : false;

	return {
		windowEntries,
		sampleCount,
		flakyCount,
		cleanCount,
		retryEvents,
		flakyTasks,
		totalPlaywrightTasks,
		flakeRate,
		breached,
	};
}

function parseArgs(argv) {
	let summaryPath = "";
	let outputPath = DEFAULT_OUTPUT_PATH;
	let compatOutputPath = DEFAULT_COMPAT_OUTPUT_PATH;
	let historyPath = DEFAULT_HISTORY_PATH;
	let windowSize = DEFAULT_WINDOW_SIZE;
	let thresholdPercent = DEFAULT_THRESHOLD_PERCENT;
	const playwrightDirs = [];

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--from-summary" || arg === "--summary") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error(`${arg} requires a file path.`);
			}
			summaryPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--from-summary=")) {
			summaryPath = arg.slice("--from-summary=".length);
			continue;
		}
		if (arg === "--output") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--output requires a file path.");
			}
			outputPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--output=")) {
			outputPath = arg.slice("--output=".length);
			continue;
		}
		if (arg === "--compat-output") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--compat-output requires a file path.");
			}
			compatOutputPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--compat-output=")) {
			compatOutputPath = arg.slice("--compat-output=".length);
			continue;
		}
		if (arg === "--history-file") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--history-file requires a file path.");
			}
			historyPath = value;
			index += 1;
			continue;
		}
		if (arg.startsWith("--history-file=")) {
			historyPath = arg.slice("--history-file=".length);
			continue;
		}
		if (arg === "--window-size") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--window-size requires a number.");
			}
			windowSize = parseNumber(value, DEFAULT_WINDOW_SIZE);
			index += 1;
			continue;
		}
		if (arg.startsWith("--window-size=")) {
			windowSize = parseNumber(
				arg.slice("--window-size=".length),
				DEFAULT_WINDOW_SIZE,
			);
			continue;
		}
		if (arg === "--threshold") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--threshold requires a number.");
			}
			thresholdPercent = parseNumber(value, DEFAULT_THRESHOLD_PERCENT);
			index += 1;
			continue;
		}
		if (arg.startsWith("--threshold=")) {
			thresholdPercent = parseNumber(
				arg.slice("--threshold=".length),
				DEFAULT_THRESHOLD_PERCENT,
			);
			continue;
		}
		if (arg === "--playwright-dir") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--playwright-dir requires a directory path.");
			}
			playwrightDirs.push(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--playwright-dir=")) {
			playwrightDirs.push(arg.slice("--playwright-dir=".length));
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return {
		summaryPath,
		outputPath,
		compatOutputPath,
		historyPath,
		windowSize: Math.max(1, Math.floor(windowSize)),
		thresholdPercent: roundTo(Math.max(0, thresholdPercent)),
		playwrightDirs:
			playwrightDirs.length > 0 ? playwrightDirs : DEFAULT_PLAYWRIGHT_DIRS,
	};
}

async function writeJson(filePath, payload) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const layout =
		options.summaryPath.trim().length > 0
			? null
			: await resolveRunLayout({
					preferLatestExistingRun: true,
					requiredRunFiles: ["summary.json"],
				});
	const effectiveSummaryPath =
		options.summaryPath || layout?.summaryPathRelative || DEFAULT_SUMMARY_PATH;
	const runRoot = path.dirname(effectiveSummaryPath);
	const effectiveOutputPath =
		options.outputPath || path.join(runRoot, "flake-rate.json");
	const effectiveCompatOutputPath =
		options.compatOutputPath || path.join(runRoot, "flake-metrics.json");
	const effectiveHistoryPath =
		options.historyPath || path.join(runRoot, "flake-rate-history.json");
	const effectivePlaywrightDirs =
		options.playwrightDirs.length > 0
			? options.playwrightDirs
			: [
				path.join(runRoot, "artifacts", "playwright"),
				path.join(runRoot, "artifacts", "playwright-firefox"),
				path.join(runRoot, "artifacts", "playwright-webkit"),
			];
	const nowIso = new Date().toISOString();

	const summaryInput = await readJson(effectiveSummaryPath);
	const historyInput = await readJson(effectiveHistoryPath);
	const playwrightLastRuns = await readPlaywrightLastRuns(effectivePlaywrightDirs);
	const summary = summaryInput.data;

	const taskStats = extractPlaywrightTaskStats(summary);
	const playwrightLastRunSummary =
		computePlaywrightLastRunSummary(playwrightLastRuns);

	const currentTimestamp =
		toIsoTimestamp(summary?.finishedAt) ??
		toIsoTimestamp(summary?.startedAt) ??
		nowIso;
	const runId = [
		toIsoTimestamp(summary?.startedAt) ?? "no-started-at",
		toIsoTimestamp(summary?.finishedAt) ?? "no-finished-at",
		String(summary?.ok ?? "unknown"),
	].join("|");
	const summaryOk = typeof summary?.ok === "boolean" ? summary.ok : null;
	const runFlaky =
		taskStats.flakyTasks > 0 ||
		(summaryOk === true && playwrightLastRunSummary.failedProjectCount > 0);

	const historyEntries = normalizeHistoryEntries(historyInput.data);
	historyEntries.push({
		runId,
		timestamp: currentTimestamp,
		flaky: runFlaky,
		retryEvents: taskStats.retryEvents,
		flakyTasks: taskStats.flakyTasks,
		playwrightTasks: taskStats.totalPlaywrightTasks,
		summaryOk,
	});
	const normalizedHistory = normalizeHistoryEntries({
		samples: historyEntries,
	});

	const windowStats = computeWindowStats(
		normalizedHistory,
		options.windowSize,
		options.thresholdPercent,
	);

	const payload = {
		version: 1,
		generatedAt: nowIso,
		window: {
			type: "latest-samples",
			size: options.windowSize,
			sampleCount: windowStats.sampleCount,
		},
		flakeRate: windowStats.flakeRate,
		flakyCount: windowStats.flakyCount,
		totalCount: windowStats.sampleCount,
		threshold: {
			percent: options.thresholdPercent,
			breached: windowStats.breached,
			comparator: ">",
		},
		retryStats: {
			currentRun: {
				configuredRetryCap: taskStats.configuredRetryCap,
				tasksWithConfiguredRetries: taskStats.tasksWithConfiguredRetries,
				tasksWithObservedRetries: taskStats.tasksWithObservedRetries,
				retryEvents: taskStats.retryEvents,
				maxObservedRetry: taskStats.maxObservedRetry,
				flakyTasks: taskStats.flakyTasks,
				totalPlaywrightTasks: taskStats.totalPlaywrightTasks,
			},
			window: {
				totalRetryEvents: windowStats.retryEvents,
				totalFlakyTasks: windowStats.flakyTasks,
				totalPlaywrightTasks: windowStats.totalPlaywrightTasks,
			},
		},
		currentRun: {
			runId,
			timestamp: currentTimestamp,
			summaryOk,
			flaky: runFlaky,
			playwrightLastRunSummary,
		},
		samples: {
			totalInHistory: normalizedHistory.length,
			inWindow: windowStats.sampleCount,
			flakyInWindow: windowStats.flakyCount,
			cleanInWindow: windowStats.cleanCount,
		},
		verdict: windowStats.breached ? "warning" : "ok",
		sources: {
			summary: {
				path: summaryInput.path,
				status: summaryInput.status,
				reason: summaryInput.reason ?? null,
			},
			history: {
				path: historyInput.path,
				status: historyInput.status,
				reason: historyInput.reason ?? null,
			},
			playwrightLastRuns,
		},
	};

	await writeJson(effectiveOutputPath, payload);
	await writeJson(effectiveCompatOutputPath, payload);
	await writeJson(effectiveHistoryPath, {
		version: 1,
		samples: normalizedHistory,
	});

	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
	process.stderr.write(
		`flake-metrics runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
