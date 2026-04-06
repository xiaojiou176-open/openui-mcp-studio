import { afterEach, describe, expect, it } from "vitest";

import { buildPageMetadata } from "../apps/web/lib/site-metadata";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
	if (ORIGINAL_SITE_URL === undefined) {
		delete process.env.NEXT_PUBLIC_SITE_URL;
		return;
	}

	process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("site metadata", () => {
	it("builds canonical en-US metadata when NEXT_PUBLIC_SITE_URL is configured", () => {
		process.env.NEXT_PUBLIC_SITE_URL = "https://oneclickui.ai";

		const metadata = buildPageMetadata({
			title: "Proof workbench",
			description: "Inspect the proof workbench",
			path: "/workbench",
			keywords: ["Codex MCP UI workflow", "Codex MCP UI workflow"],
		});

		expect(metadata.applicationName).toBe("OpenUI MCP Studio");
		expect(metadata.category).toBe("developer tools");
		expect(metadata.alternates).toEqual({
			canonical: "https://oneclickui.ai/workbench",
			languages: {
				"en-US": "https://oneclickui.ai/workbench",
			},
		});
		expect(metadata.openGraph?.locale).toBe("en_US");
		expect(metadata.openGraph?.images).toEqual(["/api/social-preview"]);
		expect(metadata.twitter?.images).toEqual(["/api/social-preview"]);
		expect(metadata.keywords).toEqual(
			expect.arrayContaining([
				"Codex MCP UI workflow",
				"Claude Code UI workflow",
				"MCP server for React UI delivery",
			]),
		);
		expect(
			(metadata.keywords as string[]).filter(
				(keyword) => keyword === "Codex MCP UI workflow",
			),
		).toHaveLength(1);
	});

	it("keeps the page noindex when NEXT_PUBLIC_SITE_URL is absent", () => {
		delete process.env.NEXT_PUBLIC_SITE_URL;

		const metadata = buildPageMetadata({
			title: "Proof workbench",
			description: "Inspect the proof workbench",
			path: "/workbench",
		});

		expect(metadata.alternates).toBeUndefined();
		expect(metadata.robots).toEqual({
			index: false,
			follow: false,
		});
		expect(metadata.openGraph?.images).toBeUndefined();
		expect(metadata.twitter?.images).toBeUndefined();
	});

	it("ignores non-http site URLs so canonical metadata stays honest", () => {
		process.env.NEXT_PUBLIC_SITE_URL = "ftp://oneclickui.ai";

		const metadata = buildPageMetadata({
			title: "Proof workbench",
			description: "Inspect the proof workbench",
			path: "/workbench",
		});

		expect(metadata.alternates).toBeUndefined();
		expect(metadata.robots).toEqual({
			index: false,
			follow: false,
		});
		expect(metadata.openGraph?.images).toBeUndefined();
		expect(metadata.twitter?.images).toBeUndefined();
	});
});
