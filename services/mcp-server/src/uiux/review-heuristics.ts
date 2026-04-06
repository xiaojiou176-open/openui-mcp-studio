import {
	evaluateDialogHeuristics,
	hasAssociatedControlLabel,
	hasButtonAccessibleNameHeuristic,
} from "./review-heuristics-dialog.js";

const TOUCH_TARGET_WCAG_MIN_SIZE_PX = 24;
const TOUCH_TARGET_RECOMMENDED_SIZE_PX = 44;
const WCAG_TEXT_CONTRAST_MIN_RATIO = 4.5;
const WCAG_NON_TEXT_CONTRAST_MIN_RATIO = 3;
const SPACING_SCALE_PX = new Set([0, 4, 6, 8, 12, 16, 24, 32, 48, 64]);

type RgbColor = { r: number; g: number; b: number };
type TouchPaddingCompensation = { horizontal: number; vertical: number };
type StateCoverageResult = {
	missingLoading: boolean;
	missingError: boolean;
	missingEmpty: boolean;
	missingDisabled: boolean;
	missingSuccess: boolean;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readAttribute(tag: string, name: string): string | null {
	const match = tag.match(
		new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i"),
	);
	return match?.[1] ?? null;
}

function parsePixelValue(value: string): number | null {
	const normalized = value.trim().toLowerCase();
	const match = normalized.match(/^(\d+(?:\.\d+)?)(px)?$/);
	if (!match?.[1]) {
		return null;
	}
	return Number.parseFloat(match[1]);
}

function readInlineCssPixelValue(
	style: string,
	propertyName: string,
): number | null {
	const match = style.match(
		new RegExp(
			`${escapeRegExp(propertyName)}\\s*:\\s*(\\d+(?:\\.\\d+)?)px\\b`,
			"i",
		),
	);
	if (!match?.[1]) {
		return null;
	}
	return Number.parseFloat(match[1]);
}

function readInlineCssDeclaration(
	style: string,
	propertyName: string,
): string | null {
	const match = style.match(
		new RegExp(`${escapeRegExp(propertyName)}\\s*:\\s*([^;]+)`, "i"),
	);
	const value = match?.[1]?.trim();
	return value ? value : null;
}

function parseHexColor(value: string): RgbColor | null {
	const normalized = value.trim().toLowerCase();
	if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
		return null;
	}
	if (normalized.length === 4) {
		const [r, g, b] = normalized.slice(1).split("");
		return {
			r: Number.parseInt(`${r}${r}`, 16),
			g: Number.parseInt(`${g}${g}`, 16),
			b: Number.parseInt(`${b}${b}`, 16),
		};
	}
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16),
	};
}

function parseRgbFunctionColor(value: string): RgbColor | null {
	const normalized = value.trim().toLowerCase();
	const rgbMatch = normalized.match(
		/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(\d*\.?\d+))?\s*\)$/,
	);
	if (!rgbMatch?.[1] || !rgbMatch[2] || !rgbMatch[3]) {
		return null;
	}
	const alpha = rgbMatch[4] ? Number.parseFloat(rgbMatch[4]) : 1;
	if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
		return null;
	}
	const r = Number.parseInt(rgbMatch[1], 10);
	const g = Number.parseInt(rgbMatch[2], 10);
	const b = Number.parseInt(rgbMatch[3], 10);
	if ([r, g, b].some((channel) => channel < 0 || channel > 255)) {
		return null;
	}
	return { r, g, b };
}

function parseStaticColor(value: string): RgbColor | null {
	const normalized = value.trim().toLowerCase();
	if (
		normalized.includes("var(") ||
		normalized.includes("hsl(") ||
		normalized.includes("hsla(") ||
		normalized.includes("transparent") ||
		normalized.includes("gradient(")
	) {
		return null;
	}
	if (normalized === "black") {
		return { r: 0, g: 0, b: 0 };
	}
	if (normalized === "white") {
		return { r: 255, g: 255, b: 255 };
	}
	return parseHexColor(normalized) ?? parseRgbFunctionColor(normalized);
}

function readInlineCssColorValue(
	style: string,
	propertyName: string,
): RgbColor | null {
	const value = readInlineCssDeclaration(style, propertyName);
	return value ? parseStaticColor(value) : null;
}

function readInlineCssBackgroundColor(style: string): RgbColor | null {
	const backgroundColor = readInlineCssColorValue(style, "background-color");
	if (backgroundColor) {
		return backgroundColor;
	}
	const shorthand = readInlineCssDeclaration(style, "background");
	if (!shorthand) {
		return null;
	}
	return parseStaticColor(shorthand);
}

function readInlineCssBorderColor(style: string): RgbColor | null {
	const borderColor = readInlineCssColorValue(style, "border-color");
	if (borderColor) {
		return borderColor;
	}
	const border = readInlineCssDeclaration(style, "border");
	if (!border || /\bnone\b/i.test(border)) {
		return null;
	}
	for (const token of border.split(/\s+/)) {
		const color = parseStaticColor(token);
		if (color) {
			return color;
		}
	}
	return null;
}

function relativeLuminanceChannel(channel: number): number {
	const normalized = channel / 255;
	return normalized <= 0.03928
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
}

function computeContrastRatio(
	foreground: RgbColor,
	background: RgbColor,
): number {
	const foregroundLuminance =
		0.2126 * relativeLuminanceChannel(foreground.r) +
		0.7152 * relativeLuminanceChannel(foreground.g) +
		0.0722 * relativeLuminanceChannel(foreground.b);
	const backgroundLuminance =
		0.2126 * relativeLuminanceChannel(background.r) +
		0.7152 * relativeLuminanceChannel(background.g) +
		0.0722 * relativeLuminanceChannel(background.b);
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);
	return (lighter + 0.05) / (darker + 0.05);
}

function readTailwindSizeTokenPx(
	classValue: string,
	prefix: "w" | "h" | "min-w" | "min-h",
): number | null {
	const arbitraryToken = classValue.match(
		new RegExp(`(?:^|\\s)${escapeRegExp(prefix)}-\\[(\\d+(?:\\.\\d+)?)px\\]`),
	);
	if (arbitraryToken?.[1]) {
		return Number.parseFloat(arbitraryToken[1]);
	}

	const scaleToken = classValue.match(
		new RegExp(`(?:^|\\s)${escapeRegExp(prefix)}-(\\d+(?:\\.\\d+)?)\\b`),
	);
	if (!scaleToken?.[1]) {
		return null;
	}
	return Number.parseFloat(scaleToken[1]) * 4;
}

function parseTailwindSpacingTokenPx(token: string): number | null {
	if (token === "px") {
		return 1;
	}
	if (/^\d+(?:\.\d+)?$/.test(token)) {
		return Number.parseFloat(token) * 4;
	}
	return null;
}

function readTailwindSpacingClassValuePx(
	classValue: string,
	prefixes: string[],
): number | null {
	for (const prefix of prefixes) {
		const arbitraryToken = classValue.match(
			new RegExp(
				`(?:^|\\s)-?${escapeRegExp(prefix)}-\\[(\\d+(?:\\.\\d+)?)px\\]`,
				"i",
			),
		);
		if (arbitraryToken?.[1]) {
			return Number.parseFloat(arbitraryToken[1]);
		}

		const scaleToken = classValue.match(
			new RegExp(`(?:^|\\s)-?${escapeRegExp(prefix)}-([\\w.]+)\\b`, "i"),
		);
		if (scaleToken?.[1]) {
			const numeric = parseTailwindSpacingTokenPx(scaleToken[1]);
			if (numeric !== null) {
				return numeric;
			}
		}
	}
	return null;
}

function readInlinePaddingPx(style: string, property: string): number {
	return readInlineCssPixelValue(style, property) ?? 0;
}

function readTouchPaddingCompensation(tag: string): TouchPaddingCompensation {
	const styleValue = readAttribute(tag, "style") ?? "";
	const classValue = readAttribute(tag, "class") ?? "";

	const inlinePadding = readInlinePaddingPx(styleValue, "padding");
	const inlinePaddingX = readInlinePaddingPx(styleValue, "padding-inline");
	const inlinePaddingY = readInlinePaddingPx(styleValue, "padding-block");
	const inlinePaddingLeft = readInlinePaddingPx(styleValue, "padding-left");
	const inlinePaddingRight = readInlinePaddingPx(styleValue, "padding-right");
	const inlinePaddingTop = readInlinePaddingPx(styleValue, "padding-top");
	const inlinePaddingBottom = readInlinePaddingPx(styleValue, "padding-bottom");

	const classPadding = readTailwindSpacingClassValuePx(classValue, ["p"]) ?? 0;
	const classPaddingX =
		readTailwindSpacingClassValuePx(classValue, ["px", "ps", "pe"]) ?? 0;
	const classPaddingY =
		readTailwindSpacingClassValuePx(classValue, ["py", "pt", "pb"]) ?? 0;

	const left = Math.max(
		inlinePadding,
		inlinePaddingX,
		inlinePaddingLeft,
		classPadding,
		classPaddingX,
	);
	const right = Math.max(
		inlinePadding,
		inlinePaddingX,
		inlinePaddingRight,
		classPadding,
		classPaddingX,
	);
	const top = Math.max(
		inlinePadding,
		inlinePaddingY,
		inlinePaddingTop,
		classPadding,
		classPaddingY,
	);
	const bottom = Math.max(
		inlinePadding,
		inlinePaddingY,
		inlinePaddingBottom,
		classPadding,
		classPaddingY,
	);

	return {
		horizontal: Math.max(0, left) + Math.max(0, right),
		vertical: Math.max(0, top) + Math.max(0, bottom),
	};
}

function evaluateTouchTargetHeuristic(html: string): {
	wcagFailure: boolean;
	recommendedGap: boolean;
} {
	const interactiveTags =
		html.match(
			/<(?:button|a|input|select|textarea)\b[^>]*(?:<\/(?:button|a)>)?/gi,
		) ?? [];

	let wcagFailure = false;
	let recommendedGap = false;

	for (const tag of interactiveTags) {
		const styleValue = readAttribute(tag, "style") ?? "";
		const classValue = readAttribute(tag, "class") ?? "";
		const width =
			readInlineCssPixelValue(styleValue, "width") ??
			parsePixelValue(readAttribute(tag, "width") ?? "") ??
			readTailwindSizeTokenPx(classValue, "w");
		const height =
			readInlineCssPixelValue(styleValue, "height") ??
			parsePixelValue(readAttribute(tag, "height") ?? "") ??
			readTailwindSizeTokenPx(classValue, "h");
		const minWidth =
			readInlineCssPixelValue(styleValue, "min-width") ??
			readTailwindSizeTokenPx(classValue, "min-w");
		const minHeight =
			readInlineCssPixelValue(styleValue, "min-height") ??
			readTailwindSizeTokenPx(classValue, "min-h");

		if (width === null || height === null) {
			continue;
		}
		const paddingCompensation = readTouchPaddingCompensation(tag);
		const effectiveWidth =
			Math.max(width, minWidth ?? 0) + paddingCompensation.horizontal;
		const effectiveHeight =
			Math.max(height, minHeight ?? 0) + paddingCompensation.vertical;

		if (
			effectiveWidth < TOUCH_TARGET_WCAG_MIN_SIZE_PX ||
			effectiveHeight < TOUCH_TARGET_WCAG_MIN_SIZE_PX
		) {
			wcagFailure = true;
			continue;
		}
		if (
			effectiveWidth < TOUCH_TARGET_RECOMMENDED_SIZE_PX ||
			effectiveHeight < TOUCH_TARGET_RECOMMENDED_SIZE_PX
		) {
			recommendedGap = true;
		}
	}

	return { wcagFailure, recommendedGap };
}

function hasFocusIndicatorSuppressedHeuristic(html: string): boolean {
	const interactiveTags =
		html.match(
			/<(?:button|a|input|select|textarea)\b[^>]*(?:<\/(?:button|a)>)?/gi,
		) ?? [];

	return interactiveTags.some((tag) => {
		const classValue = readAttribute(tag, "class") ?? "";
		const styleValue = readAttribute(tag, "style") ?? "";
		const suppressesOutline =
			/\boutline-none\b/i.test(classValue) ||
			/\boutline\s*:\s*none\b/i.test(styleValue);
		if (!suppressesOutline) {
			return false;
		}
		const hasFocusReplacement =
			/\bfocus-visible:(?:ring|outline-(?!none)|shadow|border|bg-|text-)/i.test(
				classValue,
			) ||
			/\bfocus:(?:ring|outline-(?!none)|shadow|border|bg-|text-)/i.test(
				classValue,
			) ||
			/\bbox-shadow\s*:/i.test(styleValue) ||
			/\boutline\s*:\s*(?!none\b)/i.test(styleValue) ||
			/\bborder(?:-color)?\s*:/i.test(styleValue);
		return !hasFocusReplacement;
	});
}

function hasMissingSkipLinkHeuristic(html: string): boolean {
	const mainMatch = html.match(/<main\b[^>]*>/i);
	if (!mainMatch || mainMatch.index === undefined) {
		return false;
	}

	const hasNav = /<nav[\s>]/i.test(html);
	const preMainMarkup = html.slice(0, mainMatch.index);
	const preMainInteractiveCount =
		preMainMarkup.match(/<(?:a|button|input|select|textarea)\b/gi)?.length ?? 0;
	const hasRepeatedNavigationSignal = hasNav || preMainInteractiveCount >= 4;
	if (!hasRepeatedNavigationSignal) {
		return false;
	}

	const mainTagMatch = mainMatch[0] ?? "";
	const mainId = readAttribute(mainTagMatch, "id");
	const allowedTargets = new Set(
		[mainId, "main", "main-content", "content", "primary-content"].filter(
			(value): value is string => Boolean(value),
		),
	);

	const skipLinkMatches = Array.from(
		html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']#([^"']+)["'][^>]*>/gi),
	);
	const hasValidSkipHref = skipLinkMatches.some((match) =>
		allowedTargets.has((match[1] ?? "").trim()),
	);
	return !hasValidSkipHref;
}

function hasFocusObscuredHeuristic(html: string): boolean {
	const hasStickyOrFixedTopBar =
		/<[^>]+\bclass\s*=\s*["'][^"']*\b(?:sticky|fixed)\b[^"']*\btop-0\b[^"']*["'][^>]*>/i.test(
			html,
		) ||
		/<[^>]+\bstyle\s*=\s*["'][^"']*position\s*:\s*(?:sticky|fixed)\s*;?[^"']*top\s*:\s*0(?:px)?\b[^"']*["'][^>]*>/i.test(
			html,
		);
	if (!hasStickyOrFixedTopBar) {
		return false;
	}

	const hasInPageAnchor = /<a\b[^>]*\bhref\s*=\s*["']#[^"']+["'][^>]*>/i.test(
		html,
	);
	if (!hasInPageAnchor) {
		return false;
	}

	const hasOffsetMitigation =
		/\bscroll-mt-\S+/i.test(html) ||
		/\bscroll-pt-\S+/i.test(html) ||
		/\bscroll-margin-top\s*:/i.test(html) ||
		/\bscroll-padding-top\s*:/i.test(html);

	return !hasOffsetMitigation;
}

function listStyleValues(html: string): string[] {
	const values: string[] = [];
	for (const match of html.matchAll(/\bstyle\s*=\s*["']([^"']+)["']/gi)) {
		const value = match[1]?.trim();
		if (value) {
			values.push(value);
		}
	}
	for (const styleBlock of html.matchAll(
		/<style\b[^>]*>([\s\S]*?)<\/style>/gi,
	)) {
		const value = styleBlock[1]?.trim();
		if (value) {
			values.push(value);
		}
	}
	return values;
}

function hasHardcodedColorLiteralHeuristic(html: string): boolean {
	const styleValues = listStyleValues(html);
	const colorLiteralPattern =
		/\b(?:color|background(?:-color)?|border(?:-color)?|outline(?:-color)?|fill|stroke)\s*:\s*(?!var\()(?:#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:black|white)\b)/i;
	return styleValues.some((style) => colorLiteralPattern.test(style));
}

function hasNonScaleSpacingHeuristic(html: string): boolean {
	const styleValues = listStyleValues(html);
	const pxPattern =
		/\b(?:margin|margin-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)|padding|padding-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)|gap|row-gap|column-gap)\s*:\s*([^;]+)/gi;

	for (const style of styleValues) {
		for (const declaration of style.matchAll(pxPattern)) {
			const value = declaration[1] ?? "";
			for (const pxToken of value.matchAll(/(-?\d+(?:\.\d+)?)px\b/gi)) {
				const numeric = Number.parseFloat(pxToken[1] ?? "");
				if (
					Number.isFinite(numeric) &&
					!SPACING_SCALE_PX.has(Math.abs(numeric))
				) {
					return true;
				}
			}
		}
	}

	for (const classMatch of html.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
		const classValue = classMatch[1] ?? "";
		for (const arbitrarySpacing of classValue.matchAll(
			/(?:^|\s)(?:m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|gap|gap-x|gap-y)-\[(\d+(?:\.\d+)?)px\]/gi,
		)) {
			const numeric = Number.parseFloat(arbitrarySpacing[1] ?? "");
			if (Number.isFinite(numeric) && !SPACING_SCALE_PX.has(numeric)) {
				return true;
			}
		}
		for (const scaleSpacing of classValue.matchAll(
			/(?:^|\s)-?(?:m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|gap|gap-x|gap-y)-([a-z0-9.]+)\b/gi,
		)) {
			const numeric = parseTailwindSpacingTokenPx(scaleSpacing[1] ?? "");
			if (numeric !== null && !SPACING_SCALE_PX.has(numeric)) {
				return true;
			}
		}
	}

	return false;
}

function hasTranslucentColorLiteral(style: string): boolean {
	return /\brgba\([^)]*,\s*(?:0?\.\d+|0)\s*\)/i.test(style);
}

function hasPrimaryActionMarker(tag: string): boolean {
	const classValue = readAttribute(tag, "class") ?? "";
	if (
		/\b(?:btn-primary|ant-btn-primary|primary-btn|button-primary|cta-primary)\b/i.test(
			classValue,
		)
	) {
		return true;
	}

	return (
		/\b(?:variant|intent|color|appearance|tone)\s*=\s*["']primary["']/i.test(
			tag,
		) || /\bdata-variant\s*=\s*["']primary["']/i.test(tag)
	);
}

function hasPrimaryActionOverloadHeuristic(html: string): boolean {
	const actionTags =
		html.match(/<(?:button|a|input)\b[^>]*(?:<\/(?:button|a)>)?/gi) ?? [];
	const primaryCount = actionTags.filter((tag) =>
		hasPrimaryActionMarker(tag),
	).length;
	return primaryCount > 1;
}

function extractElementInnerHtml(fullElement: string): string {
	const openingTagEnd = fullElement.indexOf(">");
	if (openingTagEnd === -1) {
		return "";
	}

	const closingTagStart = fullElement.lastIndexOf("</");
	if (closingTagStart === -1 || closingTagStart <= openingTagEnd) {
		return fullElement.slice(openingTagEnd + 1);
	}

	return fullElement.slice(openingTagEnd + 1, closingTagStart);
}

function stripHtmlTags(value: string): string {
	let result = "";
	let insideTag = false;

	for (const char of value) {
		if (char === "<") {
			insideTag = true;
			continue;
		}
		if (char === ">") {
			insideTag = false;
			continue;
		}
		if (!insideTag) {
			result += char;
		}
	}

	return result;
}

function hasInsufficientStaticTextContrastHeuristic(html: string): boolean {
	const textElementPattern =
		/<(?:p|span|a|button|label|h[1-6]|li|td|th|small|strong|em)\b[^>]*\bstyle\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/(?:p|span|a|button|label|h[1-6]|li|td|th|small|strong|em)>/gi;
	for (const match of html.matchAll(textElementPattern)) {
		const fullElement = match[0];
		const openingTag = fullElement.match(/^<[^>]+>/)?.[0] ?? "";
		const textContent = stripHtmlTags(extractElementInnerHtml(fullElement)).trim();
		if (!textContent) {
			continue;
		}
		const style = readAttribute(openingTag, "style");
		if (!style) {
			continue;
		}
		if (hasTranslucentColorLiteral(style)) {
			return true;
		}
		const foreground = readInlineCssColorValue(style, "color");
		const background = readInlineCssBackgroundColor(style);
		if (!foreground || !background) {
			continue;
		}
		if (
			computeContrastRatio(foreground, background) <
			WCAG_TEXT_CONTRAST_MIN_RATIO
		) {
			return true;
		}
	}
	return false;
}

function hasInsufficientStaticNonTextContrastHeuristic(html: string): boolean {
	const interactiveTags =
		html.match(/<(?:button|a|input|select|textarea)\b[^>]*>/gi) ?? [];
	for (const tag of interactiveTags) {
		const style = readAttribute(tag, "style");
		if (!style) {
			continue;
		}
		if (hasTranslucentColorLiteral(style)) {
			return true;
		}
		const border = readInlineCssBorderColor(style);
		const background = readInlineCssBackgroundColor(style);
		if (!border || !background) {
			continue;
		}
		if (
			computeContrastRatio(border, background) <
			WCAG_NON_TEXT_CONTRAST_MIN_RATIO
		) {
			return true;
		}
	}
	return false;
}

function evaluateStateCoverageHeuristic(html: string): StateCoverageResult {
	const hasLoadingSignal =
		/\b(?:aria-busy\s*=\s*["']true["']|role\s*=\s*["'](?:status|progressbar)["'])/i.test(
			html,
		) ||
		/\b(?:loading|skeleton|spinner|busy|please wait|\u6b63\u5728\u52a0\u8f7d)\b/i.test(
			html,
		);
	const hasErrorSignal =
		/\b(?:role\s*=\s*["']alert["']|aria-live\s*=\s*["']assertive["'])/i.test(
			html,
		) ||
		/\b(?:error|failed|something went wrong|\u51fa\u9519|\u5931\u8d25)\b/i.test(
			html,
		);
	const hasEmptySignal =
		/\b(?:data-state\s*=\s*["']empty["']|empty-state)\b/i.test(html) ||
		/\b(?:no data|no results|nothing to show|empty state|\u6682\u65e0\u6570\u636e|\u65e0\u7ed3\u679c)\b/i.test(
			html,
		);
	const hasDisabledSignal =
		/\b(?:disabled|aria-disabled\s*=\s*["']true["'])\b/i.test(html) ||
		/\bdisabled:/i.test(html);
	const hasSuccessSignal =
		/\b(?:data-state\s*=\s*["']success["']|success|saved|completed|done|\u6210\u529f)\b/i.test(
			html,
		);

	return {
		missingLoading: !hasLoadingSignal,
		missingError: !hasErrorSignal,
		missingEmpty: !hasEmptySignal,
		missingDisabled: !hasDisabledSignal,
		missingSuccess: !hasSuccessSignal,
	};
}

export {
	evaluateDialogHeuristics,
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
	evaluateStateCoverageHeuristic,
};

export const __test__ = {
	parsePixelValue,
	readInlineCssPixelValue,
	readInlineCssDeclaration,
	parseHexColor,
	parseRgbFunctionColor,
	parseStaticColor,
	readInlineCssBorderColor,
	readTailwindSizeTokenPx,
	parseTailwindSpacingTokenPx,
	readTailwindSpacingClassValuePx,
	hasFocusObscuredHeuristic,
	listStyleValues,
	stripHtmlTags,
	hasNonScaleSpacingHeuristic,
	hasInsufficientStaticTextContrastHeuristic,
	hasInsufficientStaticNonTextContrastHeuristic,
};
