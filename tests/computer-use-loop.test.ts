import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerComputerUseTool } from "../services/mcp-server/src/tools/computer-use.js";

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
});

describe("computer use loop", () => {
	it("invokes Gemini observation when observe tool invokeModel=true", async () => {
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		const geminiSpy = vi
			.spyOn(geminiProvider, "computerUseStepWithGemini")
			.mockResolvedValue({
				text: "Detected dashboard with failed check.",
				function_calls: [{ name: "click", args: { target: "#retry" } }],
				safety_decisions: [{ category: "dangerous_action", decision: "block" }],
			});

		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_observe_screen")({
			input: { text: "Inspect the latest deployment status.", images: [] },
			invokeModel: true,
			model: "gemini-3.1-pro-preview",
		});

		const payload = JSON.parse(readText(result)) as {
			status: string;
			mode: string;
			observation: string;
			functionCalls: Array<{ name: string; args?: Record<string, unknown> }>;
			safetyDecisions: Array<{ category: string }>;
			imageCount: number;
		};

		expect(geminiSpy).toHaveBeenCalledTimes(1);
		expect(geminiSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "gemini-3.1-pro-preview",
			}),
		);
		expect(payload.status).toBe("ok");
		expect(payload.mode).toBe("gemini");
		expect(payload.observation).toBe("Detected dashboard with failed check.");
		expect(payload.functionCalls).toEqual([
			{ name: "click", args: { target: "#retry" } },
		]);
		expect(payload.safetyDecisions[0]?.category).toBe("dangerous_action");
		expect(payload.imageCount).toBe(0);
	});

	it("executes actions up to maxSteps and returns loop summary", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_computer_use_loop")({
			input: { text: "Open dashboard and check latest build status." },
			requireConfirmation: false,
			invokeModel: false,
			maxSteps: 2,
			plannedActions: [
				{ type: "observe", target: "#page" },
				{ type: "click", target: "#builds-tab" },
				{ type: "wait", value: "500ms" },
			],
		});

		const payload = JSON.parse(readText(result)) as {
			status: string;
			requireConfirmation: boolean;
			confirmed: boolean;
			executedCount: number;
			truncated: boolean;
			executedSteps: Array<{ step: number; type: string }>;
			observation: null;
		};

		expect(payload.status).toBe("ok");
		expect(payload.requireConfirmation).toBe(false);
		expect(payload.confirmed).toBe(false);
		expect(payload.executedCount).toBe(2);
		expect(payload.truncated).toBe(true);
		expect(payload.executedSteps[0]?.type).toBe("observe");
		expect(payload.executedSteps[1]?.type).toBe("click");
		expect(payload.observation).toBeNull();
	});

	it("includes Gemini observation in loop result when invokeModel=true", async () => {
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		const geminiSpy = vi
			.spyOn(geminiProvider, "computerUseStepWithGemini")
			.mockResolvedValue({
				text: "Build tab opened and status panel visible.",
				function_calls: [{ name: "observe" }],
				safety_decisions: [{ decision: "allow" }],
			});

		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_computer_use_loop")({
			input: { text: "Open build tab." },
			requireConfirmation: false,
			invokeModel: true,
			maxSteps: 1,
			plannedActions: [{ type: "click", target: "#builds-tab" }],
		});

		const payload = JSON.parse(readText(result)) as {
			status: string;
			executedCount: number;
			observation?: {
				text: string;
				functionCalls: Array<{ name: string }>;
				safetyDecisions: Array<{ decision: string }>;
			};
		};

		expect(geminiSpy).toHaveBeenCalledTimes(1);
		expect(geminiSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				model: expect.any(String),
			}),
		);
		expect(payload.status).toBe("ok");
		expect(payload.executedCount).toBe(1);
		expect(payload.observation?.text).toBe(
			"Build tab opened and status panel visible.",
		);
		expect(payload.observation?.functionCalls).toEqual([{ name: "observe" }]);
		expect(payload.observation?.safetyDecisions).toEqual([
			{ decision: "allow" },
		]);
	});

	it("blocks risky loop actions when token is missing and allows with token", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const blocked = await harness.getHandler("openui_computer_use_loop")({
			sessionId: "sess-1",
			input: { text: "Delete temporary file." },
			requireConfirmation: true,
			confirmed: true,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const blockedPayload = JSON.parse(readText(blocked)) as {
			status: string;
			requiredConfirmationToken?: string;
		};
		expect(blockedPayload.status).toBe("blocked_confirmation");
		expect(typeof blockedPayload.requiredConfirmationToken).toBe("string");
		expect((blockedPayload.requiredConfirmationToken ?? "").length).toBe(32);

		const allowed = await harness.getHandler("openui_computer_use_loop")({
			sessionId: "sess-1",
			input: { text: "Delete temporary file." },
			requireConfirmation: true,
			confirmed: true,
			confirmationToken: blockedPayload.requiredConfirmationToken,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const allowedPayload = JSON.parse(readText(allowed)) as {
			status: string;
			executedCount: number;
		};
		expect(allowedPayload.status).toBe("ok");
		expect(allowedPayload.executedCount).toBe(1);
	});

	it("allows risky loop actions when requireConfirmation=false", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const allowed = await harness.getHandler("openui_computer_use_loop")({
			sessionId: "sess-require-false",
			input: { text: "Delete temporary file." },
			requireConfirmation: false,
			confirmed: false,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const payload = JSON.parse(readText(allowed)) as {
			status: string;
			executedCount: number;
			executedSteps: Array<{ type: string }>;
		};
		expect(payload.status).toBe("ok");
		expect(payload.executedCount).toBe(1);
		expect(payload.executedSteps[0]?.type).toBe("file_delete");
	});

	it("rejects confirmation token reuse across sessions", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const blocked = await harness.getHandler("openui_computer_use_loop")({
			sessionId: "session-a",
			input: { text: "Delete temporary file." },
			requireConfirmation: true,
			confirmed: false,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const blockedPayload = JSON.parse(readText(blocked)) as {
			status: string;
			requiredConfirmationToken?: string;
		};
		expect(blockedPayload.status).toBe("blocked_confirmation");
		expect(typeof blockedPayload.requiredConfirmationToken).toBe("string");

		const replayBlocked = await harness.getHandler("openui_computer_use_loop")({
			sessionId: "session-b",
			input: { text: "Delete temporary file." },
			requireConfirmation: true,
			confirmed: true,
			confirmationToken: blockedPayload.requiredConfirmationToken,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const replayPayload = JSON.parse(readText(replayBlocked)) as {
			status: string;
		};
		expect(replayPayload.status).toBe("blocked_confirmation");
	});

	it("rejects anonymous token when replayed with explicit session id", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const blocked = await harness.getHandler("openui_computer_use_loop")({
			input: { text: "Delete temporary file." },
			requireConfirmation: true,
			confirmed: false,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const blockedPayload = JSON.parse(readText(blocked)) as {
			status: string;
			requiredConfirmationToken?: string;
		};
		expect(blockedPayload.status).toBe("blocked_confirmation");
		expect(typeof blockedPayload.requiredConfirmationToken).toBe("string");

		const replayBlocked = await harness.getHandler("openui_computer_use_loop")({
			sessionId: "session-a",
			input: { text: "Delete temporary file." },
			requireConfirmation: true,
			confirmed: true,
			confirmationToken: blockedPayload.requiredConfirmationToken,
			invokeModel: false,
			maxSteps: 1,
			plannedActions: [{ type: "file_delete", target: "./tmp.txt" }],
		});

		const replayPayload = JSON.parse(readText(replayBlocked)) as {
			status: string;
		};
		expect(replayPayload.status).toBe("blocked_confirmation");
	});

	it("enforces single-action confirmation token for risky execute_ui_action", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const blocked = await harness.getHandler("openui_execute_ui_action")({
			sessionId: "single-action-session",
			action: { type: "execute_shell", target: "rm -rf /tmp/demo" },
			requireConfirmation: true,
			confirmed: true,
		});

		const blockedPayload = JSON.parse(readText(blocked)) as {
			status: string;
			requiredConfirmationToken?: string;
		};
		expect(blockedPayload.status).toBe("blocked_confirmation");
		expect(typeof blockedPayload.requiredConfirmationToken).toBe("string");
		expect((blockedPayload.requiredConfirmationToken ?? "").length).toBe(32);

		const allowed = await harness.getHandler("openui_execute_ui_action")({
			sessionId: "single-action-session",
			action: { type: "execute_shell", target: "rm -rf /tmp/demo" },
			requireConfirmation: true,
			confirmed: true,
			confirmationToken: blockedPayload.requiredConfirmationToken,
		});

		const allowedPayload = JSON.parse(readText(allowed)) as {
			status: string;
			confirmationValidated: boolean;
			executed: { type: string; executedAt: string };
		};
		expect(allowedPayload.status).toBe("ok");
		expect(allowedPayload.confirmationValidated).toBe(true);
		expect(allowedPayload.executed.type).toBe("execute_shell");
		expect(new Date(allowedPayload.executed.executedAt).toISOString()).toBe(
			allowedPayload.executed.executedAt,
		);
	});
});
