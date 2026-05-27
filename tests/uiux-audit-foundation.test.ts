import { describe, expect, it } from "vitest";
import {
	buildUiuxAuditFrame,
	buildUiuxStylePromptContext,
	categorizeAuditIssue,
	listUiuxStylePacks,
	resolveUiuxStylePack,
} from "../services/mcp-server/src/uiux/audit-foundation.js";

describe("uiux audit foundation", () => {
	it("lists supported style packs, resolves defaults, and rejects unknown ids", () => {
		const packs = listUiuxStylePacks();
		expect(packs.map((pack) => pack.id)).toEqual([
			"openui-studio",
			"openui-operator-desk",
		]);

		expect(resolveUiuxStylePack().id).toBe("openui-studio");
		expect(resolveUiuxStylePack("openui-operator-desk").emphasis).toBe(
			"operator_dense",
		);

		const promptContext = buildUiuxStylePromptContext(
			resolveUiuxStylePack("openui-operator-desk"),
		);
		expect(promptContext).toContain("Style pack: openui-operator-desk");
		expect(promptContext).toContain("Theme modes: light, dark");
		expect(promptContext).toContain("Rubric:");
		expect(promptContext).toContain("1) Hierarchy:");

		expect(() => resolveUiuxStylePack("unknown-pack")).toThrow(
			/Unknown UIUX style pack: unknown-pack/,
		);
	});

	it("maps issue metadata into the intended audit categories", () => {
		expect(
			categorizeAuditIssue({
				severity: "warning",
				category: "design_system",
				message: "token drift",
			}),
		).toBe("design_system");
		expect(
			categorizeAuditIssue({
				id: "primary-action-overload",
				severity: "warning",
				detail: "too many primary actions",
			}),
		).toBe("hierarchy");
		expect(
			categorizeAuditIssue({
				severity: "warning",
				message: "keyboard path is broken",
			}),
		).toBe("accessibility");
		expect(
			categorizeAuditIssue({
				severity: "warning",
				category: "responsive",
				message: "layout shifts at tablet widths",
			}),
		).toBe("consistency");
		expect(
			categorizeAuditIssue({
				severity: "low",
				message: "operators need clearer next-step wording",
			}),
		).toBe("interaction_clarity");
	});

	it("builds a passing page audit frame without workspace-only suffixes", () => {
		const frame = buildUiuxAuditFrame({
			scope: "page",
			target: "/proof",
			issues: [],
		});

		expect(frame.summary).toContain(
			"page audit for /proof matches the current",
		);
		expect(frame.summary).not.toContain("audited file(s)");
		expect(frame.stylePack.id).toBe("openui-studio");
		expect(frame.stylePack.contract).toEqual(
			expect.objectContaining({
				tokenMode: "semantic-css-variables",
				hierarchyRule: expect.any(String),
				primaryActionRule: expect.any(String),
			}),
		);
		expect(
			frame.categories.every((category) => category.status === "pass"),
		).toBe(true);
		expect(frame.automatedSignals).toEqual({
			verdict: "pass",
			issueCount: 0,
			blockingIssueCount: 0,
			failingCategoryCount: 0,
			watchedCategoryCount: 0,
			hotspotCount: 0,
			sourceKinds: [],
		});
		expect(frame.manualReview).toEqual({
			required: false,
			reason:
				"Automated signals are currently clear. Keep manual review in the normal release path rather than as a special blocker.",
			focusAreas: [],
		});
		expect(frame.nextOperatorMove).toBeNull();
		expect(frame.nextSteps).toEqual([]);
		expect(frame.fileHotspots).toEqual([]);
	});

	it("builds an operator workspace frame with fail/watch ordering, fallback copy, and normalized hotspots", () => {
		const frame = buildUiuxAuditFrame({
			scope: "workspace",
			target: "apps/web",
			stylePackId: "openui-operator-desk",
			auditableFileCount: 9,
			fileHotspots: [
				{
					file: "apps/web/app/page.tsx",
					issueCount: 3,
					categories: ["design_system", "design_system", "hierarchy"],
				},
				{
					file: "apps/web/app/proof/page.tsx",
					issueCount: 2,
					categories: ["interaction_clarity"],
				},
				{
					file: "apps/web/app/workbench/page.tsx",
					issueCount: 2,
					categories: ["consistency"],
				},
				{
					file: "apps/web/components/frontdoor-shell.tsx",
					issueCount: 1,
					categories: ["hierarchy"],
				},
				{
					file: "apps/web/app/compare/page.tsx",
					issueCount: 1,
					categories: ["accessibility"],
				},
				{
					file: "apps/web/app/walkthrough/page.tsx",
					issueCount: 1,
					categories: ["design_system"],
				},
			],
			issues: [
				{
					severity: "error",
					category: "design_system",
					title: "Token drift",
					detail: "Hardcoded color bypasses semantic surface tokens.",
					recommendation: "Restore semantic token usage.",
					source: "model",
				},
				{
					severity: "warning",
					message: "Queue layout collapses awkwardly on tablet",
					detail: "Responsive collapse hides the proof rhythm.",
					fix: "Keep the evidence lane visible at tablet widths.",
					source: "heuristic",
				},
				{
					severity: "warning",
					category: "usability",
					message: "Current next step is not visually obvious",
					detail: "Dense operator chrome buries the action path.",
					source: "model",
				},
				{
					id: "primary-action-overload",
					severity: "warning",
					detail: "Two primary CTAs compete in the same desk state.",
					source: "heuristic",
				},
			],
		});

		expect(frame.summary).toContain(
			"workspace audit for apps/web across 9 audited file(s) is failing 1 OpenUI Operator Desk rubric area(s) and watching 3 more.",
		);
		expect(frame.categories.map((category) => category.id)).toEqual([
			"interaction_clarity",
			"consistency",
			"hierarchy",
			"design_system",
			"accessibility",
		]);
		expect(
			frame.categories.find((category) => category.id === "design_system")
				?.status,
		).toBe("fail");
		expect(
			frame.categories.find((category) => category.id === "consistency")
				?.highlights[0],
		).toBe("Queue layout collapses awkwardly on tablet");
		expect(
			frame.categories.find((category) => category.id === "hierarchy")
				?.highlights[0],
		).toBe("primary-action-overload");
		expect(frame.automatedSignals).toEqual({
			verdict: "fail",
			issueCount: 4,
			blockingIssueCount: 1,
			failingCategoryCount: 1,
			watchedCategoryCount: 3,
			hotspotCount: 5,
			sourceKinds: ["heuristic", "model"],
		});
		expect(frame.manualReview).toEqual({
			required: true,
			reason:
				"Automated signals found blocking rubric gaps. A human should confirm intent, recovery language, and operator-safe sequencing before treating this surface as ready.",
			focusAreas: ["design_system", "interaction_clarity", "consistency"],
		});
		expect(frame.nextOperatorMove).toEqual(
			expect.objectContaining({
				priority: "now",
				category: "design_system",
				title: "Token drift",
			}),
		);
		expect(frame.nextSteps).toEqual([
			expect.objectContaining({
				priority: "now",
				category: "design_system",
				title: "Token drift",
				detail: "Restore semantic token usage.",
			}),
			expect.objectContaining({
				priority: "next",
				category: "interaction_clarity",
				title: "Interaction clarity needs follow-up",
				detail:
					"Review the affected surface and align it with the current UI/UX contract.",
			}),
			expect.objectContaining({
				priority: "later",
				category: "consistency",
				title: "Consistency needs follow-up",
				detail: "Keep the evidence lane visible at tablet widths.",
			}),
		]);
		expect(frame.fileHotspots).toHaveLength(5);
		expect(frame.fileHotspots[0]).toEqual({
			file: "apps/web/app/page.tsx",
			issueCount: 3,
			categories: ["design_system", "hierarchy"],
		});
	});

	it("orders category highlights by explicit priority before severity fallbacks", () => {
		const frame = buildUiuxAuditFrame({
			scope: "snippet",
			target: "priority-sample",
			issues: [
				{
					severity: "low",
					category: "usability",
					title: "Later cleanup",
					detail: "Minor polish item.",
					priority: "p4",
				},
				{
					severity: "medium",
					category: "usability",
					title: "Medium warning",
					detail: "This warning should outrank p4 follow-up.",
				},
				{
					severity: "high",
					category: "usability",
					title: "Blocking issue",
					detail: "This should float to the top via severity fallback.",
				},
			],
		});

		expect(
			frame.categories.find((category) => category.id === "interaction_clarity")
				?.highlights,
		).toEqual(["Blocking issue", "Medium warning", "Later cleanup"]);
	});
});
