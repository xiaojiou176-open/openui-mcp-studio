import { describe, expect, it } from "vitest";
import {
	evaluateStateCoverageHeuristic,
	hasInsufficientStaticNonTextContrastHeuristic,
	hasInsufficientStaticTextContrastHeuristic,
} from "../services/mcp-server/src/uiux/review-heuristics.js";

describe("review heuristics state and contrast branches", () => {
	it("detects missing and complete state coverage signals", () => {
		expect(
			evaluateStateCoverageHeuristic("<main><h1>Dashboard</h1></main>"),
		).toEqual({
			missingLoading: true,
			missingError: true,
			missingEmpty: true,
			missingDisabled: true,
			missingSuccess: true,
		});

		expect(
			evaluateStateCoverageHeuristic(`
				<section aria-busy="true">
					<div role="alert">Error loading data</div>
					<div data-state="empty">No results</div>
					<button disabled>Retry</button>
					<p data-state="success">Saved successfully</p>
				</section>
			`),
		).toEqual({
			missingLoading: false,
			missingError: false,
			missingEmpty: false,
			missingDisabled: false,
			missingSuccess: false,
		});
	});

	it("flags insufficient text and non-text contrast from static inline styles", () => {
		expect(
			hasInsufficientStaticTextContrastHeuristic(`
				<p style="color:#aaaaaa; background-color:#ffffff">Low contrast text</p>
			`),
		).toBe(true);
		expect(
			hasInsufficientStaticTextContrastHeuristic(`
				<p style="color:#111111; background-color:#ffffff">Readable text</p>
			`),
		).toBe(false);

		expect(
			hasInsufficientStaticNonTextContrastHeuristic(`
				<button style="border:1px solid #d0d0d0; background:#ffffff">Ghost</button>
			`),
		).toBe(true);
		expect(
			hasInsufficientStaticNonTextContrastHeuristic(`
				<button style="border:1px solid #111111; background:#ffffff">Strong border</button>
			`),
		).toBe(false);
	});
});
