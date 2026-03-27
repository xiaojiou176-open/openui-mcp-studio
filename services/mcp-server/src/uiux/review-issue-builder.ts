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
} from "./review-heuristics.js";
import type { UiuxIssue } from "./review-schema.js";

type IssueDraft = Pick<
	UiuxIssue,
	"id" | "severity" | "title" | "detail" | "recommendation"
> &
	Partial<
		Pick<
			UiuxIssue,
			"confidence" | "priority" | "principle" | "taskFlowImpact" | "evidence"
		>
	> & { penalty: number };

function buildIssues(html: string): IssueDraft[] {
	const issues: IssueDraft[] = [];
	const h1Count = html.match(/<h1[\s>]/gi)?.length ?? 0;

	if (!/<main[\s>]/i.test(html)) {
		issues.push({
			id: "missing-main-landmark",
			severity: "medium",
			title: "Missing <main> landmark",
			detail: "The document does not define a <main> region.",
			recommendation:
				"Wrap the primary page content in a semantic <main> element.",
			penalty: 12,
		});
	}

	if (h1Count === 0) {
		issues.push({
			id: "missing-h1",
			severity: "medium",
			title: "Missing level-1 heading",
			detail: "No <h1> heading was detected.",
			recommendation:
				"Add exactly one descriptive <h1> to establish hierarchy.",
			penalty: 10,
		});
	}
	if (h1Count > 1) {
		issues.push({
			id: "multiple-h1",
			severity: "medium",
			title: "Multiple <h1> headings detected",
			detail: "More than one <h1> can weaken heading hierarchy.",
			recommendation:
				"Keep a single page-level <h1> and demote other sections to <h2>/<h3>.",
			penalty: 8,
		});
	}

	if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(html)) {
		issues.push({
			id: "image-alt-missing",
			severity: "high",
			title: "Image without alt text",
			detail: "At least one <img> element is missing an alt attribute.",
			recommendation:
				'Add meaningful alt text, or set alt="" for decorative images.',
			penalty: 20,
		});
	}

	if (/<a\b(?![^>]*\bhref=)[^>]*>/i.test(html)) {
		issues.push({
			id: "link-href-missing",
			severity: "high",
			title: "Anchor without href",
			detail: "At least one <a> element is missing an href attribute.",
			recommendation:
				'Provide a valid href, or use <button type="button"> for actions.',
			penalty: 18,
		});
	}

	if (/<button\b(?![^>]*\btype=)[^>]*>/i.test(html)) {
		issues.push({
			id: "button-type-missing",
			severity: "medium",
			title: "Button without explicit type",
			detail:
				"Button defaults to submit in forms and can trigger accidental submits.",
			recommendation:
				'Set button type explicitly (usually type="button" for UI actions).',
			penalty: 10,
		});
	}

	if (hasButtonAccessibleNameHeuristic(html)) {
		issues.push({
			id: "button-accessible-name-missing",
			severity: "high",
			title: "Button without accessible name",
			detail: "At least one button appears empty and has no accessible label.",
			recommendation:
				"Add visible text or aria-label/aria-labelledby for icon-only buttons.",
			penalty: 20,
		});
	}

	const formControlMatches = Array.from(
		html.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi),
	);
	const unlabeledControl = formControlMatches.some((controlMatch) => {
		const controlTag = controlMatch[0] ?? "";
		const controlIndex =
			typeof controlMatch.index === "number" ? controlMatch.index : -1;
		return (
			controlTag.length > 0 &&
			!hasAssociatedControlLabel(html, controlTag, controlIndex)
		);
	});
	if (unlabeledControl) {
		issues.push({
			id: "form-label-missing",
			severity: "high",
			title: "Form controls are not labeled",
			detail: "Form controls were found without corresponding label semantics.",
			recommendation:
				"Use <label for=...>, wrapping <label>, or aria-label/aria-labelledby for each form control.",
			penalty: 18,
		});
	}

	if (/\btabindex\s*=\s*["']?[1-9]\d*["']?/i.test(html)) {
		issues.push({
			id: "positive-tabindex",
			severity: "medium",
			title: "Positive tabindex detected",
			detail:
				"Positive tabindex values can break predictable keyboard navigation order.",
			recommendation:
				"Use natural DOM order and only use tabindex={0} when needed.",
			penalty: 12,
		});
	}

	const hasTablist = /<[^>]+\brole\s*=\s*["']tablist["'][^>]*>/i.test(html);
	if (hasTablist) {
		if (!/<[^>]+\brole\s*=\s*["']tab["'][^>]*\baria-controls=/i.test(html)) {
			issues.push({
				id: "tab-aria-controls-missing",
				severity: "high",
				title: "Tab missing aria-controls",
				detail: "Tabs should reference their tabpanel with aria-controls.",
				recommendation:
					'Add aria-controls to each role="tab" and point to a matching tabpanel id.',
				penalty: 16,
			});
		}
		if (!/<[^>]+\brole\s*=\s*["']tab["'][^>]*\baria-selected=/i.test(html)) {
			issues.push({
				id: "tab-aria-selected-missing",
				severity: "high",
				title: "Tab missing aria-selected",
				detail: "Tabs should expose selected state for assistive technologies.",
				recommendation:
					'Set aria-selected on role="tab" and keep it in sync with active state.',
				penalty: 16,
			});
		}
		if (
			!/<[^>]+\brole\s*=\s*["']tabpanel["'][^>]*\baria-labelledby=/i.test(html)
		) {
			issues.push({
				id: "tabpanel-aria-labelledby-missing",
				severity: "medium",
				title: "Tabpanel missing aria-labelledby",
				detail: "Tabpanel should reference its owning tab via aria-labelledby.",
				recommendation:
					'Set aria-labelledby on role="tabpanel" to the active tab id.',
				penalty: 10,
			});
		}
	}

	const hasInteractive = /<(?:button|a|input|select|textarea)\b/i.test(html);
	if (hasInteractive && !/\bfocus-visible:|\bfocus:/i.test(html)) {
		issues.push({
			id: "focus-visible-style-missing",
			severity: "medium",
			title: "No explicit focus style detected",
			detail:
				"Interactive controls appear without visible focus treatment in provided markup.",
			recommendation:
				"Add clear focus-visible styles (for example Tailwind focus-visible:ring-*).",
			penalty: 12,
		});
	}

	const touchTargetHeuristic = evaluateTouchTargetHeuristic(html);
	if (touchTargetHeuristic.wcagFailure) {
		issues.push({
			id: "touch-target-size-insufficient",
			severity: "high",
			title: "Touch target below WCAG 2.2 minimum",
			detail:
				"At least one interactive element appears smaller than 24x24 CSS px without explicit padding compensation.",
			recommendation:
				"Increase hit area to at least 24x24 CSS px (preferably 44x44 for comfort), or add explicit padding/min-size.",
			penalty: 18,
		});
	} else if (touchTargetHeuristic.recommendedGap) {
		issues.push({
			id: "touch-target-comfort-gap",
			severity: "low",
			title: "Touch target below platform comfort guidance",
			detail:
				"At least one interactive element meets 24x24 minimum but is below the commonly recommended 44x44 comfort target.",
			recommendation:
				"Increase hit area to around 44x44 CSS px for better touch ergonomics on mobile and tablet.",
			penalty: 6,
		});
	}

	if (hasFocusObscuredHeuristic(html)) {
		issues.push({
			id: "focus-not-obscured-risk",
			severity: "medium",
			title: "Focus may be obscured by sticky/fixed top bar",
			detail:
				"Sticky/fixed top navigation with in-page anchors was detected without clear scroll offset mitigation.",
			recommendation:
				"Add scroll offset mitigation (for example scroll-margin-top / scroll-padding-top) so focused targets are not hidden behind top chrome.",
			penalty: 10,
		});
	}
	if (hasMissingSkipLinkHeuristic(html)) {
		issues.push({
			id: "bypass-blocks-skip-link-missing",
			severity: "medium",
			title: "Missing skip link for repeated navigation",
			detail:
				"Navigation landmarks are present without a clear skip-to-content mechanism for keyboard users.",
			recommendation:
				'Add a visible-on-focus skip link (for example <a href="#main-content">Skip to main content</a>) and ensure the main region has a matching id.',
			penalty: 10,
		});
	}
	if (hasFocusIndicatorSuppressedHeuristic(html)) {
		issues.push({
			id: "focus-indicator-suppressed",
			severity: "high",
			title: "Focus indicator is suppressed",
			detail:
				"Interactive element uses outline suppression (outline-none/outline: none) without a clear replacement focus style.",
			recommendation:
				"Keep default outline or add explicit focus-visible treatment (for example focus-visible:ring-2 focus-visible:ring-offset-2).",
			penalty: 18,
		});
	}
	if (hasInsufficientStaticTextContrastHeuristic(html)) {
		issues.push({
			id: "text-contrast-insufficient-static",
			severity: "high",
			title: "Insufficient text contrast (static inference)",
			detail:
				"At least one text element has statically inferable foreground/background colors below WCAG 2.2 SC 1.4.3 minimum contrast.",
			recommendation:
				"Increase text/background contrast to at least 4.5:1 for normal text (or 3:1 for large text), and keep color pairs tokenized for consistency.",
			penalty: 18,
		});
	}
	if (hasInsufficientStaticNonTextContrastHeuristic(html)) {
		issues.push({
			id: "non-text-contrast-insufficient-static",
			severity: "medium",
			title: "Insufficient UI contrast (static inference)",
			detail:
				"At least one control has statically inferable border/background contrast below WCAG 2.2 SC 1.4.11 guidance.",
			recommendation:
				"Increase component edge contrast to at least 3:1 against adjacent background, especially for controls and focusable boundaries.",
			penalty: 12,
		});
	}
	if (hasPrimaryActionOverloadHeuristic(html)) {
		issues.push({
			id: "primary-action-overload",
			severity: "medium",
			title: "Multiple primary actions detected",
			detail:
				"The markup appears to define more than one primary call-to-action in the same view, which can weaken action hierarchy.",
			recommendation:
				"Keep one dominant primary action per decision area and demote the rest to secondary/tertiary variants.",
			penalty: 10,
		});
	}
	if (hasHardcodedColorLiteralHeuristic(html)) {
		issues.push({
			id: "token-color-hardcoded",
			severity: "medium",
			title: "Hardcoded color literal detected",
			detail:
				"Inline or embedded styles include hardcoded color literals, which undermines design token consistency across themes.",
			recommendation:
				"Replace color literals with semantic design tokens (for example var(--color-primary), var(--color-fg), var(--color-border)).",
			penalty: 10,
		});
	}
	if (hasNonScaleSpacingHeuristic(html)) {
		issues.push({
			id: "spacing-scale-inconsistent",
			severity: "low",
			title: "Non-scale spacing value detected",
			detail:
				"Spacing declarations include px values that do not align with the defined spacing scale.",
			recommendation:
				"Use spacing tokens or approved scale values (0/4/6/8/12/16/24/32/48/64) to keep rhythm consistent.",
			penalty: 6,
		});
	}

	const stateCoverage = evaluateStateCoverageHeuristic(html);
	if (stateCoverage.missingLoading) {
		issues.push({
			id: "state-loading-missing",
			severity: "medium",
			title: "Missing loading state coverage",
			detail:
				"No clear loading-state signal was detected for asynchronous or data-driven content.",
			recommendation:
				"Add loading feedback such as skeletons/spinners with aria-busy or status semantics.",
			penalty: 8,
		});
	}
	if (stateCoverage.missingError) {
		issues.push({
			id: "state-error-missing",
			severity: "medium",
			title: "Missing error state coverage",
			detail:
				"No explicit error-state messaging pattern was detected for failure scenarios.",
			recommendation:
				"Add recoverable error feedback with clear message and retry/recovery actions.",
			penalty: 8,
		});
	}
	if (stateCoverage.missingEmpty) {
		issues.push({
			id: "state-empty-missing",
			severity: "low",
			title: "Missing empty state coverage",
			detail:
				"No explicit empty-state treatment was detected for zero-data outcomes.",
			recommendation:
				"Add empty-state content with guidance for next actions (create/import/clear filters).",
			penalty: 6,
		});
	}
	if (stateCoverage.missingDisabled) {
		issues.push({
			id: "state-disabled-missing",
			severity: "low",
			title: "Missing disabled state coverage",
			detail:
				"No disabled-state signal was detected for unavailable actions or controls.",
			recommendation:
				"Represent unavailable actions with disabled/aria-disabled semantics and explanatory cues.",
			penalty: 6,
		});
	}
	if (stateCoverage.missingSuccess) {
		issues.push({
			id: "state-success-missing",
			severity: "low",
			title: "Missing success state coverage",
			detail:
				"No explicit success confirmation pattern was detected after task completion.",
			recommendation:
				"Add success acknowledgment such as toast/banner/inline confirmation after key actions.",
			penalty: 6,
		});
	}

	const dialogHeuristic = evaluateDialogHeuristics(html);
	if (dialogHeuristic.missingEscClosePath) {
		issues.push({
			id: "dialog-esc-close-missing",
			severity: "high",
			title: "Dialog may be missing Escape close path",
			detail:
				"Dialog markup was detected without clear Escape-key close handling clues.",
			recommendation:
				"Ensure modal dialog supports Escape to close (for example onEscapeKeyDown / keydown Escape handler) unless UX/safety requirements explicitly forbid it.",
			penalty: 14,
		});
	}
	if (dialogHeuristic.missingInitialFocusClue) {
		issues.push({
			id: "dialog-initial-focus-clue-missing",
			severity: "medium",
			title: "Dialog is missing initial focus clue",
			detail:
				"Dialog markup does not expose a clear initial focus landing strategy or focusable container clue.",
			recommendation:
				"Provide explicit initial focus cues (for example autofocus target, onOpenAutoFocus, or a focusable dialog container/tabindex=-1).",
			penalty: 10,
		});
	}
	if (dialogHeuristic.focusTrapRisk) {
		issues.push({
			id: "dialog-focus-trap-risk",
			severity: "medium",
			title: "Dialog focus trap may be missing",
			detail:
				"Focusable elements were detected both inside and outside dialog markup without clear focus-trap indicators.",
			recommendation:
				"Use an accessible dialog primitive/focus-lock and include trap indicators (for example aria-modal=true with proper focus guards).",
			penalty: 10,
		});
	}

	return issues;
}

export { buildIssues };
