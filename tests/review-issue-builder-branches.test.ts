import { describe, expect, it } from "vitest";
import { buildIssues } from "../services/mcp-server/src/uiux/review-issue-builder.js";

describe("review issue builder branch coverage", () => {
	it("keeps labeled controls and complete tab semantics on the happy path", () => {
		const issues = buildIssues(`
			<main>
				<h1>Profile</h1>
				<label for="email">Email</label>
				<input id="email" type="email" />
				<div role="tablist">
					<button
						id="tab-overview"
						role="tab"
						aria-controls="panel-overview"
						aria-selected="true"
						class="focus-visible:ring-2"
					>
						Overview
					</button>
				</div>
				<div
					id="panel-overview"
					role="tabpanel"
					aria-labelledby="tab-overview"
				>
					Panel content
				</div>
			</main>
		`);

		const issueIds = issues.map((issue) => issue.id);
		expect(issueIds).not.toContain("form-label-missing");
		expect(issueIds).not.toContain("tab-aria-controls-missing");
		expect(issueIds).not.toContain("tab-aria-selected-missing");
		expect(issueIds).not.toContain("tabpanel-aria-labelledby-missing");
		expect(issueIds).not.toContain("focus-visible-style-missing");
	});
});
