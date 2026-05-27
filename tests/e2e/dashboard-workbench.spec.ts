import { test as base, expect } from "playwright/test";
import {
	activateControl,
	disableMotion,
	resolveWorkbenchUrl,
	waitForWorkbenchReady,
} from "./helpers/interaction";
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
	await page.goto(resolveWorkbenchUrl(server.baseURL), { waitUntil: "load" });
	await disableMotion(page);
	await expect(page.getByTestId("workbench-page")).toBeVisible();
	await waitForWorkbenchReady(page);
});

test("workbench surfaces the decision posture before operators move a packet", async ({
	page,
}) => {
	await expect(
		page.getByRole("link", { name: /open the proof desk/i }).first(),
	).toBeVisible();
	await expect(page.getByTestId("desk-signals")).toContainText(
		"How to read this desk in 15 seconds",
	);
	await expect(page.getByTestId("desk-signals")).toContainText(
		"Already proved here",
	);
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

	await activateControl(page.getByRole("button", { name: /reset state/i }));
	await expect(page.getByTestId("error-state")).toHaveCount(0);
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-brief-129"),
	).toBeVisible();
	await expect(
		page.getByTestId("work-item-list").getByTestId("work-item-flow-301"),
	).toBeVisible();
});

test("language switching changes workbench dialog and recovery copy", async ({
	page,
}) => {
	await page.getByRole("button", { name: "中文" }).click();

	await expect(
		page.getByRole("heading", {
			name: /带着证据推进下一次 ui\/ux 交付判断/i,
		}),
	).toBeVisible();
	await expect(page.getByText(/命令栏/i)).toBeVisible();
	await expect(
		page.getByRole("link", { name: "打开证据台" }).first(),
	).toBeVisible();
	await expect(page.getByTestId("desk-signals")).toContainText(
		"15 秒读懂这块工作台",
	);
	await expect(page.getByTestId("operator-focus-card")).toContainText(
		"当前焦点",
	);
	await expect(page.getByTestId("pause-card")).toContainText("先暂停");
	await expect(page.getByTestId("decision-split")).toContainText("已经证明");
	await expect(page.getByTestId("operator-guide")).toContainText("操盘指引");

	await activateControl(page.getByTestId("create-draft-trigger"));
	await expect(
		page.getByRole("heading", { name: /创建可上线的界面说明包/i }),
	).toBeVisible();
	await expect(page.getByText(/^提示词$/)).toBeVisible();
	await expect(
		page.getByRole("button", { name: "加入操作包队列" }),
	).toBeVisible();
	await page.getByRole("button", { name: "取消" }).click();

	await activateControl(page.getByTestId("simulate-error"));
	await expect(page.getByText(/工作区丢失了最新同步/i)).toBeVisible();
	await expect(page.getByRole("button", { name: /重置状态/i })).toBeVisible();

	await page.getByRole("link", { name: "打开证据台" }).first().click();
	await expect(
		page.getByRole("heading", {
			name: /先看清证明边界，再决定要不要信这份包/i,
		}),
	).toBeVisible();
});
