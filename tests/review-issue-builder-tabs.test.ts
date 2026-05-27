import { describe, expect, it } from "vitest";
import { buildIssues } from "../services/mcp-server/src/uiux/review-issue-builder.js";

describe("review issue builder tab semantics", () => {
	it("does not flag tab semantics when tablist wiring is complete", () => {
		const issues = buildIssues(`
			<main id="main-content">
				<a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>
				<h1>Workbench</h1>
				<div role="tablist">
					<button
						id="tab-overview"
						role="tab"
						type="button"
						aria-controls="panel-overview"
						aria-selected="true"
						class="focus-visible:ring-2"
					>
						Overview
					</button>
				</div>
				<section
					id="panel-overview"
					role="tabpanel"
					aria-labelledby="tab-overview"
				>
					Overview content
				</section>
			</main>
		`);

		const issueIds = issues.map((issue) => issue.id);
		expect(issueIds).not.toContain("tab-aria-controls-missing");
		expect(issueIds).not.toContain("tab-aria-selected-missing");
		expect(issueIds).not.toContain("tabpanel-aria-labelledby-missing");
	});

	it("flags only the tab semantics that are still missing when wiring is partial", () => {
		const issues = buildIssues(`
			<main id="main-content">
				<a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>
				<h1>Workbench</h1>
				<div role="tablist">
					<button
						id="tab-overview"
						role="tab"
						type="button"
						aria-controls="panel-overview"
						class="focus-visible:ring-2"
					>
						Overview
					</button>
				</div>
				<section id="panel-overview" role="tabpanel">Overview content</section>
			</main>
		`);

		const issueIds = issues.map((issue) => issue.id);
		expect(issueIds).not.toContain("tab-aria-controls-missing");
		expect(issueIds).toContain("tab-aria-selected-missing");
		expect(issueIds).toContain("tabpanel-aria-labelledby-missing");
	});
});
