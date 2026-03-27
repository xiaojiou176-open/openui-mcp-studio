import { expect, type Locator, type Page } from "playwright/test";

export type InteractionKind = "button" | "link" | "toggle" | "tab";
type InteractionRole = "button" | "link" | "tab";

export type InteractionTarget = {
	kind: InteractionKind;
	role: InteractionRole;
	testId: string;
	name: string;
};

export type InteractionSnapshot = {
	url: string;
	signal: string;
	epoch: number;
	ariaSignature: string;
	domSignature: string;
};

export type InteractionReaction = {
	reacted: boolean;
	before: InteractionSnapshot;
	after: InteractionSnapshot;
};
export type InteractionTrigger = "click" | "keyboard";
export type SingleSelectStateSnapshot = {
	dataState: string | null;
	ariaPressed: string | null;
	ariaChecked: string | null;
	ariaSelected: string | null;
	checked: string | null;
};

const SURFACE_TEST_ID = "interaction-surface";
const SIGNAL_TEST_ID = "interaction-signal";
const TARGET_TEST_ID = "status-anchor";
const TARGETS_BY_KIND: Record<InteractionKind, readonly InteractionTarget[]> = {
	button: [
		{
			kind: "button",
			role: "button",
			testId: "control-activate",
			name: "Activate panel",
		},
	],
	link: [
		{
			kind: "link",
			role: "link",
			testId: "control-jump-link",
			name: "Jump to status anchor",
		},
	],
	toggle: [
		{
			kind: "toggle",
			role: "button",
			testId: "control-review-toggle",
			name: "Mark reviewed",
		},
	],
	tab: [
		{
			kind: "tab",
			role: "tab",
			testId: "control-tab-overview",
			name: "Overview",
		},
		{
			kind: "tab",
			role: "tab",
			testId: "control-tab-details",
			name: "Details",
		},
	],
};
const TARGET_KINDS: readonly InteractionKind[] = [
	"button",
	"link",
	"toggle",
	"tab",
];

export async function disableMotion(page: Page): Promise<void> {
	await page.addStyleTag({
		content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    `,
	});
}

export async function waitForWorkbenchReady(page: Page): Promise<void> {
	const workbench = page.getByTestId("workbench-page");
	try {
		await expect(workbench).toHaveAttribute("data-hydrated", "true", {
			timeout: 8_000,
		});
		return;
	} catch {
		await page.reload({ waitUntil: "load" });
		await disableMotion(page);
		await expect(workbench).toHaveAttribute("data-hydrated", "true", {
			timeout: 15_000,
		});
	}
}

export async function activateControl(locator: Locator): Promise<void> {
	await expect(locator).toBeVisible();
	await locator.focus();
	const role = await locator.getAttribute("role");
	await locator.press(role === "radio" ? "Space" : "Enter");
}

export async function collectInteractionTargets(
	page: Page,
): Promise<InteractionTarget[]> {
	const surface = page.getByTestId(SURFACE_TEST_ID);
	await expect(surface).toBeVisible();

	const targets: InteractionTarget[] = [];

	for (const kind of TARGET_KINDS) {
		const expected = TARGETS_BY_KIND[kind];
		for (const item of expected) {
			const byRole = surface.getByRole(item.role, { name: item.name });
			await expect(byRole).toHaveCount(1);
			const byId = page.getByTestId(item.testId);
			await expect(byId).toBeVisible();
			targets.push(item);
		}
	}

	return targets;
}

export function getActiveTabPanelLocator(page: Page): Locator {
	return page.locator('[data-slot="tabs-content"][data-state="active"]');
}

function normalizeStateToken(value: string | null): string | null {
	return value?.trim().toLowerCase() ?? null;
}

function hasExpectedStateToken(
	snapshot: SingleSelectStateSnapshot,
	expectedState: "selected" | "unselected",
): boolean {
	const tokens = [
		snapshot.dataState,
		snapshot.ariaPressed,
		snapshot.ariaChecked,
		snapshot.ariaSelected,
		snapshot.checked,
	]
		.map(normalizeStateToken)
		.filter((value): value is string => value !== null);

	const expectedTokens =
		expectedState === "selected"
			? new Set(["on", "true", "checked", "selected"])
			: new Set(["off", "false", "unchecked", "unselected"]);

	return tokens.some((token) => expectedTokens.has(token));
}

export async function readSingleSelectState(
	locator: Locator,
): Promise<SingleSelectStateSnapshot> {
	return await locator.evaluate((element) => {
		const embeddedInput =
			element instanceof HTMLInputElement
				? element
				: element.querySelector('input[type="radio"], input[type="checkbox"]');
		const checked =
			embeddedInput instanceof HTMLInputElement
				? String(embeddedInput.checked)
				: null;
		return {
			dataState: element.getAttribute("data-state"),
			ariaPressed: element.getAttribute("aria-pressed"),
			ariaChecked: element.getAttribute("aria-checked"),
			ariaSelected: element.getAttribute("aria-selected"),
			checked,
		};
	});
}

export async function isSingleSelectOn(locator: Locator): Promise<boolean> {
	const snapshot = await readSingleSelectState(locator);
	return hasExpectedStateToken(snapshot, "selected");
}

export async function expectSingleSelectState(
	locator: Locator,
	expectedSelected: boolean,
): Promise<void> {
	const snapshot = await readSingleSelectState(locator);
	const hasSemanticStateToken =
		snapshot.dataState !== null ||
		snapshot.ariaPressed !== null ||
		snapshot.ariaChecked !== null ||
		snapshot.ariaSelected !== null ||
		snapshot.checked !== null;
	expect(
		hasSemanticStateToken,
		`Expected selectable target to expose state semantics, got ${JSON.stringify(snapshot)}`,
	).toBe(true);
	expect(
		hasExpectedStateToken(
			snapshot,
			expectedSelected ? "selected" : "unselected",
		),
		`Unexpected selectable state. expectedSelected=${String(expectedSelected)}, snapshot=${JSON.stringify(snapshot)}`,
	).toBe(true);
}

export function getInteractionLocator(
	page: Page,
	target: InteractionTarget,
): Locator {
	return page.getByTestId(target.testId);
}

function didStateChange(
	before: InteractionSnapshot,
	after: InteractionSnapshot,
): boolean {
	return (
		before.url !== after.url ||
		before.signal !== after.signal ||
		before.epoch !== after.epoch ||
		before.ariaSignature !== after.ariaSignature ||
		before.domSignature !== after.domSignature
	);
}

async function snapshotInteractionState(
	page: Page,
): Promise<InteractionSnapshot> {
	return await page.evaluate(
		({ surfaceTestId, signalTestId, targetTestId }) => {
			const surface = document.querySelector(
				`[data-testid="${surfaceTestId}"]`,
			) as HTMLElement | null;
			const signalNode = surface?.querySelector(
				`[data-testid="${signalTestId}"]`,
			) as HTMLElement | null;
			const panelNode = surface?.querySelector(
				'[data-slot="tabs-content"][data-state="active"]',
			) as HTMLElement | null;
			const targetNode = surface?.querySelector(
				`[data-testid="${targetTestId}"]`,
			) as HTMLElement | null;

			const signal = signalNode?.textContent?.trim() ?? "";
			const epoch = Number(surface?.getAttribute("data-epoch") ?? "0");
			const ariaSignature = Array.from(
				surface?.querySelectorAll(
					"[aria-selected], [aria-current], [aria-expanded], [aria-checked], [aria-pressed]",
				) ?? [],
			)
				.map((node, index) => {
					const role = node.getAttribute("role") ?? node.tagName.toLowerCase();
					const selected = node.getAttribute("aria-selected") ?? "";
					const current = node.getAttribute("aria-current") ?? "";
					const expanded = node.getAttribute("aria-expanded") ?? "";
					const checked = node.getAttribute("aria-checked") ?? "";
					const pressed = node.getAttribute("aria-pressed") ?? "";
					return `${index}:${role}:${selected}:${current}:${expanded}:${checked}:${pressed}`;
				})
				.join("|");

			const domSignature = [
				panelNode?.textContent?.trim() ?? "",
				targetNode?.getAttribute("data-touched") ?? "",
			].join("|");

			return {
				url: window.location.href,
				signal,
				epoch,
				ariaSignature,
				domSignature,
			};
		},
		{
			surfaceTestId: SURFACE_TEST_ID,
			signalTestId: SIGNAL_TEST_ID,
			targetTestId: TARGET_TEST_ID,
		},
	);
}

export async function assertTargetReaction(
	page: Page,
	target: InteractionTarget,
	trigger: InteractionTrigger = "click",
): Promise<InteractionReaction> {
	const locator = getInteractionLocator(page, target);
	const before = await snapshotInteractionState(page);
	let lastWaitError: unknown = null;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await locator.scrollIntoViewIfNeeded();
		if (trigger === "keyboard") {
			await locator.focus();
			if (target.kind === "button" || target.kind === "toggle") {
				await locator.press("Space");
			} else {
				await locator.press("Enter");
			}
		} else {
			await locator.click();
		}

		try {
			await page.waitForFunction(
				({ surfaceTestId, signalTestId, targetTestId, previous }) => {
					const surface = document.querySelector(
						`[data-testid="${surfaceTestId}"]`,
					) as HTMLElement | null;
					if (!surface) {
						return false;
					}

					const signalNode = surface.querySelector(
						`[data-testid="${signalTestId}"]`,
					) as HTMLElement | null;
					const panelNode = surface.querySelector(
						'[data-slot="tabs-content"][data-state="active"]',
					) as HTMLElement | null;
					const targetNode = surface.querySelector(
						`[data-testid="${targetTestId}"]`,
					) as HTMLElement | null;
					const signal = signalNode?.textContent?.trim() ?? "";
					const epoch = Number(surface.getAttribute("data-epoch") ?? "0");
					const ariaSignature = Array.from(
						surface.querySelectorAll(
							"[aria-selected], [aria-current], [aria-expanded], [aria-checked], [aria-pressed]",
						),
					)
						.map((node, index) => {
							const role =
								node.getAttribute("role") ?? node.tagName.toLowerCase();
							const selected = node.getAttribute("aria-selected") ?? "";
							const current = node.getAttribute("aria-current") ?? "";
							const expanded = node.getAttribute("aria-expanded") ?? "";
							const checked = node.getAttribute("aria-checked") ?? "";
							const pressed = node.getAttribute("aria-pressed") ?? "";
							return `${index}:${role}:${selected}:${current}:${expanded}:${checked}:${pressed}`;
						})
						.join("|");
					const domSignature = [
						panelNode?.textContent?.trim() ?? "",
						targetNode?.getAttribute("data-touched") ?? "",
					].join("|");

					return (
						window.location.href !== previous.url ||
						signal !== previous.signal ||
						epoch !== previous.epoch ||
						ariaSignature !== previous.ariaSignature ||
						domSignature !== previous.domSignature
					);
				},
				{
					surfaceTestId: SURFACE_TEST_ID,
					signalTestId: SIGNAL_TEST_ID,
					targetTestId: TARGET_TEST_ID,
					previous: before,
				},
				{
					timeout: 3_000,
				},
			);
			lastWaitError = null;
			break;
		} catch (error) {
			lastWaitError = error;
			if (attempt === 1) {
				throw error;
			}
			await page.waitForFunction(
				() =>
					document.readyState === "interactive" ||
					document.readyState === "complete",
				undefined,
				{ timeout: 300 },
			);
		}
	}

	if (lastWaitError) {
		throw lastWaitError;
	}

	const after = await snapshotInteractionState(page);
	return {
		reacted: didStateChange(before, after),
		before,
		after,
	};
}
