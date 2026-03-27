type DialogContext = {
	openingTag: string;
	context: string;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectDialogContexts(html: string): DialogContext[] {
	const dialogs: DialogContext[] = [];
	const dialogTagPattern =
		/<dialog\b[^>]*>|<[a-z][\w:-]*\b[^>]*\brole\s*=\s*["'](?:dialog|alertdialog)["'][^>]*>/gi;

	for (const match of html.matchAll(dialogTagPattern)) {
		const openingTag = match[0];
		const startIndex = match.index ?? -1;
		if (startIndex < 0) {
			continue;
		}

		const tagName = openingTag
			.match(/^<\s*([a-z][\w:-]*)/i)?.[1]
			?.toLowerCase();
		const closeTag = tagName ? `</${tagName}>` : "";
		const searchFrom = startIndex + openingTag.length;
		const closeIndex = closeTag
			? html.toLowerCase().indexOf(closeTag.toLowerCase(), searchFrom)
			: -1;
		const segmentEnd =
			closeIndex >= 0
				? closeIndex + closeTag.length
				: Math.min(html.length, searchFrom + 1200);

		dialogs.push({
			openingTag,
			context: html.slice(startIndex, segmentEnd),
		});
	}

	return dialogs;
}

function countFocusableCandidates(markup: string): number {
	const focusablePattern =
		/<button\b|<input\b|<select\b|<textarea\b|<summary\b|<a\b[^>]*\bhref\s*=|<[^>]+\btabindex\s*=\s*["']?0["']?/gi;
	return markup.match(focusablePattern)?.length ?? 0;
}

function hasEscapeCloseSignal(markup: string): boolean {
	return (
		/\bonEscapeKeyDown\s*=/i.test(markup) ||
		/\bonKeyDown\s*=\s*["'][^"']*\bEscape\b/i.test(markup) ||
		/@keydown\.esc(?:ape)?\b/i.test(markup) ||
		/\bx-on:keydown\.escape\b/i.test(markup) ||
		/\baria-keyshortcuts\s*=\s*["'][^"']*\bEscape\b/i.test(markup) ||
		/\b(?:closeOnEscape|closeOnEsc)\s*=\s*["']?(?:true|1)["']?/i.test(markup) ||
		/\bdata-(?:esc|escape|close-on-esc|close-on-escape)\b/i.test(markup)
	);
}

function hasInitialFocusClue(dialog: DialogContext): boolean {
	const openingTag = dialog.openingTag;
	const context = dialog.context;
	return (
		/\bautofocus\b/i.test(context) ||
		/\bonOpenAutoFocus\s*=/i.test(openingTag) ||
		/\binitialFocus\s*=/i.test(openingTag) ||
		/\bdata-(?:initial-focus|autofocus-target)\b/i.test(context) ||
		/\btabindex\s*=\s*["']?-1["']?/i.test(openingTag) ||
		countFocusableCandidates(context) > 0
	);
}

function hasFocusTrapSignal(dialog: DialogContext, html: string): boolean {
	const openingTag = dialog.openingTag;
	const context = dialog.context;
	return (
		/\baria-modal\s*=\s*["']true["']/i.test(openingTag) ||
		/\b(?:focus-trap|focus-lock|react-focus-lock|data-radix-focus-guard)\b/i.test(
			context,
		) ||
		/\b(?:onFocusOutside|onInteractOutside|onPointerDownOutside)\s*=/i.test(
			openingTag,
		) ||
		/\binert\b/i.test(html)
	);
}

function evaluateDialogHeuristics(html: string): {
	missingEscClosePath: boolean;
	missingInitialFocusClue: boolean;
	focusTrapRisk: boolean;
} {
	const dialogs = collectDialogContexts(html);
	if (dialogs.length === 0) {
		return {
			missingEscClosePath: false,
			missingInitialFocusClue: false,
			focusTrapRisk: false,
		};
	}

	const globalEscapeSignal = hasEscapeCloseSignal(html);
	const totalFocusable = countFocusableCandidates(html);
	let missingEscClosePath = false;
	let missingInitialFocusClue = false;
	let focusTrapRisk = false;

	for (const dialog of dialogs) {
		const isNativeDialog = /^<dialog\b/i.test(dialog.openingTag);
		const hasEsc =
			isNativeDialog ||
			globalEscapeSignal ||
			hasEscapeCloseSignal(dialog.context);
		if (!hasEsc) {
			missingEscClosePath = true;
		}

		if (!hasInitialFocusClue(dialog)) {
			missingInitialFocusClue = true;
		}

		const focusableInsideDialog = countFocusableCandidates(dialog.context);
		const hasFocusableOutsideDialog =
			totalFocusable - focusableInsideDialog > 0;
		if (
			focusableInsideDialog > 0 &&
			hasFocusableOutsideDialog &&
			!hasFocusTrapSignal(dialog, html)
		) {
			focusTrapRisk = true;
		}
	}

	return { missingEscClosePath, missingInitialFocusClue, focusTrapRisk };
}

function hasWrappingLabel(html: string, controlIndex: number): boolean {
	if (controlIndex < 0) {
		return false;
	}
	const labelStart = html.lastIndexOf("<label", controlIndex);
	if (labelStart < 0) {
		return false;
	}
	const labelEnd = html.indexOf("</label>", labelStart);
	return labelEnd >= 0 && controlIndex < labelEnd;
}

function hasAssociatedControlLabel(
	html: string,
	controlTag: string,
	controlIndex: number,
): boolean {
	const controlName =
		controlTag.match(/^<\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? "input";
	if (
		controlName === "input" &&
		/\btype\s*=\s*["']hidden["']/i.test(controlTag)
	) {
		return true;
	}
	if (/\baria-label\s*=|\baria-labelledby\s*=/i.test(controlTag)) {
		return true;
	}
	if (hasWrappingLabel(html, controlIndex)) {
		return true;
	}
	const idMatch = controlTag.match(/\bid\s*=\s*["']([^"']+)["']/i);
	if (idMatch?.[1]) {
		const labelForPattern = new RegExp(
			`<label\\b[^>]*\\bfor\\s*=\\s*["']${escapeRegExp(idMatch[1])}["'][^>]*>`,
			"i",
		);
		if (labelForPattern.test(html)) {
			return true;
		}
	}
	return false;
}

function hasButtonAccessibleNameHeuristic(html: string): boolean {
	for (const buttonMatch of html.matchAll(
		/<button\b[^>]*>[\s\S]*?<\/button>/gi,
	)) {
		const buttonMarkup = buttonMatch[0] ?? "";
		if (
			/\b(?:aria-label|aria-labelledby)\s*=\s*["'][^"']+["']/i.test(
				buttonMarkup,
			)
		) {
			continue;
		}
		const contentMarkup = buttonMarkup
			.replace(/^<button\b[^>]*>/i, "")
			.replace(/<\/button>\s*$/i, "");
		const semanticText = contentMarkup
			.replace(
				/<[^>]+\baria-hidden\s*=\s*["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
				" ",
			)
			.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;|&#160;/gi, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!semanticText) {
			return true;
		}
	}
	return false;
}

export {
	evaluateDialogHeuristics,
	hasAssociatedControlLabel,
	hasButtonAccessibleNameHeuristic,
};
