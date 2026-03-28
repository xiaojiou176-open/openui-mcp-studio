import { describe, expect, it } from "vitest";
import {
	buildCalibrationReport,
	getQualityScores,
	parseArgs,
} from "../tooling/quality-score-calibrate.mjs";

describe("quality-score-calibrate", () => {
	it("extracts and sorts quality scores from snapshots", () => {
		const scores = getQualityScores([
			{ metrics: { qualityScore: 86.3 } },
			{ metrics: { qualityScore: 91.4 } },
			{ metrics: { qualityScore: 80.2 } },
			{ metrics: { qualityScore: "bad" } },
		]);
		expect(scores).toEqual([80.2, 86.3, 91.4]);
	});

	it("returns fallback policy when samples are insufficient", () => {
		const report = buildCalibrationReport([80, 82, 84], 10);
		expect(report.status).toBe("insufficient_samples");
		expect(report.suggestedThreshold).toBe(85);
	});

	it("returns bounded threshold when enough samples exist", () => {
		const report = buildCalibrationReport(
			[78, 80, 82, 84, 86, 88, 90, 91, 92, 93, 94, 95],
			10,
		);
		expect(report.status).toBe("ready");
		expect(report.suggestedThreshold).toBeGreaterThanOrEqual(80);
		expect(report.suggestedThreshold).toBeLessThanOrEqual(90);
	});

	it("parses CLI options with defaults and overrides", () => {
		const defaults = parseArgs([]);
		expect(defaults.minSamples).toBe(10);
		expect(defaults.snapshotsPath).toBe(
			".runtime-cache/reports/quality-trend/snapshots.json",
		);
		expect(defaults.outputPath).toBe(
			".runtime-cache/reports/quality-trend/quality-score-calibration.json",
		);

		const custom = parseArgs([
			"--snapshots",
			"custom-snapshots.json",
			"--out=custom-out.json",
			"--min-samples=20",
		]);
		expect(custom.snapshotsPath).toBe("custom-snapshots.json");
		expect(custom.outputPath).toBe("custom-out.json");
		expect(custom.minSamples).toBe(20);
	});
});
