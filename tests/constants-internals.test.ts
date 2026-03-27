import { describe, expect, it } from "vitest";
import { __test__ } from "../services/mcp-server/src/constants.js";

describe("constants internal guards", () => {
	it("rejects invalid finite positive and integer values", () => {
		expect(() => __test__.assertFinitePositiveNumber(0, "value")).toThrow(
			/value must resolve to a positive number/,
		);
		expect(() => __test__.assertFinitePositiveInteger(0, "value")).toThrow(
			/value must resolve to a positive integer/,
		);
		expect(() => __test__.assertFiniteNonNegativeInteger(-1, "value")).toThrow(
			/value must resolve to a non-negative integer/,
		);
	});
});
