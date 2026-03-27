import { test as base, expect } from "playwright/test";
import {
	createPageErrorGuard,
	type PageErrorGuard,
} from "./helpers/page-error-guard";
import { type AppServer, startAppServer } from "./helpers/server";

let pageErrorGuard: PageErrorGuard;

const test = base.extend<{
	server: AppServer;
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
});

test.beforeEach(async ({ page }) => {
	pageErrorGuard = createPageErrorGuard(page);
});

test.afterEach(async () => {
	await pageErrorGuard.assertNoPageErrors();
});

test("network offline failure then recovery succeeds on apps/web", async ({
	context,
	page,
	server,
}) => {
	await context.setOffline(true);

	await expect(
		page.goto(server.baseURL, {
			waitUntil: "domcontentloaded",
			timeout: 8_000,
		}),
	).rejects.toThrow(
		/ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|timed out|WebKit encountered an internal error/i,
	);

	await context.setOffline(false);

	const maxRecoveryNavAttempts = 2;
	const workbenchPage = page.getByTestId("workbench-page");
	let recovered = false;

	for (let attempt = 1; attempt <= maxRecoveryNavAttempts; attempt += 1) {
		try {
			if (attempt === 1) {
				const autoRecovered = await page
					.waitForURL(server.baseURL, {
						waitUntil: "domcontentloaded",
						timeout: 1_500,
					})
					.then(() => true)
					.catch(() => false);
				if (!autoRecovered) {
					await page.goto(server.baseURL, {
						waitUntil: "domcontentloaded",
					});
				}
			} else {
				await page.goto(server.baseURL, {
					waitUntil: "domcontentloaded",
				});
			}

			await expect(workbenchPage).toBeVisible({ timeout: 2_500 });
			recovered = true;
			break;
		} catch (error) {
			if (attempt === maxRecoveryNavAttempts) {
				throw error;
			}
		}
	}

	expect(recovered).toBe(true);
	await expect(page).toHaveURL(server.baseURL);
	await expect(page.getByTestId("workbench-shell")).toBeVisible();
	await expect(page.getByTestId("create-draft-trigger")).toBeVisible();
});
