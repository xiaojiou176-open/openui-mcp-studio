import { test as base, expect, type Locator, type Page } from "playwright/test";
import { disableMotion, waitForWorkbenchReady } from "./helpers/interaction";
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

async function clickControl(locator: Locator): Promise<void> {
	await expect(locator).toBeVisible();
	await locator.focus();
	const role = await locator.getAttribute("role");
	await locator.press(role === "radio" ? "Space" : "Enter");
}

test("apps/web renders default workbench shell and primary controls", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await expect(page.getByTestId("workbench-shell")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /generate, review and ship/i }),
	).toBeVisible();
	await expect(page.getByTestId("workspace-signal")).toContainText(
		"3 active lanes",
	);

	await expect(page.getByTestId("create-draft-trigger")).toBeVisible();
	await expect(page.getByTestId("refresh-workbench")).toBeVisible();
	await expect(page.getByTestId("simulate-error")).toBeVisible();
	await expect(page.getByTestId("reset-filters")).toBeVisible();
	await expect(page.getByTestId("search-input")).toBeVisible();
	await expect(page.getByTestId("status-filter-group")).toBeVisible();

	await expect(page.getByTestId("tab-pipeline")).toHaveAttribute(
		"data-state",
		"active",
	);
	await expect(page.getByTestId("tab-review")).toHaveAttribute(
		"data-state",
		"inactive",
	);
	await expect(page.getByTestId("tab-release")).toHaveAttribute(
		"data-state",
		"inactive",
	);
	await expect(page.getByTestId("panel-pipeline")).toBeVisible();

	await expect(page.getByTestId("summary-active")).toContainText("1");
	await expect(page.getByTestId("summary-blocked")).toContainText("1");
	await expect(page.getByTestId("summary-complete")).toContainText("0");
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-brief-129"),
	).toBeVisible();
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-flow-301"),
	).toBeVisible();
});

test("command bar search + status filters + tab switch have explicit visible-item assertions", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	const workItemList = page.getByTestId("work-item-list");
	await expect(workItemList.getByTestId("work-item-brief-129")).toBeVisible();
	await expect(workItemList.getByTestId("work-item-flow-301")).toBeVisible();

	await page.getByTestId("search-input").fill("taxonomy");
	await expect(workItemList.getByTestId("work-item-flow-301")).toBeVisible();
	await expect(workItemList.getByTestId("work-item-brief-129")).toHaveCount(0);

	await clickControl(page.getByTestId("status-card-blocked"));
	await expect(page.getByTestId("status-card-blocked")).toHaveAttribute(
		"data-state",
		"checked",
	);
	await expect(workItemList.getByTestId("work-item-flow-301")).toBeVisible();

	await clickControl(page.getByTestId("status-card-active"));
	await expect(page.getByTestId("status-card-active")).toHaveAttribute(
		"data-state",
		"checked",
	);
	await expect(page.getByTestId("empty-state")).toBeVisible();
	await expect(page.getByTestId("empty-state")).toContainText(
		"No work items match this view.",
	);

	await clickControl(page.getByTestId("reset-filters"));
	await expect(page.getByTestId("search-input")).toHaveValue("");
	await expect(page.getByTestId("status-card-all")).toHaveAttribute(
		"data-state",
		"checked",
	);
	await expect(workItemList.getByTestId("work-item-brief-129")).toBeVisible();
	await expect(workItemList.getByTestId("work-item-flow-301")).toBeVisible();

	await page.getByTestId("tab-pipeline").focus();
	await page.keyboard.press("ArrowRight");
	await expect(page.getByTestId("tab-review")).toHaveAttribute(
		"data-state",
		"active",
	);
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-qa-412"),
	).toBeVisible();
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-copy-120"),
	).toBeVisible();

	await page.getByTestId("tab-review").focus();
	await page.keyboard.press("End");
	await expect(page.getByTestId("tab-release")).toHaveAttribute(
		"data-state",
		"active",
	);
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-ship-903"),
	).toBeVisible();
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-ops-204"),
	).toBeVisible();
});

test("refresh/error/dialog button interactions are explicitly asserted", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await gotoWorkbench({ baseURL: server.baseURL, page });

	await clickControl(page.getByTestId("refresh-workbench"));
	await expect(page.getByTestId("loading-state")).toBeVisible();
	await expect(page.getByTestId("success-state")).toContainText(
		"Workspace sync completed",
	);
	await clickControl(page.getByTestId("dismiss-success"));

	await clickControl(page.getByTestId("simulate-error"));
	await expect(page.getByTestId("error-state")).toBeVisible();
	await expect(page.getByTestId("retry-refresh")).toBeVisible();

	await clickControl(page.getByTestId("retry-refresh"));
	await expect(page.getByTestId("loading-state")).toBeVisible();
	await expect(page.getByTestId("success-state")).toBeVisible();
	await clickControl(page.getByTestId("dismiss-success"));

	await clickControl(page.getByTestId("create-draft-trigger"));
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /create a launch-ready ui brief/i }),
	).toBeVisible();
	await page
		.getByTestId("draft-prompt-input")
		.fill("Build a launch overview page with explicit states.");
	await clickControl(page.getByTestId("draft-option-landing"));
	await clickControl(page.getByTestId("create-draft-submit"));

	await expect(page.getByTestId("create-draft-dialog")).toHaveCount(0);
	await expect(page.getByTestId("success-state")).toContainText(
		"Draft queued: Landing page.",
	);
});
