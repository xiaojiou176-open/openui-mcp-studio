import { describe, expect, it } from "vitest";
import {
	evaluateDialogHeuristics,
	hasAssociatedControlLabel,
	hasButtonAccessibleNameHeuristic,
} from "../services/mcp-server/src/uiux/review-heuristics.js";

describe("review heuristics direct branches", () => {
	it("treats native dialog markup as having an escape close path", () => {
		const result = evaluateDialogHeuristics(`
			<main>
				<a href="#outside">Outside focus</a>
				<dialog open>
					<button type="button">Confirm</button>
				</dialog>
			</main>
		`);

		expect(result.missingEscClosePath).toBe(false);
		expect(result.missingInitialFocusClue).toBe(false);
		expect(result.focusTrapRisk).toBe(true);
	});

	it("clears dialog risk flags when escape, initial focus, and focus trap clues exist", () => {
		const result = evaluateDialogHeuristics(`
			<main inert>
				<button type="button">Open</button>
				<div
					role="dialog"
					aria-modal="true"
					aria-keyshortcuts="Escape"
					onOpenAutoFocus={() => {}}
					onInteractOutside={() => {}}
				>
					<button type="button" autofocus>Confirm</button>
				</div>
			</main>
		`);

		expect(result).toEqual({
			missingEscClosePath: false,
			missingInitialFocusClue: false,
			focusTrapRisk: false,
		});
	});

	it("recognizes hidden, wrapped, labelled, and unlabeled controls", () => {
		expect(
			hasAssociatedControlLabel(
				`<input id="hidden-token" type="hidden" />`,
				`<input id="hidden-token" type="hidden" />`,
				0,
			),
		).toBe(true);

		const wrappedHtml = `<label>Email <input id="email" /></label>`;
		const wrappedIndex = wrappedHtml.indexOf("<input");
		expect(
			hasAssociatedControlLabel(
				wrappedHtml,
				`<input id="email" />`,
				wrappedIndex,
			),
		).toBe(true);

		const forHtml = `<label for="name">Name</label><input id="name" />`;
		const forIndex = forHtml.indexOf("<input");
		expect(
			hasAssociatedControlLabel(forHtml, `<input id="name" />`, forIndex),
		).toBe(true);

		const unlabeledHtml = `<div><input id="orphan" /></div>`;
		const unlabeledIndex = unlabeledHtml.indexOf("<input");
		expect(
			hasAssociatedControlLabel(
				unlabeledHtml,
				`<input id="orphan" />`,
				unlabeledIndex,
			),
		).toBe(false);
	});

	it("flags icon-only buttons without an accessible name", () => {
		expect(
			hasButtonAccessibleNameHeuristic(`
				<button type="button" aria-label="Open menu">
					<svg aria-hidden="true"></svg>
				</button>
			`),
		).toBe(false);

		expect(
			hasButtonAccessibleNameHeuristic(`
				<button type="button">
					<svg aria-hidden="true"></svg>
				</button>
			`),
		).toBe(true);
	});
});
