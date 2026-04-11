import { test as base, expect } from "playwright/test";
import { disableMotion } from "./helpers/interaction";
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

test("frontdoor homepage explains the product, proof path, and next actions", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await page.goto(server.baseURL, { waitUntil: "load" });
	await disableMotion(page);

	await expect(
		page.getByRole("heading", {
			name: /ship react ui into your workspace, with proof and review/i,
		}),
	).toBeVisible();
	await expect(page.getByText(/OneClickUI\.ai front door/i)).toBeVisible();
	await expect(
		page.getByRole("banner").getByText(/Powered by OpenUI MCP Studio/i),
	).toBeVisible();

	await expect(page.getByTestId("hero-cta-proof")).toBeVisible();
	await expect(page.getByTestId("hero-cta-walkthrough")).toBeVisible();
	await expect(page.getByTestId("hero-cta-workbench")).toBeVisible();

	await expect(
		page.getByRole("heading", {
			name: /prompt, output, changed files, review bundle, proof/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /choose the route that matches how you are evaluating the product/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: /open the proof desk/i }).first(),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /built first for technical evaluators and react \+ shadcn teams/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /machine-readable discovery and seo guardrails/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: /open frontdoor json/i }),
	).toBeVisible();

	await page.getByRole("button", { name: "中文" }).click();

	await expect(
		page.getByRole("heading", {
			name: /把 react ui 写进你的工作区，并把证据与评审保留在流程里。/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /按你当前最在意的问题，选一条最短路线。/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: /查看 30 秒证据链/i }),
	).toBeVisible();
	await expect(
		page.getByText("把改动写进真实工作区", { exact: true }),
	).toBeVisible();

	await page
		.getByRole("link", { name: /打开对比页/i })
		.first()
		.click();
	await expect(
		page.getByRole("heading", {
			name: /把 OpenUI 和 Bolt、Lovable、v0 放在一起看/i,
		}),
	).toBeVisible();
	await expect(page.getByText(/诚实的边界线/i)).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /先选车道，再选工具/i,
		}),
	).toBeVisible();
	await expect(page.getByRole("link", { name: /去工作台/i })).toBeVisible();
});

test("walkthrough keeps the tour actionable instead of reading like a doc slice", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await page.goto(`${server.baseURL}/walkthrough`, { waitUntil: "load" });
	await disableMotion(page);

	await expect(
		page.getByRole("heading", {
			name: /take the guided route from first impression to proof, then the operator desk/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: /open the proof desk/i }).first(),
	).toBeVisible();
	await expect(
		page.getByRole("heading", {
			name: /pick the path that matches how deep you want to go/i,
		}),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: /30-second proof/i }).first(),
	).toBeVisible();
	const structuredDataScripts = page.locator(
		'script[type="application/ld+json"]',
	);
	if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
		await expect(structuredDataScripts.first()).toContainText("HowTo");
	} else {
		await expect(structuredDataScripts).toHaveCount(0);
	}
});

test("docs route keeps the discovery hub, shelves, and anchor routing live", async ({
	page,
	server,
	pageErrorGuard,
}) => {
	void pageErrorGuard;
	await page.goto(`${server.baseURL}/docs`, { waitUntil: "load" });
	await disableMotion(page);

	await expect(
		page.getByRole("heading", {
			name: /keep the docs inside a guided route, not a blob dump/i,
		}),
	).toBeVisible();
	await expect(page.locator("#docs-shelves")).toHaveCount(1);
	await expect(
		page.getByRole("link", { name: /open public distribution bundle/i }),
	).toBeVisible();

	await page
		.getByRole("link", { name: /jump to external activation ledger/i })
		.click();
	await expect(page).toHaveURL(/\/docs#external-activation-ledger$/);
	await expect(page.locator("#external-activation-ledger")).toBeVisible();
});
