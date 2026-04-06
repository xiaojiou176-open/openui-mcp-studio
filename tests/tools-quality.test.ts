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
	const block = result.content.find((item) => item.type === "text");
	if (!block?.text) {
		throw new Error("Tool result is missing text content.");
	}
	return block.text;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("quality tool", () => {
	it("forwards payload to runQualityGate and returns serialized result", async () => {
		const qualityGate = await import(
			"../services/mcp-server/src/quality-gate.js"
		);

		const gateSpy = vi.spyOn(qualityGate, "runQualityGate").mockResolvedValue({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});

		const { registerQualityTool } = await import(
			"../services/mcp-server/src/tools/quality.js"
		);
		const harness = createToolHarness();
		registerQualityTool(harness.server);

		const result = await harness.getHandler("openui_quality_gate")({
			files: [
				{
					path: "app/page.tsx",
					content: "export default function Page() { return null; }",
				},
			],
			targetRoot: "/tmp/workspace",
			runCommands: true,
			preset: "lint",
			mode: "strict",
		});

		expect(gateSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				targetRoot: "/tmp/workspace",
				runCommands: true,
				preset: "lint",
				mode: "strict",
			}),
		);

		const payload = JSON.parse(readText(result)) as {
			passed: boolean;
			issues: unknown[];
			commandResults: unknown[];
			checkedFiles: string[];
		};
		expect(payload).toEqual({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});
	});

	it("uses workspace root fallback when targetRoot is omitted", async () => {
		const constants = await import("../services/mcp-server/src/constants.js");
		const qualityGate = await import(
			"../services/mcp-server/src/quality-gate.js"
		);
		vi.spyOn(constants, "getWorkspaceRoot").mockReturnValue(
			"/tmp/fallback-root",
		);
		const gateSpy = vi.spyOn(qualityGate, "runQualityGate").mockResolvedValue({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});

		const { registerQualityTool } = await import(
			"../services/mcp-server/src/tools/quality.js"
		);
		const harness = createToolHarness();
		registerQualityTool(harness.server);

		await harness.getHandler("openui_quality_gate")({
			files: [
				{ path: "app/page.tsx", content: "export default function Page(){}" },
			],
		});

		expect(gateSpy).toHaveBeenCalledWith(
			expect.objectContaining({ targetRoot: "/tmp/fallback-root" }),
		);
	});

	it("forwards acceptance-oriented fields to runQualityGate", async () => {
		const qualityGate = await import(
			"../services/mcp-server/src/quality-gate.js"
		);

		const gateSpy = vi.spyOn(qualityGate, "runQualityGate").mockResolvedValue({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
			acceptancePack: {
				version: 1,
				prompt: "Create hero",
				criteria: [],
				unresolvedAssumptions: [],
				recommendedChecks: [],
			},
			acceptanceEvaluation: {
				version: 1,
				verdict: "passed",
				passed: true,
				results: [],
				summary: {
					total: 0,
					autoPassed: 0,
					autoFailed: 0,
					manualRequired: 0,
					notRun: 0,
					blocked: 0,
				},
			},
		});

		const { registerQualityTool } = await import(
			"../services/mcp-server/src/tools/quality.js"
		);
		const harness = createToolHarness();
		registerQualityTool(harness.server);

		await harness.getHandler("openui_quality_gate")({
			files: [
				{ path: "app/page.tsx", content: "export default function Page(){}" },
			],
			acceptanceCriteria: ["Headline should mention pricing."],
			responsiveRequirements: ["CTA should stay visible on mobile."],
			a11yRequirements: ["Focus state must be visible."],
			visualRequirements: ["Hero should feel polished."],
			manualReviewItems: ["Check brand tone."],
			smokePassed: true,
		});

		expect(gateSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				acceptanceCriteria: ["Headline should mention pricing."],
				responsiveRequirements: ["CTA should stay visible on mobile."],
				a11yRequirements: ["Focus state must be visible."],
				visualRequirements: ["Hero should feel polished."],
				manualReviewItems: ["Check brand tone."],
				smokePassed: true,
			}),
		);
	});
});
