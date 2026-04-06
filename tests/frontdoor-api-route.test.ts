import { describe, expect, it } from "vitest";

import { GET } from "../apps/web/app/api/frontdoor/route";

describe("frontdoor API route", () => {
	it("returns a builder-facing JSON snapshot of the public front door", async () => {
		const response = GET();
		const payload = await response.json();

		expect(payload.product.technicalName).toBe("OpenUI MCP Studio");
		expect(payload.product.category).toBe(
			"MCP-native UI/UX delivery and review workflow",
		);
		expect(payload.product.language).toBe("en-US");
		expect(payload.product.positioning).toContain(
			"UI/UX execution, proof, and review companion",
		);
		expect(payload.brandSplit).toEqual(
			expect.objectContaining({
				technicalName: "OpenUI MCP Studio",
				frontdoorName: "OneClickUI.ai",
				canonicalRuntime: "local stdio MCP",
			}),
		);
		expect(payload.routes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					href: "/proof",
					role: "proof desk",
				}),
				expect.objectContaining({
					href: "/workbench",
					role: "operator desk",
				}),
			]),
		);
		expect(payload.bindings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "MCP" }),
				expect.objectContaining({ name: "Codex" }),
				expect.objectContaining({ name: "Claude Code" }),
			]),
		);
		expect(payload.machineReadableSurfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ href: "/llms.txt" }),
				expect.objectContaining({ href: "/api/frontdoor" }),
				expect.objectContaining({ href: "/manifest.webmanifest" }),
				expect.objectContaining({ href: "/robots.txt" }),
			]),
		);
		expect(payload.discoveryChain).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ href: "/", role: "orientation surface" }),
				expect.objectContaining({
					href: "/api/frontdoor",
					role: "structured discovery contract",
				}),
			]),
		);
		expect(payload.i18n.publicSurfaceLanguage).toBe("en-US");
		expect(payload.i18n.defaultLocale).toBe("en-US");
		expect(payload.i18n.supportedLocales).toEqual(["en-US", "zh-CN"]);
		expect(payload.i18n.localeCookieName).toBe("openui_locale");
		expect(payload.i18n.uiSwitchScope).toBe(
			"apps/web frontdoor routes and shared shell",
		);
		expect(payload.builderSurface.order).toHaveLength(3);
		expect(payload.builderEntryPoints).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					step: "Step 1",
					audience: expect.any(String),
					bestFor: expect.any(String),
					notFor: expect.any(String),
				}),
			]),
		);
		expect(payload.machineReadableSurfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					href: "/api/frontdoor",
					audience: expect.any(String),
					bestFor: expect.any(String),
					readWhen: expect.any(String),
					notFor: expect.any(String),
				}),
			]),
		);
		expect(payload.ecosystemProductization).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "formal-skills",
					status: "current-packaging",
				}),
				expect.objectContaining({
					id: "plugin-like-install-packaging",
					status: "official-surface-ready",
				}),
				expect.objectContaining({
					id: "openclaw-public-ready",
					status: "clawhub-ready",
				}),
			]),
		);
		expect(payload.publicBundle).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "Visual proof assets" }),
				expect.objectContaining({ title: "Machine-readable discovery" }),
			]),
		);
		expect(payload.operatorOnlyPublicSurfaces).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "GitHub Homepage" }),
				expect.objectContaining({ title: "Published release proof bundle" }),
			]),
		);
		expect(payload.publicProductLines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "codex-claude-public-package",
					status: "official-surface-ready",
				}),
				expect.objectContaining({
					id: "openclaw-public-ready",
					status: "clawhub-ready",
				}),
			]),
		);
		expect(payload.builderSurface.laterLanes).toEqual(
			expect.arrayContaining([
				"official catalog or marketplace listing",
				"registry publication for supporting package surfaces",
				"managed hosted deployment",
				"remote write-capable MCP",
			]),
		);
		expect(payload.builderSurface.laterLanes).not.toContain(
			"formal Skills surface",
		);
		expect(payload.builderSurface.laterLanes).not.toContain("SDK packaging");
		expect(payload.builderSurface.laterLanes).not.toContain(
			"hosted API product surface",
		);
		expect(payload.seo.manifest).toBe("/manifest.webmanifest");
		expect(payload.seo.sitemap).toBe("/sitemap.xml");
		expect(payload.seo.robots).toBe("/robots.txt");
		expect(payload.boundaries).toContain("not a generic AI assistant");
		expect(payload.boundaries).toContain(
			"unsupported marketplace claims remain out of scope",
		);
	});
});
