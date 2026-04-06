#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SNAPSHOTS_PATH = ".runtime-cache/reports/quality-trend/snapshots.json";
const DEFAULT_OUTPUT_PATH =
	".runtime-cache/reports/quality-trend/quality-score-calibration.json";
const DEFAULT_MIN_SAMPLES = 10;
const DEFAULT_FALLBACK_THRESHOLD = 85;

function parseArgs(argv) {
	const options = {
		snapshotsPath: DEFAULT_SNAPSHOTS_PATH,
		outputPath: DEFAULT_OUTPUT_PATH,
		minSamples: DEFAULT_MIN_SAMPLES,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--snapshots") {
			options.snapshotsPath = String(argv[index + 1] ?? "").trim();
			index += 1;
			continue;
		}
		if (argument.startsWith("--snapshots=")) {
			options.snapshotsPath = argument.slice("--snapshots=".length).trim();
			continue;
		}
		if (argument === "--out") {
			options.outputPath = String(argv[index + 1] ?? "").trim();
			index += 1;
			continue;
		}
		if (argument.startsWith("--out=")) {
			options.outputPath = argument.slice("--out=".length).trim();
			continue;
		}
		if (argument === "--min-samples") {
			const parsed = Number(argv[index + 1]);
			if (Number.isInteger(parsed) && parsed > 0) {
				options.minSamples = parsed;
			}
			index += 1;
			continue;
		}
		if (argument.startsWith("--min-samples=")) {
			const parsed = Number(argument.slice("--min-samples=".length));
			if (Number.isInteger(parsed) && parsed > 0) {
				options.minSamples = parsed;
			}
			continue;
		}
		throw new Error(`Unknown argument: ${argument}`);
	}

	if (!options.snapshotsPath) {
		throw new Error("snapshots path cannot be empty");
	}
	if (!options.outputPath) {
		throw new Error("output path cannot be empty");
	}
	return options;
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function percentile(sortedValues, ratio) {
	if (sortedValues.length === 0) {
		return null;
	}
	const safeRatio = clamp(ratio, 0, 1);
	const index = Math.floor((sortedValues.length - 1) * safeRatio);
	return sortedValues[index] ?? null;
}

function roundTo(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function getQualityScores(snapshots) {
	if (!Array.isArray(snapshots)) {
		return [];
	}
	return snapshots
		.map((item) => Number(item?.metrics?.qualityScore))
		.filter((value) => Number.isFinite(value))
		.map((value) => clamp(value, 0, 100))
		.sort((left, right) => left - right);
}

function buildCalibrationReport(scores, minSamples) {
	const sampleCount = scores.length;
	const p25 = percentile(scores, 0.25);
	const p50 = percentile(scores, 0.5);
	const p75 = percentile(scores, 0.75);
	const mean =
		sampleCount > 0
			? roundTo(scores.reduce((sum, score) => sum + score, 0) / sampleCount)
			: null;

	if (sampleCount < minSamples || p25 === null) {
		return {
			version: 1,
			generatedAt: new Date().toISOString(),
			status: "insufficient_samples",
			sampleCount,
			minSamples,
			statistics: { p25, p50, p75, mean },
			suggestedThreshold: DEFAULT_FALLBACK_THRESHOLD,
			reason:
				"insufficient historical samples; keep default threshold and continue collecting snapshots",
		};
	}

	// Conservative policy: use p25 - 2 as a guardrail, but keep within [80, 90].
	const suggestedThreshold = clamp(Math.floor(p25 - 2), 80, 90);
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		status: "ready",
		sampleCount,
		minSamples,
		statistics: {
			p25: roundTo(p25),
			p50: roundTo(p50),
			p75: roundTo(p75),
			mean,
		},
		suggestedThreshold,
		reason:
			"suggested threshold derived from historical qualityScore distribution (p25-2, clamped to 80..90)",
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const snapshotsText = await readFile(options.snapshotsPath, "utf8");
	const snapshots = JSON.parse(snapshotsText);
	const scores = getQualityScores(snapshots);
	const report = buildCalibrationReport(scores, options.minSamples);

	const absoluteOutputPath = path.resolve(options.outputPath);
	await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
	await writeFile(
		absoluteOutputPath,
		`${JSON.stringify(
			{
				...report,
				snapshotsPath: options.snapshotsPath,
				outputPath: options.outputPath,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function isDirectExecution() {
	const entry = process.argv[1];
	if (!entry) {
		return false;
	}
	return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectExecution()) {
	main().catch((error) => {
		process.stderr.write(
			`quality-score-calibrate runtime error: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exit(1);
	});
}

export { buildCalibrationReport, getQualityScores, main, parseArgs };
