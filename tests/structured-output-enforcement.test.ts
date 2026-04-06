import { afterEach, describe, expect, it, vi } from "vitest";

const DETECTION_FIXTURE = {
	workspaceRoot: "/tmp/openui-workspace",
	source: "default" as const,
	uiImportBase: "@/components/ui",
	uiDir: "components/ui",
	componentsImportBase: "@/components",
	componentsDir: "components",
	evidence: ["fixture"],
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("structured output enforcement", () => {
	it("fails fast when model returns non-JSON output under structured contract", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			"<main>not-json</main>",
		);

		await expect(
			shared.convertHtmlToReactShadcn({
				html: "<main>input</main>",
				pagePath: "app/page.tsx",
				componentsDir: "components/generated",
				detection: DETECTION_FIXTURE,
				styleGuide: "Use compact spacing",
				responseMimeType: "application/json",
				responseJsonSchema: {
					type: "object",
					properties: {
						files: { type: "array" },
					},
					required: ["files"],
				},
			}),
		).rejects.toThrow(/not valid JSON/i);
	}, 30_000);

	it("fails when JSON shape does not match required files schema", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			JSON.stringify({ notes: ["missing files"] }),
		);

		await expect(
			shared.convertHtmlToReactShadcn({
				html: "<main>input</main>",
				pagePath: "app/page.tsx",
				componentsDir: "components/generated",
				detection: DETECTION_FIXTURE,
				styleGuide: "Use compact spacing",
				responseMimeType: "application/json",
				responseJsonSchema: {
					type: "object",
					properties: {
						files: { type: "array" },
					},
					required: ["files"],
				},
			}),
		).rejects.toThrow(/does not match files schema/i);
	}, 30_000);
});
