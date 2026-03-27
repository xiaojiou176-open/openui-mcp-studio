import { describe, expect, it } from "vitest";
import {
	clipDiffByFileBudget,
	filterDeterministicFalsePositives,
	isFrontendAuditCandidate,
	normalizeAuditResult,
	resolveUiuxAuditMaxRetries,
	resolveUiuxAuditTimeoutMs,
	shouldFailMissingGeminiKey,
	shouldFailStrictAudit,
	summarizeIssueCounts,
} from "../tooling/uiux-ai-audit.js";

describe("uiux ai audit strict gate", () => {
	it("fails strict mode for warning-only issues by default", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "heuristic warnings detected",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "warning",
						category: "usability",
						message: "warning only",
						fix: "improve affordance",
					},
				],
			}),
		).toBe(true);
	});

	it("allows strict mode warnings when explicitly configured", () => {
		expect(
			shouldFailStrictAudit(
				{
					status: "fail",
					summary: "heuristic warnings detected",
					issues: [
						{
							file: "src/demo.tsx",
							severity: "warning",
							category: "usability",
							message: "warning only",
							fix: "improve affordance",
						},
					],
				},
				{ failOnWarnings: false, maxWarnings: 99 },
			),
		).toBe(false);
	});

	it("does not fail strict mode for model-only advisory warnings without rule ids", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "advisory model warning",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "warning",
						category: "usability",
						message: "component feels visually heavy",
						fix: "consider simplifying spacing",
						source: "model",
						impact: "low",
						confidence: "high",
						evidenceSnippet: 'className="px-12"',
					},
				],
			}),
		).toBe(false);
	});

	it("treats high-impact model warnings as advisory", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "high-impact warning",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "warning",
						category: "code_quality",
						ruleId: "code_quality_state_integrity",
						message: "state integrity is at risk",
						fix: "stabilize transition",
						source: "model",
						impact: "high",
						confidence: "high",
						evidenceSnippet: "setState(...)",
					},
				],
			}),
		).toBe(false);
	});

	it("respects warning budget in strict mode", () => {
		expect(
			shouldFailStrictAudit(
				{
					status: "fail",
					summary: "warning budget exhausted",
					issues: [
						{
							file: "src/demo.tsx",
							severity: "warning",
							category: "usability",
							message: "warning one",
							fix: "improve affordance",
						},
						{
							file: "src/demo.tsx",
							severity: "warning",
							category: "responsive",
							message: "warning two",
							fix: "improve layout",
						},
					],
				},
				{ failOnWarnings: true, maxWarnings: 1 },
			),
		).toBe(true);
	});

	it("fails strict mode when blocking issue exists", () => {
		expect(
			shouldFailStrictAudit({
				status: "pass",
				summary: "has error issue",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "accessibility",
						message: "missing label",
						fix: "add aria-label",
					},
				],
			}),
		).toBe(true);
	});

	it("fails strict mode for design-system errors", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "blocking design system finding",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "design_system",
						message: "token drift",
						fix: "use design token",
					},
				],
			}),
		).toBe(true);
	});

	it("treats model-sourced code-quality-only errors as advisory", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "non-blocking code quality findings",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "code_quality",
						message: "heuristic fragility",
						fix: "refactor parser",
						source: "model",
						impact: "medium",
						confidence: "high",
						evidenceSnippet: "const nextCopy = DIALOG_COPY[context]",
					},
				],
			}),
		).toBe(false);
	});

	it("treats model code-quality rule-id findings as advisory when deterministic gates already cover them", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "blocking code quality findings",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "code_quality",
						ruleId: "code_quality_state_integrity",
						message: "state integrity can break under concurrent renders",
						fix: "stabilize state transition",
						source: "model",
						impact: "high",
						confidence: "high",
						evidenceSnippet: "setState(...)",
					},
				],
			}),
		).toBe(false);
	});

	it("treats model accessibility/design-system errors as advisory until corroborated by deterministic gates", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "model-only blocking findings",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "accessibility",
						message: "missing accessible name",
						fix: "label the button",
						source: "model",
						impact: "high",
						confidence: "high",
						evidenceSnippet: "button",
					},
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "design_system",
						message: "token drift",
						fix: "use design token",
						source: "model",
						impact: "medium",
						confidence: "high",
						evidenceSnippet: "rounded-3xl",
					},
				],
			}),
		).toBe(false);
	});

	it("still fails strict mode for non-model code-quality errors", () => {
		expect(
			shouldFailStrictAudit({
				status: "fail",
				summary: "blocking code quality findings",
				issues: [
					{
						file: "src/demo.tsx",
						severity: "error",
						category: "code_quality",
						message: "dangerouslySetInnerHTML allows xss",
						fix: "remove dangerouslySetInnerHTML and sanitize output",
						source: "heuristic",
						impact: "high",
						confidence: "high",
						evidenceSnippet: "dangerouslySetInnerHTML",
					},
				],
			}),
		).toBe(true);
	});

	it("passes strict mode only when status pass and there are no issues", () => {
		expect(
			shouldFailStrictAudit({
				status: "pass",
				summary: "all good",
				issues: [],
			}),
		).toBe(false);
	});

	it("fails strict mode when GEMINI key is missing and frontend files exist", () => {
		expect(
			shouldFailMissingGeminiKey({
				strict: true,
				frontendFileCount: 2,
			}),
		).toBe(true);
	});

	it("does not fail when GEMINI key is missing but no frontend files exist", () => {
		expect(
			shouldFailMissingGeminiKey({
				strict: true,
				frontendFileCount: 0,
			}),
		).toBe(false);
	});

	it("does not fail missing key check for non-strict mode", () => {
		expect(
			shouldFailMissingGeminiKey({
				strict: false,
				frontendFileCount: 3,
			}),
		).toBe(false);
	});

	it("raises strict audit timeout floor when timeout is unset", () => {
		expect(
			resolveUiuxAuditTimeoutMs({
				strict: true,
				currentTimeoutMs: undefined,
			}),
		).toBe("120000");
	});

	it("raises strict audit timeout floor when timeout is too low", () => {
		expect(
			resolveUiuxAuditTimeoutMs({
				strict: true,
				currentTimeoutMs: "45000",
			}),
		).toBe("120000");
	});

	it("preserves larger explicit timeout for strict audit", () => {
		expect(
			resolveUiuxAuditTimeoutMs({
				strict: true,
				currentTimeoutMs: "120000",
			}),
		).toBe("120000");
	});

	it("leaves timeout untouched for non-strict audit", () => {
		expect(
			resolveUiuxAuditTimeoutMs({
				strict: false,
				currentTimeoutMs: "45000",
			}),
		).toBe("45000");
	});

	it("raises strict audit retry floor when retries are unset", () => {
		expect(
			resolveUiuxAuditMaxRetries({
				strict: true,
				currentMaxRetries: undefined,
			}),
		).toBe("5");
	});

	it("raises strict audit retry floor when retries are too low", () => {
		expect(
			resolveUiuxAuditMaxRetries({
				strict: true,
				currentMaxRetries: "2",
			}),
		).toBe("5");
	});

	it("leaves retry count untouched for non-strict audit", () => {
		expect(
			resolveUiuxAuditMaxRetries({
				strict: false,
				currentMaxRetries: "2",
			}),
		).toBe("2");
	});

	it("filters non-frontend script files out of UI audit candidates", () => {
		expect(isFrontendAuditCandidate("tooling/uiux-ai-audit.ts")).toBe(false);
		expect(
			isFrontendAuditCandidate("tests/e2e/dashboard-workbench.spec.ts"),
		).toBe(false);
		expect(isFrontendAuditCandidate("apps/web/app/page.tsx")).toBe(true);
		expect(isFrontendAuditCandidate("apps/web/app/globals.css")).toBe(true);
		expect(isFrontendAuditCandidate("tests/e2e/helpers/server.ts")).toBe(false);
		expect(isFrontendAuditCandidate("components/ui/button.tsx")).toBe(true);
		expect(isFrontendAuditCandidate("styles/globals.css")).toBe(true);
	});

	it("clips diff context per file instead of dropping later files entirely", () => {
		const diff = [
			"diff --git a/components/button.tsx b/components/button.tsx",
			"+".repeat(480),
			"diff --git a/components/card.tsx b/components/card.tsx",
			"+".repeat(480),
			"diff --git a/components/dialog.tsx b/components/dialog.tsx",
			"+".repeat(480),
		].join("\n");

		const clipped = clipDiffByFileBudget(diff, 720);

		expect(clipped.text).toContain("components/button.tsx");
		expect(clipped.text).toContain("components/card.tsx");
		expect(clipped.text).toContain("components/dialog.tsx");
		expect(clipped.truncatedFiles).toContain("components/button.tsx");
		expect(clipped.truncatedFiles).toContain("components/card.tsx");
		expect(clipped.truncatedFiles).toContain("components/dialog.tsx");
	});

	it("normalizes incomplete audit issue metadata into stable defaults", () => {
		const normalized = normalizeAuditResult({
			status: "fail",
			summary: "warning only",
			issues: [
				{
					file: "apps/web/app/page.tsx",
					severity: "warning",
					category: "usability",
					message: "Scroll buttons need stronger semantics",
					fix: "Restore button semantics",
					confidence: "unknown" as "low",
					impact: "unknown" as "low",
					evidenceSnippet: "   ",
					source: "invalid" as "model",
				},
			],
		});

		expect(normalized.issues).toEqual([
			expect.objectContaining({
				confidence: "medium",
				impact: "medium",
				source: "model",
				evidenceSnippet: "apps/web/app/page.tsx",
			}),
		]);
	});

	it("summarizes issue counts by severity, category, source, and impact", () => {
		const summary = summarizeIssueCounts([
			{
				file: "apps/web/app/page.tsx",
				severity: "error",
				category: "accessibility",
				message: "Missing keyboard path",
				fix: "Make button focusable",
				confidence: "high",
				impact: "high",
				evidenceSnippet: "button tabindex=-1",
				source: "heuristic",
			},
			{
				file: "apps/web/app/page.tsx",
				severity: "warning",
				category: "usability",
				message: "Static timeout state",
				fix: "Use abortable promise",
				confidence: "medium",
				impact: "medium",
				evidenceSnippet: "setTimeout(900)",
				source: "model",
			},
		]);

		expect(summary).toEqual({
			errors: 1,
			warnings: 1,
			byCategory: "accessibility:1,usability:1",
			bySource: "heuristic:1,model:1",
			byImpact: "high:1,medium:1",
		});
	});

	it("filters syntax-truncation hallucinations when the referenced file parses cleanly", async () => {
		const filtered = await filterDeterministicFalsePositives([
			{
				file: "apps/web/components/ui/badge.tsx",
				severity: "error",
				category: "code_quality",
				ruleId: "code_quality_state_integrity",
				message:
					"The component file is truncated, resulting in a syntax error that will prevent the application from compiling.",
				fix: "Complete the function body for the Badge component and ensure the cn utility call and JSX return are properly closed.",
				confidence: "high",
				impact: "high",
				evidenceSnippet: "return <div className={cn(...",
				source: "model",
			},
			{
				file: "apps/web/components/ui/card.tsx",
				severity: "error",
				category: "code_quality",
				ruleId: "code_quality_state_integrity",
				message:
					"The file is truncated at the displayName assignment, which will cause a compilation error and runtime crash.",
				fix: "Complete the component definition by assigning the displayName and exporting the Card component properly.",
				confidence: "high",
				impact: "high",
				evidenceSnippet: "Card.displayName =",
				source: "model",
			},
		]);

		expect(filtered.filteredCount).toBe(2);
		expect(filtered.issues).toEqual([]);
	});

	it("filters contrast hallucinations when the reported HSL pair already meets WCAG", async () => {
		const filtered = await filterDeterministicFalsePositives([
			{
				file: "apps/web/app/globals.css",
				severity: "error",
				category: "accessibility",
				ruleId: "contrast_ratio_check",
				message:
					"Success foreground color (HSL 142, 72%, 27%) against white background (HSL 0, 0%, 100%) is only ~3.8:1, failing WCAG AA (4.5:1) for small text.",
				fix: "Adjust the color pair to ensure a 4.5:1 ratio.",
				confidence: "high",
				impact: "high",
				evidenceSnippet: "--success: 142 72% 27%;",
				source: "model",
			},
		]);

		expect(filtered.filteredCount).toBe(1);
		expect(filtered.issues).toEqual([]);
	});
});
