import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();

	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const text = result.content.find((item) => item.type === "text")?.text;
	if (!text) {
		throw new Error("Tool result missing text payload");
	}
	return text;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("tool registration coverage", () => {
	it("registerApplyTool delegates to applyGeneratedFiles with exact payload", async () => {
		const applyGeneratedFiles = vi.fn(async () => ({
			applied: 2,
			rolledBack: false,
		}));
		vi.doMock("../services/mcp-server/src/file-ops.js", () => ({
			applyGeneratedFiles,
		}));

		const { registerApplyTool } = await import(
			"../services/mcp-server/src/tools/apply.js"
		);
		const harness = createToolHarness();
		registerApplyTool(harness.server);

		const input = {
			files: [
				{ path: "app/page.tsx", content: "export default function Page(){}" },
			],
			targetRoot: "/tmp/workspace",
			dryRun: true,
			rollbackOnError: true,
		};
		const result = await harness.getHandler("openui_apply_files")(input);
		expect(applyGeneratedFiles).toHaveBeenCalledTimes(1);
		expect(applyGeneratedFiles).toHaveBeenCalledWith(input);
		expect(JSON.parse(readText(result))).toEqual({
			applied: 2,
			rolledBack: false,
		});
	});

	it("registerDetectTool delegates to detectShadcnPaths and returns structured JSON", async () => {
		const detectShadcnPaths = vi.fn(async () => ({
			source: "components.json",
			uiImportBase: "@/components/ui",
			componentsDir: "components",
		}));
		vi.doMock("../services/mcp-server/src/path-detection.js", () => ({
			detectShadcnPaths,
		}));

		const { registerDetectTool } = await import(
			"../services/mcp-server/src/tools/detect.js"
		);
		const harness = createToolHarness();
		registerDetectTool(harness.server);

		const result = await harness.getHandler("openui_detect_shadcn_paths")({
			workspaceRoot: "/repo",
		});
		expect(detectShadcnPaths).toHaveBeenCalledTimes(1);
		expect(detectShadcnPaths).toHaveBeenCalledWith("/repo");
		expect(JSON.parse(readText(result))).toMatchObject({
			source: "components.json",
			uiImportBase: "@/components/ui",
		});
	});

	it("registerModelsTool delegates to listOpenuiModels and serializes response", async () => {
		const listOpenuiModels = vi.fn(async () => ({
			primary: {
				models: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
			},
		}));
		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual(
				"../services/mcp-server/src/tools/shared.js",
			);
			return { ...actual, listOpenuiModels };
		});

		const { registerModelsTool } = await import(
			"../services/mcp-server/src/tools/models.js"
		);
		const harness = createToolHarness();
		registerModelsTool(harness.server);

		const result = await harness.getHandler("openui_list_models")({});
		expect(listOpenuiModels).toHaveBeenCalledTimes(1);
		expect(JSON.parse(readText(result))).toEqual({
			primary: {
				models: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
			},
		});
	});

	it("openui_convert_react_shadcn forwards conversion args and merges detection into payload", async () => {
		const convertHtmlToReactShadcn = vi.fn(async () => ({
			detection: { source: "default", uiImportBase: "@/components/ui" },
			payload: {
				files: [
					{ path: "app/page.tsx", content: "export default function Page(){}" },
				],
				notes: ["converted"],
			},
		}));
		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual(
				"../services/mcp-server/src/tools/shared.js",
			);
			return { ...actual, convertHtmlToReactShadcn };
		});

		const { registerConvertTools } = await import(
			"../services/mcp-server/src/tools/convert.js"
		);
		const harness = createToolHarness();
		registerConvertTools(harness.server);

		const result = await harness.getHandler("openui_convert_react_shadcn")({
			html: "<main>Hello</main>",
			pagePath: "app/page.tsx",
			componentsDir: "components/generated",
			workspaceRoot: "/repo",
			thinkingLevel: "high",
			includeThoughts: true,
		});

		expect(convertHtmlToReactShadcn).toHaveBeenCalledTimes(1);
		expect(convertHtmlToReactShadcn).toHaveBeenCalledWith(
			expect.objectContaining({
				html: "<main>Hello</main>",
				pagePath: "app/page.tsx",
				componentsDir: "components/generated",
				workspaceRoot: "/repo",
				thinkingLevel: "high",
				includeThoughts: true,
			}),
		);
		expect(JSON.parse(readText(result))).toEqual({
			detection: { source: "default", uiImportBase: "@/components/ui" },
			files: [
				{ path: "app/page.tsx", content: "export default function Page(){}" },
			],
			notes: ["converted"],
		});
	});

	it("openui_make_react_page resolves style guide, requests html, and converts with resolved detection", async () => {
		const resolveShadcnStyleGuide = vi.fn(async () => ({
			styleGuide: "resolved guide",
			uiImportBase: "@/components/ui",
			detection: {
				source: "components.json",
				uiImportBase: "@/components/ui",
				componentsDir: "components",
			},
		}));
		const requestHtmlFromPrompt = vi.fn(
			async () => "<main>generated html</main>",
		);
		const convertHtmlToReactShadcn = vi.fn(async () => ({
			detection: { source: "components.json", uiImportBase: "@/components/ui" },
			payload: {
				files: [
					{ path: "app/page.tsx", content: "export default function Page(){}" },
				],
				notes: ["ok"],
			},
		}));
		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual(
				"../services/mcp-server/src/tools/shared.js",
			);
			return {
				...actual,
				resolveShadcnStyleGuide,
				requestHtmlFromPrompt,
				convertHtmlToReactShadcn,
			};
		});

		const { registerConvertTools } = await import(
			"../services/mcp-server/src/tools/convert.js"
		);
		const harness = createToolHarness();
		registerConvertTools(harness.server);

		const result = await harness.getHandler("openui_make_react_page")({
			prompt: "Create a dashboard page",
			pagePath: "app/page.tsx",
			componentsDir: "components/generated",
			workspaceRoot: "/repo",
			thinkingLevel: "low",
			includeThoughts: false,
		});

		expect(resolveShadcnStyleGuide).toHaveBeenCalledWith({
			workspaceRoot: "/repo",
			uiImportBase: undefined,
			styleGuide: undefined,
		});
		expect(requestHtmlFromPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Create a dashboard page",
				styleGuide: "resolved guide",
				routeKey: "strong",
				requestIdPrefix: "make_page_html",
			}),
		);
		expect(convertHtmlToReactShadcn).toHaveBeenCalledWith(
			expect.objectContaining({
				html: "<main>generated html</main>",
				uiImportBase: "@/components/ui",
				styleGuide: "resolved guide",
				detection: {
					source: "components.json",
					uiImportBase: "@/components/ui",
					componentsDir: "components",
				},
			}),
		);
		expect(JSON.parse(readText(result))).toEqual({
			detection: { source: "components.json", uiImportBase: "@/components/ui" },
			html: "<main>generated html</main>",
			files: [
				{ path: "app/page.tsx", content: "export default function Page(){}" },
			],
			notes: ["ok"],
		});
	});
});
