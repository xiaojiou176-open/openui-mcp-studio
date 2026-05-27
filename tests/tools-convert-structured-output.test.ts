import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("convert structured output policy", () => {
	it("forces JSON schema + mime type for convert pipeline", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const completeSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue(
				'{"files":[{"path":"app/page.tsx","content":"export default function Page(){return null;}"}]}',
			);

		await shared.convertHtmlToReactShadcn({
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
		});

		expect(completeSpy).toHaveBeenCalledTimes(1);
		const request = completeSpy.mock.calls[0]?.[0] as Record<string, unknown>;
		expect(request.responseMimeType).toBe("application/json");
		expect(request.responseJsonSchema).toEqual(
			shared.MultiFileOutputJsonSchema,
		);
	});

	it("rejects bare text drift when convert output is not valid JSON", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			"plain text output",
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
		).rejects.toThrow("Model output is not valid JSON");
	});

	it("rejects model output that writes into shadcn primitive directory", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		vi.spyOn(openui, "openuiChatComplete").mockResolvedValue(
			JSON.stringify({
				files: [
					{
						path: "components/ui/button.tsx",
						content: "export const B=()=>null;",
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
		).rejects.toThrow(/shadcn primitive file/);
	});

	it("sanitizeGeneratedFiles rejects invalid and protected paths", async () => {
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		expect(() =>
			shared.sanitizeGeneratedFiles([{ path: "./../bad.tsx", content: "x" }]),
		).toThrow(/Invalid generated file path/);
		expect(() =>
			shared.sanitizeGeneratedFiles([{ path: ".env", content: "x" }]),
		).toThrow(/protected file/);
	});
});
