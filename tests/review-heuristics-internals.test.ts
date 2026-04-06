import { describe, expect, it } from "vitest";
import { __test__ } from "../services/mcp-server/src/uiux/review-heuristics.js";

describe("review heuristics internals", () => {
	it("parses pixel and color helpers across valid and invalid inputs", () => {
		expect(__test__.parsePixelValue("12px")).toBe(12);
		expect(__test__.parsePixelValue("12")).toBe(12);
		expect(__test__.parsePixelValue("auto")).toBeNull();

		expect(__test__.readInlineCssPixelValue("width: 24px;", "width")).toBe(24);
		expect(
			__test__.readInlineCssPixelValue("height: auto;", "height"),
		).toBeNull();

		expect(
			__test__.readInlineCssDeclaration("border: 1px solid #000;", "border"),
		).toBe("1px solid #000");
		expect(
			__test__.readInlineCssDeclaration("color: red;", "background"),
		).toBeNull();

		expect(__test__.parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
		expect(__test__.parseHexColor("nope")).toBeNull();
		expect(__test__.parseRgbFunctionColor("rgba(10, 20, 30, 0.5)")).toEqual({
			r: 10,
			g: 20,
			b: 30,
		});
		expect(__test__.parseRgbFunctionColor("rgba(300, 20, 30, 0.5)")).toBeNull();
		expect(__test__.parseRgbFunctionColor("rgba(10, 20, 30, 2)")).toBeNull();

		expect(__test__.parseStaticColor("black")).toEqual({ r: 0, g: 0, b: 0 });
		expect(__test__.parseStaticColor("white")).toEqual({
			r: 255,
			g: 255,
			b: 255,
		});
		expect(__test__.parseStaticColor("var(--token)")).toBeNull();
	});

	it("parses border and tailwind spacing helpers", () => {
		expect(
			__test__.readInlineCssBorderColor("border: 1px solid #111;"),
		).toEqual({
			r: 17,
			g: 17,
			b: 17,
		});
		expect(__test__.readInlineCssBorderColor("border: none;")).toBeNull();

		expect(__test__.readTailwindSizeTokenPx("w-[28px] min-h-6", "w")).toBe(28);
		expect(__test__.readTailwindSizeTokenPx("min-h-6", "min-h")).toBe(24);
		expect(__test__.readTailwindSizeTokenPx("foo", "w")).toBeNull();

		expect(__test__.parseTailwindSpacingTokenPx("px")).toBe(1);
		expect(__test__.parseTailwindSpacingTokenPx("2.5")).toBe(10);
		expect(__test__.parseTailwindSpacingTokenPx("auto")).toBeNull();

		expect(
			__test__.readTailwindSpacingClassValuePx("px-4 gap-[18px]", [
				"gap",
				"px",
			]),
		).toBe(18);
		expect(
			__test__.readTailwindSpacingClassValuePx("mx-auto", ["mx"]),
		).toBeNull();
	});

	it("detects style-list, sticky-anchor, spacing, and contrast edge cases", () => {
		expect(
			__test__.hasFocusObscuredHeuristic(`
				<header style="position: sticky; top: 0">Header</header>
				<a href="#section">Jump</a>
				<section id="section">Target</section>
			`),
		).toBe(true);
		expect(
			__test__.hasFocusObscuredHeuristic(`
				<header style="position: sticky; top: 0">Header</header>
				<p>No anchors here</p>
			`),
		).toBe(false);

		expect(
			__test__.listStyleValues(`
				<div style="color:#fff"></div>
				<style>.card { margin: 13px; }</style>
			`),
		).toEqual(["color:#fff", ".card { margin: 13px; }"]);

		expect(
			__test__.hasNonScaleSpacingHeuristic(
				`<div style="margin: 13px"></div><div class="gap-[14px]"></div>`,
			),
		).toBe(true);
		expect(
			__test__.hasNonScaleSpacingHeuristic(
				`<div style="margin: 16px"></div><div class="gap-4"></div>`,
			),
		).toBe(false);

		expect(
			__test__.hasInsufficientStaticTextContrastHeuristic(
				`<p style="color:#ffffff; background:#ffffff">Invisible</p>`,
			),
		).toBe(true);
		expect(
			__test__.hasInsufficientStaticTextContrastHeuristic(
				`<p style="color:rgba(0,0,0,0.5); background:#fff">Translucent</p>`,
			),
		).toBe(true);

		expect(
			__test__.hasInsufficientStaticNonTextContrastHeuristic(
				`<button style="border: 1px solid rgba(0,0,0,0.2); background:#fff">Ghost</button>`,
			),
		).toBe(true);
		expect(
			__test__.hasInsufficientStaticNonTextContrastHeuristic(
				`<button style="border: 1px solid #000; background:#fff">Strong</button>`,
			),
		).toBe(false);

		expect(
			__test__.stripHtmlTags(
				'Visible <span aria-hidden="true"><script>alert(1)</script> text</span>',
			),
		).toBe("Visible alert(1) text");
	});
});
