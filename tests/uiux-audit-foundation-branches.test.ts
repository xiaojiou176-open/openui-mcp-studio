import { describe, expect, it } from "vitest";
import {
	buildUiuxAuditFrame,
	resolveUiuxStylePack,
} from "../services/mcp-server/src/uiux/audit-foundation.js";

describe("uiux audit foundation branch coverage", () => {
	it("covers headline, recommendation, priority, and next-step fallbacks", () => {
		const frame = buildUiuxAuditFrame({
			scope: "workspace",
			target: "apps/web",
			auditableFileCount: 2,
			issues: [
				{
					category: "design_system",
					severity: "low",
					priority: "p4",
					title: "Deferred token cleanup",
					recommendation: "Follow up later.",
				},
				{
					category: "design_system",
					severity: "low",
					priority: "p3",
					message: "Message fallback headline",
					fix: "Use semantic tokens.",
				},
				{
					category: "design_system",
					severity: "high",
					id: "design-system-severe",
				},
				{
					category: "design_system",
					severity: "medium",
				},
			],
		});

		const designSystemCategory = frame.categories.find(
			(category) => category.id === "design_system",
		);

		expect(frame.summary).toContain("across 2 audited file(s)");
		expect(frame.automatedSignals).toEqual({
			verdict: "fail",
			issueCount: 4,
			blockingIssueCount: 1,
			failingCategoryCount: 1,
			watchedCategoryCount: 0,
			hotspotCount: 0,
			sourceKinds: [],
		});
		expect(designSystemCategory).toEqual(
			expect.objectContaining({
				status: "fail",
				blockingIssueCount: 1,
				highlights: [
					"design-system-severe",
					"needs follow-up",
					"Message fallback headline",
				],
			}),
		);
		expect(frame.nextSteps[0]).toEqual(
			expect.objectContaining({
				category: "design_system",
				title: "Design system needs follow-up",
				detail:
					"Review the affected surface and align it with the current UI/UX contract.",
			}),
		);
		expect(frame.nextOperatorMove).toEqual(frame.nextSteps[0]);
		expect(frame.manualReview).toEqual({
			required: true,
			reason:
				"Automated signals found blocking rubric gaps. A human should confirm intent, recovery language, and operator-safe sequencing before treating this surface as ready.",
			focusAreas: ["design_system"],
		});
	});

	it("throws for unknown style packs after trimming the requested id", () => {
		expect(() => resolveUiuxStylePack("  unknown-pack  ")).toThrow(
			/Unknown UIUX style pack: unknown-pack/,
		);
	});
});
