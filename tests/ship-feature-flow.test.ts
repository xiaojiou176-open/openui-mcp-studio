import { describe, expect, it } from "vitest";
import { buildFeatureFlowPlan } from "../services/mcp-server/src/ship/feature-flow-plan.js";

describe("feature flow plan", () => {
	it("summarizes route-level feature flow inputs", () => {
		const plan = buildFeatureFlowPlan({
			version: 1,
			name: "Checkout Flow",
			description: "Multi-step checkout",
			layoutPath: "apps/web/app/checkout/layout.tsx",
			sharedComponentsDir: "apps/web/components/checkout",
			routes: [
				{
					id: "cart",
					prompt: "Cart page",
					pagePath: "apps/web/app/cart/page.tsx",
				},
				{
					id: "checkout",
					prompt: "Checkout page",
					pagePath: "apps/web/app/checkout/page.tsx",
				},
			],
		});

		expect(plan).toEqual({
			version: 1,
			name: "Checkout Flow",
			description: "Multi-step checkout",
			routeCount: 2,
			routeIds: ["cart", "checkout"],
			pagePaths: [
				"apps/web/app/cart/page.tsx",
				"apps/web/app/checkout/page.tsx",
			],
			sharedComponentsDir: "apps/web/components/checkout",
			layoutPath: "apps/web/app/checkout/layout.tsx",
		});
	});

	it("normalizes optional feature-flow metadata to null when omitted", () => {
		const plan = buildFeatureFlowPlan({
			version: 1,
			name: "Settings Flow",
			routes: [
				{
					id: "settings",
					prompt: "Settings page",
					pagePath: "apps/web/app/settings/page.tsx",
				},
			],
		});

		expect(plan).toEqual({
			version: 1,
			name: "Settings Flow",
			description: undefined,
			routeCount: 1,
			routeIds: ["settings"],
			pagePaths: ["apps/web/app/settings/page.tsx"],
			sharedComponentsDir: null,
			layoutPath: null,
		});
	});
});
