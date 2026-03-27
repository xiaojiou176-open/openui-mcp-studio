import { describe, expect, it } from "vitest";
import {
	evaluateDialogHeuristics,
	evaluateStateCoverageHeuristic,
	evaluateTouchTargetHeuristic,
	hasAssociatedControlLabel,
	hasButtonAccessibleNameHeuristic,
	hasFocusIndicatorSuppressedHeuristic,
	hasFocusObscuredHeuristic,
	hasHardcodedColorLiteralHeuristic,
	hasInsufficientStaticNonTextContrastHeuristic,
	hasInsufficientStaticTextContrastHeuristic,
	hasMissingSkipLinkHeuristic,
	hasNonScaleSpacingHeuristic,
	hasPrimaryActionOverloadHeuristic,
} from "../services/mcp-server/src/uiux/review-heuristics.js";

describe("review heuristics low-core branches", () => {
	it("covers dialog branches for no-dialog, risky dialog, and mitigated dialog", () => {
		expect(evaluateDialogHeuristics("<main><p>No dialog</p></main>")).toEqual({
			missingEscClosePath: false,
			missingInitialFocusClue: false,
			focusTrapRisk: false,
		});

		expect(
			evaluateDialogHeuristics(`
				<main>
					<button>Outside Action</button>
					<div role="alertdialog">
						<input type="text" />
					</div>
				</main>
			`),
		).toEqual({
			missingEscClosePath: true,
			missingInitialFocusClue: false,
			focusTrapRisk: true,
		});

		expect(
			evaluateDialogHeuristics(`
				<main>
					<button>Outside Action</button>
					<div
						role="dialog"
						aria-modal="true"
						onEscapeKeyDown={() => {}}
						tabindex="-1"
					>
						<input type="text" />
					</div>
				</main>
			`),
		).toEqual({
			missingEscClosePath: false,
			missingInitialFocusClue: false,
			focusTrapRisk: false,
		});
	});

	it("detects touch-target, focus-indicator, and focus-obscured branches", () => {
		expect(
			evaluateTouchTargetHeuristic(`
				<button style="width:20px; height:20px;">Tiny</button>
			`),
		).toEqual({
			wcagFailure: true,
			recommendedGap: false,
		});

		expect(
			evaluateTouchTargetHeuristic(`
				<button style="width:30px; height:30px;">Medium</button>
			`),
		).toEqual({
			wcagFailure: false,
			recommendedGap: true,
		});

		expect(
			evaluateTouchTargetHeuristic(`
				<button style="width:24px; height:24px; padding:10px;">Padded</button>
			`),
		).toEqual({
			wcagFailure: false,
			recommendedGap: false,
		});

		expect(
			hasFocusIndicatorSuppressedHeuristic(
				`<button class="outline-none">No indicator</button>`,
			),
		).toBe(true);
		expect(
			hasFocusIndicatorSuppressedHeuristic(
				`<button class="outline-none focus-visible:ring-2">Has replacement</button>`,
			),
		).toBe(false);

		expect(
			hasFocusObscuredHeuristic(`
				<header class="sticky top-0">Bar</header>
				<a href="#section">Jump</a>
				<section id="section">Content</section>
			`),
		).toBe(true);
		expect(
			hasFocusObscuredHeuristic(`
				<header class="fixed top-0">Bar</header>
				<a href="#section">Jump</a>
				<section id="section" class="scroll-mt-24">Content</section>
			`),
		).toBe(false);
	});

	it("covers skip-link, hardcoded color, spacing scale, and primary-action overload branches", () => {
		expect(
			hasMissingSkipLinkHeuristic(`
				<nav>
					<a href="#a">A</a><a href="#b">B</a><a href="#c">C</a><a href="#d">D</a>
				</nav>
				<main id="content">Main</main>
			`),
		).toBe(true);

		expect(
			hasMissingSkipLinkHeuristic(`
				<nav><a href="#main-content">Skip</a></nav>
				<main id="main-content">Main</main>
			`),
		).toBe(false);

		expect(
			hasHardcodedColorLiteralHeuristic(
				`<div style="color:#333; background-color:#fff">literal</div>`,
			),
		).toBe(true);
		expect(
			hasHardcodedColorLiteralHeuristic(
				`<div style="color:var(--foreground); background:var(--bg)">token</div>`,
			),
		).toBe(false);

		expect(
			hasNonScaleSpacingHeuristic(
				`<div style="padding: 14px"></div><div class="gap-[22px]"></div>`,
			),
		).toBe(true);
		expect(
			hasNonScaleSpacingHeuristic(
				`<div style="padding: 16px"></div><div class="gap-4 p-6"></div>`,
			),
		).toBe(false);

		expect(
			hasPrimaryActionOverloadHeuristic(`
				<button class="btn-primary">Save</button>
				<button data-variant="primary">Publish</button>
			`),
		).toBe(true);
		expect(
			hasPrimaryActionOverloadHeuristic(
				`<button class="btn-primary">Save</button><button>Cancel</button>`,
			),
		).toBe(false);
	});

	it("covers control-label and button-name branches with edge inputs", () => {
		expect(hasAssociatedControlLabel("<input />", "<input />", -1)).toBe(false);
		expect(
			hasAssociatedControlLabel(
				`<input id="named" aria-label="Name" />`,
				`<input id="named" aria-label="Name" />`,
				0,
			),
		).toBe(true);
		expect(
			hasAssociatedControlLabel(
				`<input id="target" /><label for="other">Other</label>`,
				`<input id="target" />`,
				0,
			),
		).toBe(false);

		expect(
			hasButtonAccessibleNameHeuristic(
				`<button><span aria-hidden="true">x</span></button>`,
			),
		).toBe(true);
		expect(
			hasButtonAccessibleNameHeuristic(`<button>Readable Label</button>`),
		).toBe(false);
	});

	it("covers state and contrast branches using alternate cues", () => {
		expect(
			evaluateStateCoverageHeuristic(`
				<div role="status">Loading...</div>
				<div aria-live="assertive">Failed</div>
				<div class="empty-state">Nothing to show</div>
				<button aria-disabled="true">Disabled</button>
				<div>Done</div>
			`),
		).toEqual({
			missingLoading: false,
			missingError: false,
			missingEmpty: false,
			missingDisabled: false,
			missingSuccess: false,
		});

		expect(
			hasInsufficientStaticTextContrastHeuristic(
				`<p style="color:#222;background:#fff">Readable</p>`,
			),
		).toBe(false);
		expect(
			hasInsufficientStaticNonTextContrastHeuristic(
				`<button style="border:1px solid #111;background:#fff">Readable</button>`,
			),
		).toBe(false);
	});
});
