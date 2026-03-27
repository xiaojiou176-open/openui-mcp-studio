import { describe, expect, it } from "vitest";
import { shouldFailStrictA11y } from "../tooling/uiux-a11y-engine.js";

describe("uiux a11y engine strict gate", () => {
	it("fails strict mode when axe violations exist", () => {
		expect(
			shouldFailStrictA11y([
				{
					file: "index.html",
					violations: [
						{
							id: "image-alt",
							impact: "critical",
							description: "Images must have alternate text",
							help: "Provide alt text",
							helpUrl: "https://dequeuniversity.com/rules/axe/4.11/image-alt",
							nodes: [{ target: ["img"] }],
						},
					],
				},
			]),
		).toBe(true);
	});

	it("passes strict mode when no violations exist", () => {
		expect(
			shouldFailStrictA11y([
				{
					file: "index.html",
					violations: [],
				},
			]),
		).toBe(false);
	});
});
