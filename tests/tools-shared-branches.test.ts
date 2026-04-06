import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("tools/shared branch coverage extras", () => {
	it("requestHtmlFromPrompt forwards useFast only when routeKey is not provided", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const openuiSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>ok</main>");

		await shared.requestHtmlFromPrompt({
			prompt: "Generate UI",
			styleGuide: "Use cards",
			requestIdPrefix: "shared_branch",
			useFast: true,
			temperature: 0.4,
		});

		await shared.requestHtmlFromPrompt({
			prompt: "Generate UI",
			styleGuide: "Use cards",
			requestIdPrefix: "shared_branch",
			routeKey: "strong",
			useFast: true,
		});

		const firstRequest = openuiSpy.mock.calls[0]?.[0] as Record<
			string,
			unknown
		>;
		const secondRequest = openuiSpy.mock.calls[1]?.[0] as Record<
			string,
			unknown
		>;

		expect(firstRequest.useFast).toBe(true);
		expect(firstRequest.temperature).toBe(0.4);
		expect(Object.hasOwn(secondRequest, "useFast")).toBe(false);
	});

	it("listOpenuiModels delegates to openuiListModels", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const payload = { provider: "gemini", models: ["gemini-2.5-pro"] };
		vi.spyOn(openui, "openuiListModels").mockResolvedValue(payload);

		await expect(shared.listOpenuiModels()).resolves.toEqual(payload);
	});

	it("resolveShadcnStyleGuide falls back to detection + default style guide", async () => {
		const pathDetection = await import(
			"../services/mcp-server/src/path-detection.js"
		);
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const detection = {
			workspaceRoot: "/tmp/openui-workspace",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(pathDetection, "detectShadcnPaths").mockResolvedValue(detection);

		const resolved = await shared.resolveShadcnStyleGuide({
			workspaceRoot: "/tmp/openui-workspace",
			uiImportBase: "   ",
			styleGuide: "   ",
		});

		expect(resolved.detection).toEqual(detection);
		expect(resolved.uiImportBase).toBe("@/components/ui");
		expect(resolved.styleGuide).toContain("@/components/ui");
	});

	it("resolveShadcnStyleGuide respects explicit detection and trims overrides", async () => {
		const pathDetection = await import(
			"../services/mcp-server/src/path-detection.js"
		);
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const detection = {
			workspaceRoot: "/tmp/openui-explicit",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		const detectSpy = vi.spyOn(pathDetection, "detectShadcnPaths");

		const resolved = await shared.resolveShadcnStyleGuide({
			detection,
			uiImportBase: " @/custom/ui ",
			styleGuide: " explicit style guide ",
		});

		expect(detectSpy).not.toHaveBeenCalled();
		expect(resolved.detection).toEqual(detection);
		expect(resolved.uiImportBase).toBe("@/custom/ui");
		expect(resolved.styleGuide).toBe("explicit style guide");
	});

	it("sanitizeGeneratedFiles rejects duplicate normalized paths", async () => {
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		expect(() =>
			shared.sanitizeGeneratedFiles([
				{ path: "app/page.tsx", content: "first" },
				{ path: "./app/page.tsx", content: "second" },
			]),
		).toThrow("Duplicate generated file paths are not allowed");
	});

	it("convertHtmlToReactShadcn rejects schema-invalid JSON payloads", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			JSON.stringify({
				files: [{ path: "app/page.tsx" }],
			}),
		);

		await expect(
			shared.convertHtmlToReactShadcn({
				html: "<main>Hello</main>",
				pagePath: "app/page.tsx",
				componentsDir: "components/generated",
				detection: {
					workspaceRoot: "/tmp/workspace",
					source: "default",
					uiImportBase: "@/components/ui",
					uiDir: "components/ui",
					componentsImportBase: "@/components",
					componentsDir: "components",
					evidence: ["fixture"],
				},
			}),
		).rejects.toThrow("Model JSON does not match files schema");
	});

	it("convertHtmlToReactShadcn rejects absolute output paths", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			JSON.stringify({
				files: [
					{
						path: "/tmp/app/page.tsx",
						content: "export default function Page() { return null; }",
					},
				],
			}),
		);

		await expect(
			shared.convertHtmlToReactShadcn({
				html: "<main>Hello</main>",
				pagePath: "app/page.tsx",
				componentsDir: "components/generated",
				detection: {
					workspaceRoot: "/tmp/workspace",
					source: "default",
					uiImportBase: "@/components/ui",
					uiDir: "components/ui",
					componentsImportBase: "@/components",
					componentsDir: "components",
					evidence: ["fixture"],
				},
			}),
		).rejects.toThrow("Invalid generated file path: /tmp/app/page.tsx");
	});

	it("convertHtmlToReactShadcn rejects path traversal output paths", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			JSON.stringify({
				files: [
					{
						path: "../escape/page.tsx",
						content: "export default function Page() { return null; }",
					},
				],
			}),
		);

		await expect(
			shared.convertHtmlToReactShadcn({
				html: "<main>Hello</main>",
				pagePath: "app/page.tsx",
				componentsDir: "components/generated",
				detection: {
					workspaceRoot: "/tmp/workspace",
					source: "default",
					uiImportBase: "@/components/ui",
					uiDir: "components/ui",
					componentsImportBase: "@/components",
					componentsDir: "components",
					evidence: ["fixture"],
				},
			}),
		).rejects.toThrow("Invalid generated file path: ../escape/page.tsx");
	});
});
