import { test as base, expect } from "playwright/test";
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

test.beforeEach(async ({ page, server, pageErrorGuard }) => {
	void pageErrorGuard;
	await page.goto(server.baseURL, { waitUntil: "load" });
	await disableMotion(page);
	await expect(page.getByTestId("workbench-page")).toBeVisible();
	await waitForWorkbenchReady(page);
});

test("tabs support arrow/home/end keyboard navigation with explicit selected-state assertions", async ({
	page,
}) => {
	const pipelineTab = page.getByTestId("tab-pipeline");
	const reviewTab = page.getByTestId("tab-review");
	const releaseTab = page.getByTestId("tab-release");

	await expect(pipelineTab).toHaveAttribute("data-state", "active");
	await pipelineTab.focus();
	await page.keyboard.press("ArrowRight");
	await expect(reviewTab).toHaveAttribute("data-state", "active");
	await expect(page.getByTestId("panel-review")).toBeVisible();

	await reviewTab.focus();
	await page.keyboard.press("End");
	await expect(releaseTab).toHaveAttribute("data-state", "active");
	await expect(page.getByTestId("panel-release")).toBeVisible();

	await releaseTab.focus();
	await page.keyboard.press("Home");
	await expect(pipelineTab).toHaveAttribute("data-state", "active");
	await expect(page.getByTestId("panel-pipeline")).toBeVisible();
});

test("draft dialog supports keyboard open + escape close and trigger focus restore", async ({
	page,
}) => {
	const trigger = page.getByTestId("create-draft-trigger");

	await trigger.focus();
	await expect(trigger).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(page.getByTestId("create-draft-dialog")).toHaveCount(0);
	await expect(trigger).toBeFocused();

	await activateControl(trigger);
	await expect(page.getByTestId("create-draft-dialog")).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByTestId("create-draft-dialog")).toHaveCount(0);
	await expect(trigger).toBeFocused();
});

test("error and reset actions keep control panel operable with explicit recovery assertions", async ({
	page,
}) => {
	await activateControl(page.getByTestId("simulate-error"));
	await expect(page.getByTestId("error-state")).toBeVisible();

	await activateControl(
		page.getByRole("button", { name: /reset workspace state/i }),
	);
	await expect(page.getByTestId("error-state")).toHaveCount(0);
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-brief-129"),
	).toBeVisible();
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-flow-301"),
	).toBeVisible();
});
