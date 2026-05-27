import { test as base, expect } from "playwright/test";
import {
	createPageErrorGuard,
	type PageErrorGuard,
} from "./helpers/page-error-guard";

const EXTERNAL_TIMEOUT_MS = 15_000;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const test = base.extend<{
	readonlyState: {
		blockedWriteAttempts: string[];
		expectedBlockedWriteAttempts: number;
		pageErrorGuard: PageErrorGuard;
	};
}>({
	readonlyState: async ({ context, page }, use) => {
		const readonlyState = {
			blockedWriteAttempts: [] as string[],
			expectedBlockedWriteAttempts: 0,
			pageErrorGuard: createPageErrorGuard(page),
		};
		await context.route("**/*", async (route, request) => {
			const method = request.method().toUpperCase();
			if (WRITE_METHODS.has(method)) {
				readonlyState.blockedWriteAttempts.push(`${method} ${request.url()}`);
				await route.abort("blockedbyclient");
				return;
			}
			await route.continue();
		});

		await use(readonlyState);

		expect(
			readonlyState.blockedWriteAttempts.length,
			`external readonly E2E blocked write request(s): ${readonlyState.blockedWriteAttempts.join(", ")}`,
		).toBe(readonlyState.expectedBlockedWriteAttempts);
		await readonlyState.pageErrorGuard.assertNoPageErrors();
	},
});

test.describe("external site readonly inspection", () => {
	test("example.com renders expected readonly content", async ({
		page,
		readonlyState,
	}) => {
		const navigationEvidence: string[] = [];
		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) {
				navigationEvidence.push(frame.url());
			}
		});

		await page.goto("https://example.com/", {
			waitUntil: "domcontentloaded",
			timeout: EXTERNAL_TIMEOUT_MS,
		});

		await expect(page).toHaveTitle(/Example Domain/i);
		await expect(
			page.getByRole("heading", { level: 1, name: "Example Domain" }),
		).toBeVisible();
		await expect(page.locator("body")).toContainText(/documentation examples/i);

		const moreInfoLink = page.getByRole("link", {
			name: /Learn more|More information/i,
		});
		await expect(moreInfoLink).toHaveAttribute("href", /iana\.org/);
		await Promise.all([
			page.waitForURL(/https:\/\/(?:www\.)?iana\.org\//i, {
				timeout: EXTERNAL_TIMEOUT_MS,
			}),
			moreInfoLink.click(),
		]);
		expect(page.url()).toMatch(/iana\.org/i);
		expect(
			navigationEvidence.some((url) => /example\.com/i.test(url)),
			`expected navigation evidence to include example.com, got: ${navigationEvidence.join(" -> ")}`,
		).toBe(true);
		expect(
			navigationEvidence.some((url) => /iana\.org/i.test(url)),
			`expected navigation evidence to include iana.org, got: ${navigationEvidence.join(" -> ")}`,
		).toBe(true);
		expect(readonlyState.blockedWriteAttempts).toEqual([]);
	});

	test("example.com timeout fallback: injected timeout fails fast then recovery succeeds", async ({
		page,
	}) => {
		await page.route("https://example.com/", async (route) => {
			await route.abort("timedout");
		});

		await expect(
			page.goto("https://example.com/", {
				waitUntil: "domcontentloaded",
				timeout: EXTERNAL_TIMEOUT_MS,
			}),
		).rejects.toThrow(
			/ERR_TIMED_OUT|NS_ERROR_NET_TIMEOUT|timed out|Navigation timeout/i,
		);

		await page.unroute("https://example.com/");

		const recovered = await page.goto("https://example.com/", {
			waitUntil: "domcontentloaded",
			timeout: EXTERNAL_TIMEOUT_MS,
		});
		expect(recovered).not.toBeNull();
		expect(recovered?.status()).toBe(200);
		await expect(page).toHaveTitle(/Example Domain/i);
	});

	test("external readonly guard blocks explicit write request and captures evidence", async ({
		page,
		readonlyState,
	}) => {
		readonlyState.expectedBlockedWriteAttempts = 1;
		await page.goto("https://example.com/", {
			waitUntil: "domcontentloaded",
			timeout: EXTERNAL_TIMEOUT_MS,
		});

		const writeError = await page.evaluate(async () => {
			try {
				await fetch("https://example.com/write-attempt", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ probe: "readonly-guard" }),
				});
				return "unexpected-success";
			} catch (error) {
				if (error instanceof Error) {
					return error.message;
				}
				return String(error);
			}
		});

		expect(writeError).not.toBe("unexpected-success");
		expect(
			readonlyState.blockedWriteAttempts.some(
				(entry) =>
					entry.startsWith("POST ") &&
					/https:\/\/example\.com\/write-attempt/i.test(entry),
			),
			`expected blocked write evidence for POST /write-attempt, got: ${readonlyState.blockedWriteAttempts.join(", ")}`,
		).toBe(true);
	});
});
