import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

const DETECTION_FIXTURE = {
	workspaceRoot: "/tmp/openui-workspace",
	source: "default" as const,
	uiImportBase: "@/components/ui",
	uiDir: "components/ui",
	componentsImportBase: "@/components",
	componentsDir: "components",
	evidence: ["fixture"],
};

const tempDirs: string[] = [];
const ORIGINAL_OPENUI_MCP_CACHE_DIR = process.env.OPENUI_MCP_CACHE_DIR;
const ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT =
	process.env.OPENUI_MCP_WORKSPACE_ROOT;

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

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
	const block = result.content.find((item) => item.type === "text");
	if (!block?.text) {
		throw new Error("Tool result is missing text content.");
	}
	return block.text;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object") {
		throw new Error("Expected object payload.");
	}
	return value as Record<string, unknown>;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	if (ORIGINAL_OPENUI_MCP_CACHE_DIR === undefined) {
		delete process.env.OPENUI_MCP_CACHE_DIR;
	} else {
		process.env.OPENUI_MCP_CACHE_DIR = ORIGINAL_OPENUI_MCP_CACHE_DIR;
	}
	if (ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT === undefined) {
		delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	} else {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT;
	}
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("prompt->html request helper wiring", () => {
	it("openui_make_react_page keeps the previous HTML request shape", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const openuiSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>draft</main>");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: DETECTION_FIXTURE,
			uiImportBase: DETECTION_FIXTURE.uiImportBase,
			styleGuide: "Use spacing scale",
		});

		const convertSpy = vi
			.spyOn(shared, "convertHtmlToReactShadcn")
			.mockResolvedValue({
				detection: DETECTION_FIXTURE,
				payload: {
					files: [
						{
							path: "app/page.tsx",
							content: "export default function Page() { return null; }",
						},
					],
					notes: ["converted"],
				},
			});

		const { registerConvertTools } = await import("../services/mcp-server/src/tools/convert.js");
		const harness = createToolHarness();
		registerConvertTools(harness.server);

		const result = await harness.getHandler("openui_make_react_page")({
			prompt: "Build dashboard",
			pagePath: "app/page.tsx",
			componentsDir: "components/generated",
			model: "gemini/gemini-test",
			workspaceRoot: "/tmp/openui-workspace",
			useFast: true,
		});

		expect(openuiSpy).toHaveBeenCalledTimes(1);
		const chatInput = asRecord(openuiSpy.mock.calls[0]?.[0]);
		expect(chatInput).toMatchObject({
			system: "Generate HTML only (no markdown), semantic and accessible.",
			prompt: "Build dashboard\n\nStyle constraints:\nUse spacing scale",
			model: "gemini/gemini-test",
			routeKey: "strong",
			temperature: 0.2,
		});
		expect(chatInput.requestId).toEqual(
			expect.stringMatching(/^make_page_html_/),
		);
		expect(Object.hasOwn(chatInput, "useFast")).toBe(false);

		expect(convertSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				html: "<main>draft</main>",
				uiImportBase: DETECTION_FIXTURE.uiImportBase,
				styleGuide: "Use spacing scale",
			}),
		);

		const payload = JSON.parse(readText(result)) as { html: string };
		expect(payload.html).toBe("<main>draft</main>");
	});

	it("openui_ship_react_page keeps the previous HTML request shape", async () => {
		process.env.OPENUI_MCP_CACHE_DIR = await mkTempDir(
			"openui-ship-prompt-cache-",
		);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		const openuiSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>ship</main>");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection: DETECTION_FIXTURE,
			uiImportBase: DETECTION_FIXTURE.uiImportBase,
			styleGuide: "Use card layout",
		});

		vi.spyOn(shared, "convertHtmlToReactShadcn").mockResolvedValue({
			detection: DETECTION_FIXTURE,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content: "export default function Page() { return <main />; }",
					},
				],
				notes: ["converted"],
			},
		});

		const applySpy = vi
			.spyOn(fileOps, "applyGeneratedFiles")
			.mockResolvedValue({
				targetRoot: "/tmp/openui-workspace",
				dryRun: false,
				rollbackOnError: true,
				plan: [{ path: "app/page.tsx", status: "create" }],
				written: ["app/page.tsx"],
				rolledBack: false,
			});

		const qualitySpy = vi.spyOn(quality, "runQualityGate").mockResolvedValue({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship dashboard",
			pagePath: "app/page.tsx",
			componentsDir: "components/generated",
			model: "gemini/gemini-test",
			workspaceRoot: "/tmp/openui-workspace",
			dryRun: false,
			runCommands: false,
			useFast: true,
		});

		expect(openuiSpy).toHaveBeenCalledTimes(1);
		const chatInput = asRecord(openuiSpy.mock.calls[0]?.[0]);
		expect(chatInput).toMatchObject({
			system: "Generate HTML only (no markdown), semantic and accessible.",
			prompt: "Ship dashboard\n\nStyle constraints:\nUse card layout",
			model: "gemini/gemini-test",
			routeKey: "strong",
		});
		expect(chatInput.requestId).toEqual(expect.stringMatching(/^ship_html_/));
		expect(Object.hasOwn(chatInput, "temperature")).toBe(false);
		expect(Object.hasOwn(chatInput, "useFast")).toBe(false);

		expect(applySpy).toHaveBeenCalledWith(
			expect.objectContaining({
				targetRoot: "/tmp/openui-workspace",
				dryRun: false,
			}),
		);
		expect(qualitySpy).toHaveBeenCalledWith(
			expect.objectContaining({
				targetRoot: "/tmp/openui-workspace",
				runCommands: false,
			}),
		);

		const payload = JSON.parse(readText(result)) as { html: string };
		expect(payload.html).toBe("<main>ship</main>");
	});
});
