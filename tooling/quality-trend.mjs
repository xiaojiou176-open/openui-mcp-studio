#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { resolveRunLayout } from "./shared/run-layout.mjs";

const WINDOWS = Object.freeze({
	"14d": 14,
	"30d": 30,
});

const DEFAULT_WINDOW = "14d";
const OUTPUT_DIR = ".runtime-cache/reports/quality-trend";
const DEFAULT_REPORT_JSON_PATH = `${OUTPUT_DIR}/report.json`;
const DEFAULT_REPORT_MD_PATH = `${OUTPUT_DIR}/report.md`;
const HISTORY_SNAPSHOT_PATH = `${OUTPUT_DIR}/snapshots.json`;

function roundTo(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function parseNumeric(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function parseTimestamp(value) {
	if (typeof value !== "string" || value.trim().length === 0) {
		return null;
	}
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) {
		return null;
	}
	return new Date(timestamp).toISOString();
}

async function readJsonWithStatus(filePath) {
	try {
		const content = await readFile(filePath, "utf8");
		try {
			const json = JSON.parse(content);
			return {
				path: filePath,
				status: "available",
				data: json,
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

function parseMutationScore(mutationSummary) {
	const candidates = [
		mutationSummary?.mutationScore,
		mutationSummary?.score,
		mutationSummary?.mutation?.score,
	];
	for (const candidate of candidates) {
		const parsed = parseNumeric(candidate);
		if (parsed !== null) {
			return parsed;
		}
	}

	const killed = parseNumeric(mutationSummary?.total?.killed);
	const total = parseNumeric(mutationSummary?.total?.total);
	if (killed !== null && total !== null && total > 0) {
		return (killed / total) * 100;
	}
	return null;
}

function parseFlakeRate(flakeMetrics) {
	const candidates = [
		flakeMetrics?.flakeRate,
		flakeMetrics?.rate,
		flakeMetrics?.flake?.rate,
		flakeMetrics?.metrics?.flakeRate,
	];
	for (const candidate of candidates) {
		const parsed = parseNumeric(candidate);
		if (parsed !== null) {
			return parsed;
		}
	}

	const flaky = parseNumeric(flakeMetrics?.flakyCount);
	const total = parseNumeric(flakeMetrics?.totalCount);
	if (flaky !== null && total !== null && total > 0) {
		return (flaky / total) * 100;
	}
	return null;
}

function extractSnapshot(inputs, nowIso) {
	const ciSummary = inputs.ciSummary.data;
	const qualityScore = inputs.qualityScore.data;
	const mutationSummary = inputs.mutationSummary.data;
	const flakeMetrics = inputs.flakeMetrics.data;

	const timestamp =
		parseTimestamp(qualityScore?.generatedAt) ??
		parseTimestamp(ciSummary?.finishedAt) ??
		parseTimestamp(ciSummary?.startedAt) ??
		parseTimestamp(mutationSummary?.generatedAt) ??
		parseTimestamp(flakeMetrics?.generatedAt) ??
		nowIso;

	const qualityValue = parseNumeric(qualityScore?.overall?.score);
	const mutationValue = parseMutationScore(mutationSummary);
	const flakeValue = parseFlakeRate(flakeMetrics);
	const ciOk = typeof ciSummary?.ok === "boolean" ? ciSummary.ok : null;

	return {
		timestamp,
		metrics: {
			qualityScore: qualityValue !== null ? roundTo(qualityValue) : null,
			mutationScore: mutationValue !== null ? roundTo(mutationValue) : null,
			flakeRate: flakeValue !== null ? roundTo(flakeValue) : null,
			ciPassRate: ciOk === null ? null : ciOk ? 100 : 0,
		},
	};
}

function computeTrend(history, metricName) {
	const values = history
		.map((entry) => ({
			timestamp: entry.timestamp,
			value: parseNumeric(entry?.metrics?.[metricName]),
		}))
		.filter((entry) => entry.value !== null);

	if (values.length === 0) {
		return {
			status: "unavailable",
			current: null,
			previous: null,
			delta: null,
			direction: "unavailable",
		};
	}

	const current = values[values.length - 1].value;
	const previous = values.length > 1 ? values[values.length - 2].value : null;
	const delta = previous === null ? null : roundTo(current - previous);

	let direction = "flat";
	if (delta === null) {
		direction = "insufficient_history";
	} else if (delta > 0) {
		direction = "up";
	} else if (delta < 0) {
		direction = "down";
	}

	return {
		status: "available",
		current: roundTo(current),
		previous: previous === null ? null : roundTo(previous),
		delta,
		direction,
	};
}

function formatMetric(value, suffix = "") {
	return value === null ? "unavailable" : `${value}${suffix}`;
}

function renderMarkdown(report) {
	const lines = [];
	lines.push("# Quality Trend Report");
	lines.push("");
	lines.push(`- Generated at: ${report.generatedAt}`);
	lines.push(`- Window: ${report.window.label}`);
	lines.push(`- Points in window: ${report.history.length}`);
	lines.push("");
	lines.push("## Inputs");
	lines.push("");
	lines.push("| Input | Status | Path | Note |");
	lines.push("| --- | --- | --- | --- |");
	for (const [key, input] of Object.entries(report.inputs)) {
		const note = input.reason ? input.reason : "ok";
		lines.push(`| ${key} | ${input.status} | \`${input.path}\` | ${note} |`);
	}
	lines.push("");
	lines.push("## Current Snapshot");
	lines.push("");
	lines.push(`- Timestamp: ${report.current.timestamp}`);
	lines.push(
		`- qualityScore: ${formatMetric(report.current.metrics.qualityScore)}`,
	);
	lines.push(
		`- mutationScore: ${formatMetric(report.current.metrics.mutationScore, "%")}`,
	);
	lines.push(
		`- flakeRate: ${formatMetric(report.current.metrics.flakeRate, "%")}`,
	);
	lines.push(
		`- ciPassRate: ${formatMetric(report.current.metrics.ciPassRate, "%")}`,
	);
	lines.push("");
	lines.push("## Trend");
	lines.push("");
	lines.push("| Metric | Current | Previous | Delta | Direction |");
	lines.push("| --- | --- | --- | --- | --- |");
	const trendRows = [
		["qualityScore", report.trend.qualityScore, ""],
		["mutationScore", report.trend.mutationScore, "%"],
		["flakeRate", report.trend.flakeRate, "%"],
		["ciPassRate", report.trend.ciPassRate, "%"],
	];
	for (const [name, trendItem, suffix] of trendRows) {
		const current = formatMetric(trendItem.current, suffix);
		const previous = formatMetric(trendItem.previous, suffix);
		const delta = formatMetric(trendItem.delta, suffix);
		lines.push(
			`| ${name} | ${current} | ${previous} | ${delta} | ${trendItem.direction} |`,
		);
	}

	return `${lines.join("\n")}\n`;
}

async function loadHistory(snapshotPath) {
	const result = await readJsonWithStatus(snapshotPath);
	if (result.status !== "available") {
		return [];
	}
	if (!Array.isArray(result.data?.snapshots)) {
		return [];
	}
	return result.data.snapshots
		.filter((item) => typeof item?.timestamp === "string" && item?.metrics)
		.map((item) => ({
			timestamp: item.timestamp,
			metrics: {
				qualityScore: parseNumeric(item.metrics.qualityScore),
				mutationScore: parseNumeric(item.metrics.mutationScore),
				flakeRate: parseNumeric(item.metrics.flakeRate),
				ciPassRate: parseNumeric(item.metrics.ciPassRate),
			},
		}));
}

function dedupeHistory(entries) {
	const seen = new Map();
	for (const entry of entries) {
		const ts = parseTimestamp(entry.timestamp);
		if (!ts) {
			continue;
		}
		seen.set(ts, {
			timestamp: ts,
			metrics: entry.metrics,
		});
	}
	return Array.from(seen.values()).sort((a, b) =>
		a.timestamp.localeCompare(b.timestamp),
	);
}

function filterWindow(entries, days, nowIso) {
	const now = Date.parse(nowIso);
	const start = now - days * 24 * 60 * 60 * 1000;
	return entries.filter((entry) => {
		const ts = Date.parse(entry.timestamp);
		return !Number.isNaN(ts) && ts >= start && ts <= now;
	});
}

function parseArgs(argv) {
	let windowLabel = DEFAULT_WINDOW;
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--window") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--window requires a value (14d or 30d).");
			}
			windowLabel = value.trim();
			index += 1;
			continue;
		}
		if (arg.startsWith("--window=")) {
			windowLabel = arg.slice("--window=".length).trim();
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!Object.hasOwn(WINDOWS, windowLabel)) {
		throw new Error(
			`Unsupported --window value: ${windowLabel}. Use 14d or 30d.`,
		);
	}
	return {
		windowLabel,
		windowDays: WINDOWS[windowLabel],
	};
}

async function main() {
	const { windowLabel, windowDays } = parseArgs(process.argv.slice(2));
	const nowIso = new Date().toISOString();
	const layout = await resolveRunLayout({
		preferLatestExistingRun: true,
		requiredRunFiles: ["summary.json", "quality-score.json"],
	});
	const inputPaths = {
		ciSummary: layout.summaryPathRelative,
		qualityScore: layout.qualityScorePathRelative,
		mutationSummary: ".runtime-cache/mutation/mutation-summary.json",
		flakeMetrics: path.posix.join(layout.runRootRelative, "flake-metrics.json"),
	};

	const inputs = {
		ciSummary: await readJsonWithStatus(inputPaths.ciSummary),
		qualityScore: await readJsonWithStatus(inputPaths.qualityScore),
		mutationSummary: await readJsonWithStatus(inputPaths.mutationSummary),
		flakeMetrics: await readJsonWithStatus(inputPaths.flakeMetrics),
	};

	const current = extractSnapshot(inputs, nowIso);
	const previousSnapshots = await loadHistory(HISTORY_SNAPSHOT_PATH);
	const mergedHistory = dedupeHistory([...previousSnapshots, current]);
	const history = filterWindow(mergedHistory, windowDays, nowIso);

	const report = {
		version: 1,
		generatedAt: nowIso,
		window: {
			label: windowLabel,
			days: windowDays,
			startAt: new Date(
				Date.parse(nowIso) - windowDays * 24 * 60 * 60 * 1000,
			).toISOString(),
			endAt: nowIso,
		},
		inputs: {
			ciSummary: {
				path: inputs.ciSummary.path,
				status: inputs.ciSummary.status,
				reason: inputs.ciSummary.reason ?? null,
			},
			qualityScore: {
				path: inputs.qualityScore.path,
				status: inputs.qualityScore.status,
				reason: inputs.qualityScore.reason ?? null,
			},
			mutationSummary: {
				path: inputs.mutationSummary.path,
				status: inputs.mutationSummary.status,
				reason: inputs.mutationSummary.reason ?? null,
			},
			flakeMetrics: {
				path: inputs.flakeMetrics.path,
				status: inputs.flakeMetrics.status,
				reason: inputs.flakeMetrics.reason ?? null,
			},
		},
		current,
		history,
		trend: {
			qualityScore: computeTrend(history, "qualityScore"),
			mutationScore: computeTrend(history, "mutationScore"),
			flakeRate: computeTrend(history, "flakeRate"),
			ciPassRate: computeTrend(history, "ciPassRate"),
		},
	};

	const markdown = renderMarkdown(report);

	await mkdir(path.dirname(DEFAULT_REPORT_JSON_PATH), { recursive: true });
	await writeFile(
		DEFAULT_REPORT_JSON_PATH,
		`${JSON.stringify(report, null, 2)}\n`,
		"utf8",
	);
	await writeFile(DEFAULT_REPORT_MD_PATH, markdown, "utf8");
	await writeFile(
		HISTORY_SNAPSHOT_PATH,
		`${JSON.stringify({ snapshots: mergedHistory }, null, 2)}\n`,
		"utf8",
	);

	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
	process.stderr.write(
		`quality-trend runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
