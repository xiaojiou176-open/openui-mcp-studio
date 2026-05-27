import { expect, type Page } from "playwright/test";

export type PageErrorGuard = {
	assertNoPageErrors: () => Promise<void>;
};

export function createPageErrorGuard(page: Page): PageErrorGuard {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => {
		pageErrors.push(error.stack ?? error.message ?? String(error));
	});

	return {
		async assertNoPageErrors() {
			expect(
				pageErrors,
				`unexpected pageerror detected during E2E run:\n${pageErrors.join("\n\n")}`,
			).toEqual([]);
		},
	};
}
