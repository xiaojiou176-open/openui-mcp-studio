import { describe, expect, it } from "vitest";

import { buildStructuredDiscoveryJsonLd } from "../apps/web/lib/seo";

describe("structured discovery JSON-LD", () => {
	it("returns null when there is no canonical site URL", () => {
		expect(
			buildStructuredDiscoveryJsonLd({
				siteUrl: null,
				path: "/proof",
				title: "30-second proof for React UI delivery",
				description: "Proof page",
				type: "WebPage",
				breadcrumbLabel: "Proof",
			}),
		).toBeNull();
	});

	it("builds route-level JSON-LD plus breadcrumbs for canonical pages", () => {
		const jsonLd = buildStructuredDiscoveryJsonLd({
			siteUrl: "https://oneclickui.ai",
			path: "/docs",
			title: "Discovery docs hub",
			description: "One readable route through the docs shelves.",
			type: "CollectionPage",
			breadcrumbLabel: "Docs",
			about: ["README storefront", "proof desk"],
		});

		expect(jsonLd).toEqual([
			expect.objectContaining({
				"@context": "https://schema.org",
				"@type": "CollectionPage",
				url: "https://oneclickui.ai/docs",
				inLanguage: "en-US",
				isPartOf: {
					"@type": "WebSite",
					name: "OneClickUI.ai",
					url: "https://oneclickui.ai",
				},
			}),
			expect.objectContaining({
				"@type": "BreadcrumbList",
				itemListElement: expect.arrayContaining([
					expect.objectContaining({ position: 1, name: "OneClickUI.ai" }),
					expect.objectContaining({
						position: 2,
						name: "Docs",
						item: "https://oneclickui.ai/docs",
					}),
				]),
			}),
		]);
	});

	it("adds HowTo steps when the route is a walkthrough page", () => {
		const jsonLd = buildStructuredDiscoveryJsonLd({
			siteUrl: "https://oneclickui.ai",
			path: "/walkthrough",
			title: "First-minute walkthrough",
			description: "A fast route through the front door and proof desk.",
			type: "HowTo",
			breadcrumbLabel: "Walkthrough",
			howToSteps: [
				"Read the front door like a product evaluator.",
				"See the proof desk before the operator desk.",
			],
		});

		expect(jsonLd?.[0]).toEqual(
			expect.objectContaining({
				"@type": "HowTo",
				step: [
					expect.objectContaining({
						"@type": "HowToStep",
						position: 1,
						name: "Read the front door like a product evaluator.",
					}),
					expect.objectContaining({
						"@type": "HowToStep",
						position: 2,
						name: "See the proof desk before the operator desk.",
					}),
				],
			}),
		);
	});
});
