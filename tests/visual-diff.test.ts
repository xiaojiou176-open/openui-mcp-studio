import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparePngBuffers } from "../services/mcp-server/src/visual-diff.js";

function makeSolidPng(input: {
	width: number;
	height: number;
	rgba: [number, number, number, number];
}): Buffer {
	const png = new PNG({ width: input.width, height: input.height });
	for (let y = 0; y < input.height; y += 1) {
		for (let x = 0; x < input.width; x += 1) {
			const idx = (input.width * y + x) * 4;
			png.data[idx] = input.rgba[0];
			png.data[idx + 1] = input.rgba[1];
			png.data[idx + 2] = input.rgba[2];
			png.data[idx + 3] = input.rgba[3];
		}
	}
	return PNG.sync.write(png);
}

function setPixel(
	buffer: Buffer,
	width: number,
	x: number,
	y: number,
	rgba: [number, number, number, number],
): Buffer {
	const png = PNG.sync.read(buffer);
	const idx = (width * y + x) * 4;
	png.data[idx] = rgba[0];
	png.data[idx + 1] = rgba[1];
	png.data[idx + 2] = rgba[2];
	png.data[idx + 3] = rgba[3];
	return PNG.sync.write(png);
}

describe("comparePngBuffers", () => {
	it("passes for identical images", () => {
		const baseline = makeSolidPng({
			width: 4,
			height: 4,
			rgba: [255, 255, 255, 255],
		});
		const actual = makeSolidPng({
			width: 4,
			height: 4,
			rgba: [255, 255, 255, 255],
		});

		const result = comparePngBuffers({
			baselineBuffer: baseline,
			actualBuffer: actual,
			thresholds: {
				maxDiffPixels: 0,
				maxDiffRatio: 0,
				pixelmatchThreshold: 0.1,
			},
		});

		expect(result.passed).toBe(true);
		expect(result.diffPixels).toBe(0);
		expect(result.diffRatio).toBe(0);
	});

	it("fails when diff exceeds pixel threshold", () => {
		const baseline = makeSolidPng({
			width: 4,
			height: 4,
			rgba: [255, 255, 255, 255],
		});
		const actual = setPixel(baseline, 4, 0, 0, [0, 0, 0, 255]);

		const result = comparePngBuffers({
			baselineBuffer: baseline,
			actualBuffer: actual,
			thresholds: {
				maxDiffPixels: 0,
				maxDiffRatio: 1,
				pixelmatchThreshold: 0.1,
			},
		});

		expect(result.passed).toBe(false);
		expect(result.diffPixels).toBeGreaterThan(0);
		expect(result.reason).toContain("failed");
	});

	it("passes when diff equals configured pixel threshold boundary", () => {
		const baseline = makeSolidPng({
			width: 4,
			height: 4,
			rgba: [255, 255, 255, 255],
		});
		let actual = baseline;
		actual = setPixel(actual, 4, 0, 0, [0, 0, 0, 255]);
		actual = setPixel(actual, 4, 1, 0, [0, 0, 0, 255]);

		const result = comparePngBuffers({
			baselineBuffer: baseline,
			actualBuffer: actual,
			thresholds: {
				maxDiffPixels: 2,
				maxDiffRatio: 1,
				pixelmatchThreshold: 0.1,
			},
		});

		expect(result.diffPixels).toBe(2);
		expect(result.passed).toBe(true);
		expect(result.reason).toContain("passed");
		expect(result.diffPngBuffer).not.toBeNull();
	});

	it("fails when ratio exceeds threshold even if pixel cap allows it", () => {
		const baseline = makeSolidPng({
			width: 4,
			height: 4,
			rgba: [255, 255, 255, 255],
		});
		const actual = setPixel(baseline, 4, 0, 0, [0, 0, 0, 255]);

		const result = comparePngBuffers({
			baselineBuffer: baseline,
			actualBuffer: actual,
			thresholds: {
				maxDiffPixels: 10,
				maxDiffRatio: 0.05,
				pixelmatchThreshold: 0.1,
			},
		});

		expect(result.diffPixels).toBe(1);
		expect(result.diffRatio).toBeCloseTo(1 / 16, 6);
		expect(result.passed).toBe(false);
		expect(result.reason).toContain("failed");
	});

	it("fails for image dimension mismatch", () => {
		const baseline = makeSolidPng({
			width: 4,
			height: 4,
			rgba: [255, 255, 255, 255],
		});
		const actual = makeSolidPng({
			width: 5,
			height: 4,
			rgba: [255, 255, 255, 255],
		});

		const result = comparePngBuffers({
			baselineBuffer: baseline,
			actualBuffer: actual,
			thresholds: {
				maxDiffPixels: 100,
				maxDiffRatio: 1,
				pixelmatchThreshold: 0.1,
			},
		});

		expect(result.passed).toBe(false);
		expect(result.reason).toContain("dimension mismatch");
		expect(result.diffPngBuffer).toBeNull();
	});
});
