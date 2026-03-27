import { test as base, expect, type Page } from "playwright/test";
import { activateControl, disableMotion, waitForWorkbenchReady } from "./helpers/interaction";
import {
	createPageErrorGuard,
	type PageErrorGuard,
} from "./helpers/page-error-guard";
import { type AppServer, startAppServer } from "./helpers/server";

const test = base.extend<{
	server: AppServer;
	pageErrorGuard: PageErrorGuard;
}>({
	server: [
		async ({ browserName }, use) => {
			void browserName;
			const server = await startAppServer();
			await use(server);
			await server.stop();
		},
		{ scope: "worker", timeout: 300_000 },
	],
	pageErrorGuard: async ({ page }, use) => {
		const pageErrorGuard = createPageErrorGuard(page);
		await use(pageErrorGuard);
		await pageErrorGuard.assertNoPageErrors();
	},
});

async function gotoWorkbench(input: {
	baseURL: string;
	page: Page;
}): Promise<void> {
	await input.page.goto(input.baseURL, { waitUntil: "load" });
	await disableMotion(input.page);
	await expect(input.page.getByTestId("workbench-page")).toBeVisible();
	await waitForWorkbenchReady(input.page);
}

test("active lane CTA buttons open the draft dialog", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	for (const lane of [
		{ tab: "pipeline", cta: "cta-pipeline", panel: "panel-pipeline" },
		{ tab: "review", cta: "cta-review", panel: "panel-review" },
		{ tab: "release", cta: "cta-release", panel: "panel-release" },
	] as const) {
		await activateControl(page.getByTestId(`tab-${lane.tab}`));
		await expect(page.getByTestId(`tab-${lane.tab}`)).toHaveAttribute(
			"data-state",
			"active",
		);
		await expect(page.getByTestId(lane.panel)).toBeVisible();
		await activateControl(page.getByTestId(lane.cta));
		await expect(page.getByTestId("create-draft-dialog")).toBeVisible();
		await page.getByRole("button", { name: "Cancel" }).click();
		await expect(page.getByTestId("create-draft-dialog")).toHaveCount(0);
	}
});

test("empty-state reset restores the full pipeline lane", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await page.getByTestId("search-input").fill("taxonomy");
	await activateControl(page.getByTestId("status-card-active"));
	await expect(page.locator("#status-active")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(page.getByTestId("empty-state")).toBeVisible();

	await page
		.getByRole("button", { name: /reset filters from empty state/i })
		.press("Enter");
	await expect(page.getByTestId("search-input")).toHaveValue("");
	await expect(page.locator("#status-all")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-brief-129"),
	).toBeVisible();
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-flow-301"),
	).toBeVisible();
});

test("draft surface cards are fully clickable and submit queues the dialog form", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await activateControl(page.getByTestId("create-draft-trigger"));
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();

	await activateControl(page.getByTestId("draft-option-checkout"));
	await expect(page.locator("#draft-checkout")).toHaveAttribute(
		"data-state",
		"checked",
	);

	await page
		.getByTestId("draft-prompt-input")
		.fill("Ship a high-trust checkout review flow.");
	await activateControl(page.getByTestId("create-draft-submit"));

	await expect(page.getByTestId("create-draft-dialog")).toHaveCount(0);
	await expect(page.getByTestId("success-state")).toContainText(
		"Draft queued: Checkout.",
	);
});

test("ops panel controls publish visible feedback for promote and signal refresh actions", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await activateControl(page.getByTestId("primary-cta"));
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();
	await expect(page.getByTestId("draft-prompt-input")).toHaveValue(
		/Promote AI Landing Revamp into a launch-ready brief/i,
	);
	await page.getByRole("button", { name: "Cancel" }).click();

	await activateControl(page.getByTestId("refresh-signals"));
	await expect(page.getByTestId("success-state")).toContainText(
		"Quality signals refreshed for the pipeline lane.",
	);
	await activateControl(page.getByTestId("dismiss-success"));
	await expect(page.getByTestId("success-state")).toHaveCount(0);
});

test("work item action buttons open the contextual draft dialog instead of acting like no-op controls", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await activateControl(page.getByTestId("work-item-action-brief-129"));
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();
	await expect(page.getByTestId("draft-prompt-input")).toHaveValue(
		/Continue briefing: AI Landing Revamp/i,
	);
	await activateControl(page.getByRole("button", { name: "Cancel" }));

	await activateControl(page.getByTestId("tab-release"));
	await activateControl(page.getByTestId("work-item-action-ship-903"));
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();
	await expect(page.getByTestId("draft-prompt-input")).toHaveValue(
		/Run release gates: Release Candidate 4/i,
	);
});

test("mobile tab scroll controls reveal hidden lanes without breaking focusable tabs", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await page.setViewportSize({ width: 240, height: 844 });
	await gotoWorkbench({ baseURL: server.baseURL, page });
	await page.addStyleTag({
		content: `
			[data-testid="workbench-tab-scroll-region"] {
				max-width: 88px !important;
			}
		`,
	});
	await page.evaluate(() => {
		window.dispatchEvent(new Event("resize"));
	});

	const scrollRight = page.getByRole("button", { name: "Scroll tabs right" });
	const scrollRegion = page.getByTestId("workbench-tab-scroll-region");
	const pipelineTab = page.getByTestId("tab-pipeline");
	const releaseTab = page.getByTestId("tab-release");
	await expect(scrollRight).toBeVisible();
	await expect(scrollRight).not.toHaveAttribute("tabindex", "-1");
	const initialScrollLeft = await scrollRegion.evaluate((node) =>
		Math.round(node.scrollLeft),
	);
	await pipelineTab.focus();
	await expect(pipelineTab).toBeFocused();
	await pipelineTab.press("End");
	await expect(releaseTab).toHaveAttribute("data-state", "active");
	await expect
		.poll(async () => {
			const scrollLeft = await scrollRegion.evaluate((node) =>
				Math.round(node.scrollLeft),
			);
			return scrollLeft;
		})
		.toBeGreaterThan(initialScrollLeft);

	await activateControl(scrollRight);
	const scrollLeft = page.getByRole("button", { name: "Scroll tabs left" });
	await expect(scrollLeft).toBeVisible();
	await expect(scrollLeft).not.toHaveAttribute("tabindex", "-1");

	await activateControl(page.getByTestId("tab-release"));
	await expect(page.getByTestId("tab-release")).toHaveAttribute(
		"data-state",
		"active",
	);
	await expect(page.getByTestId("panel-release")).toBeVisible();
});

test("tabs expose lane counts to improve navigation information scent", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await expect(page.getByTestId("tab-count-pipeline")).toHaveText("2");
	await expect(page.getByTestId("tab-count-review")).toHaveText("2");
	await expect(page.getByTestId("tab-count-release")).toHaveText("2");
});
