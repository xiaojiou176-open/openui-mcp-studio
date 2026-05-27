import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type VisualDiffThresholds = {
	maxDiffPixels: number;
	maxDiffRatio: number;
	pixelmatchThreshold: number;
};

export type VisualDiffResult = {
	width: number;
	height: number;
	diffPixels: number;
	diffRatio: number;
	passed: boolean;
	reason: string;
	diffPngBuffer: Buffer | null;
};

export function comparePngBuffers(input: {
	baselineBuffer: Buffer;
	actualBuffer: Buffer;
	thresholds: VisualDiffThresholds;
}): VisualDiffResult {
	const baseline = PNG.sync.read(input.baselineBuffer);
	const actual = PNG.sync.read(input.actualBuffer);

	if (baseline.width !== actual.width || baseline.height !== actual.height) {
		return {
			width: actual.width,
			height: actual.height,
			diffPixels: Number.POSITIVE_INFINITY,
			diffRatio: Number.POSITIVE_INFINITY,
			passed: false,
			reason: `Image dimension mismatch (baseline=${baseline.width}x${baseline.height}, actual=${actual.width}x${actual.height}).`,
			diffPngBuffer: null,
		};
	}

	const width = baseline.width;
	const height = baseline.height;
	const diff = new PNG({ width, height });

	const diffPixels = pixelmatch(
		baseline.data,
		actual.data,
		diff.data,
		width,
		height,
		{
			threshold: input.thresholds.pixelmatchThreshold,
		},
	);
	const totalPixels = width * height;
	const diffRatio = totalPixels === 0 ? 0 : diffPixels / totalPixels;

	const passed =
		diffPixels <= input.thresholds.maxDiffPixels &&
		diffRatio <= input.thresholds.maxDiffRatio;

	const reason = passed
		? `Visual diff passed (diffPixels=${diffPixels}, diffRatio=${diffRatio.toFixed(6)}).`
		: `Visual diff failed (diffPixels=${diffPixels}/${input.thresholds.maxDiffPixels}, diffRatio=${diffRatio.toFixed(6)}/${input.thresholds.maxDiffRatio}).`;

	return {
		width,
		height,
		diffPixels,
		diffRatio,
		passed,
		reason,
		diffPngBuffer: PNG.sync.write(diff),
	};
}
