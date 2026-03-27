import { test as base, expect } from "playwright/test";
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
		{ timeout: 180_000 },
	],
	pageErrorGuard: async ({ page }, use) => {
		const pageErrorGuard = createPageErrorGuard(page);
		await use(pageErrorGuard);
		await pageErrorGuard.assertNoPageErrors();
	},
});

test.beforeEach(async ({ page, server, pageErrorGuard }) => {
	void pageErrorGuard;
	await page.goto(server.baseURL, { waitUntil: "domcontentloaded" });
	await disableMotion(page);
	await expect(page.getByTestId("workbench-page")).toBeVisible();
	await waitForWorkbenchReady(page);
});

test("primary control buttons expose stable role/name contracts", async ({
	page,
}) => {
	const controls: Array<{ testId: string; name: string }> = [
		{ testId: "create-draft-trigger", name: "Create a new UI draft" },
		{ testId: "refresh-workbench", name: "Refresh workspace data" },
		{ testId: "simulate-error", name: "Preview recovery state" },
		{ testId: "reset-filters", name: "Reset search and filters" },
	];

	for (const control of controls) {
		const locator = page.getByTestId(control.testId);
		await expect(locator).toBeVisible();
		await expect(locator).toHaveAttribute("aria-label", control.name);
		const byRole = page.getByRole("button", { name: control.name });
		await expect(byRole).toHaveCount(1);
	}
});

test("keyboard activation path for refresh/error/reset stays functional", async ({
	page,
}) => {
	const searchInput = page.getByTestId("search-input");
	await searchInput.fill("taxonomy");
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-flow-301"),
	).toBeVisible();

	const refreshButton = page.getByTestId("refresh-workbench");
	await refreshButton.focus();
	await expect(refreshButton).toBeFocused();
	await refreshButton.press("Enter");
	await expect(page.getByTestId("loading-state")).toBeVisible();
	await expect(refreshButton).toBeDisabled();
	await expect(refreshButton).toContainText("Refreshing");
	await expect(page.getByTestId("success-state")).toContainText(
		"Workspace sync completed",
	);

	const simulateError = page.getByTestId("simulate-error");
	await simulateError.focus();
	await expect(simulateError).toBeFocused();
	await simulateError.press("Space");
	await expect(page.getByTestId("error-state")).toBeVisible();

	const resetButton = page.getByRole("button", {
		name: /reset workspace state/i,
	});
	await resetButton.focus();
	await expect(resetButton).toBeFocused();
	await resetButton.press("Enter");
	await expect(page.getByTestId("error-state")).toHaveCount(0);
	await expect(searchInput).toHaveValue("");
	await expect(page.locator("#status-all")).toBeChecked();
});

test("status filter radios keep single-select semantics", async ({ page }) => {
	await expect(page.locator("#status-all")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(page.locator("#status-active")).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await expect(page.locator("#status-blocked")).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await expect(page.locator("#status-done")).toHaveAttribute(
		"aria-checked",
		"false",
	);

	await page.getByTestId("status-card-blocked").click();
	await expect(page.locator("#status-blocked")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(page.locator("#status-all")).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await expect(page.locator("#status-active")).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await expect(page.locator("#status-done")).toHaveAttribute(
		"aria-checked",
		"false",
	);

	await page.getByTestId("status-card-done").click();
	await expect(page.locator("#status-done")).toHaveAttribute(
		"aria-checked",
		"true",
	);
	await expect(page.locator("#status-all")).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await expect(page.locator("#status-active")).toHaveAttribute(
		"aria-checked",
		"false",
	);
	await expect(page.locator("#status-blocked")).toHaveAttribute(
		"aria-checked",
		"false",
	);
});

test("search field provides a dedicated clear affordance without resetting filters", async ({
	page,
}) => {
	const searchInput = page.getByTestId("search-input");
	await searchInput.fill("taxonomy");
	await expect(searchInput).toHaveValue("taxonomy");
	await expect(page.getByTestId("search-clear")).toBeVisible();

	await page.getByTestId("search-clear").click();
	await expect(searchInput).toHaveValue("");
	await expect(page.getByTestId("search-clear")).toBeDisabled();
	await expect(page.getByTestId("search-clear")).toHaveClass(/opacity-0/);
	await expect(page.getByTestId("search-clear")).toHaveClass(
		/pointer-events-none/,
	);
	await expect(page.locator("#status-all")).toHaveAttribute(
		"aria-checked",
		"true",
	);
});

test("summary cards remain overview signals when status filter is active", async ({
	page,
}) => {
	await expect(page.getByTestId("summary-active")).toContainText("1");
	await expect(page.getByTestId("summary-blocked")).toContainText("1");
	await expect(page.getByTestId("summary-complete")).toContainText("0");

	await page.getByTestId("status-card-blocked").click();
	await expect(page.getByTestId("summary-active")).toContainText("1");
	await expect(page.getByTestId("summary-blocked")).toContainText("1");
	await expect(page.getByTestId("summary-complete")).toContainText("0");
});
