import { describe, expect, it } from "vitest";
import {
	formatErrorTypes,
	percentile,
	type StressRecord,
	summarizeByOperation,
} from "../tooling/stress-metrics.ts";

describe("stress metrics helpers", () => {
	it("calculates percentile with interpolation", () => {
		const values = [10, 20, 30, 40, 50];

		expect(percentile(values, 0.5)).toBe(30);
		expect(percentile(values, 0.95)).toBe(48);
	});

	it("summarizes records by target and operation", () => {
		const records: StressRecord[] = [
			{ target: "sidecar", operation: "health", ok: true, latencyMs: 10 },
			{
				target: "sidecar",
				operation: "health",
				ok: false,
				latencyMs: 20,
				errorType: "SIDECAR_TIMEOUT",
			},
			{ target: "sidecar", operation: "list_models", ok: true, latencyMs: 30 },
		];

		const summary = summarizeByOperation({
			records,
			elapsedMs: 1000,
		});

		const health = summary.find((item) => item.operation === "health");
		expect(health).toEqual(
			expect.objectContaining({
				operation: "health",
			}),
		);
		expect(health?.total).toBe(2);
		expect(health?.failure).toBe(1);
		expect(health?.successRate).toBe(50);
		expect(health?.errorTypes).toEqual({ SIDECAR_TIMEOUT: 1 });

		const listModels = summary.find((item) => item.operation === "list_models");
		expect(listModels?.total).toBe(1);
		expect(listModels?.successRate).toBe(100);
	});

	it("formats empty and populated error buckets", () => {
		expect(formatErrorTypes({})).toBe("-");
		expect(formatErrorTypes({ A: 2, B: 1 })).toBe("A:2,B:1");
	});
});
