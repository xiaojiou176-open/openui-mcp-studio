import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import {
	ComputerUseInputSchema,
	registerComputerUseTool,
} from "../services/mcp-server/src/tools/computer-use.js";

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

describe("computer use safety confirmation", () => {
	it("defaults requireConfirmation to true", () => {
		const parsed = ComputerUseInputSchema.parse({
			input: { text: "Inspect account settings page." },
			plannedActions: [],
		});

		expect(parsed.requireConfirmation).toBe(true);
		expect(parsed.confirmed).toBe(false);
	});

	it("blocks risky actions when confirmation is required but not provided", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_computer_use_loop")({
			input: { text: "Delete temporary file if present." },
			plannedActions: [{ type: "file_delete", target: "/tmp/example.txt" }],
		});

		const payload = JSON.parse(readText(result)) as {
			status: string;
			blockedActions: Array<{ type: string }>;
		};

		expect(payload.status).toBe("blocked_confirmation");
		expect(payload.blockedActions).toHaveLength(1);
		expect(payload.blockedActions[0]?.type).toBe("file_delete");
	});

	it("allows risky single action when requireConfirmation=false", async () => {
		const harness = createToolHarness();
		registerComputerUseTool(harness.server);

		const result = await harness.getHandler("openui_execute_ui_action")({
			action: { type: "execute_shell", target: "rm -rf /tmp/demo" },
			requireConfirmation: false,
			confirmed: false,
		});

		const payload = JSON.parse(readText(result)) as {
			status: string;
			confirmationValidated: boolean;
			executed: { type: string };
		};

		expect(payload.status).toBe("ok");
		expect(payload.executed.type).toBe("execute_shell");
		expect(payload.confirmationValidated).toBe(false);
	});
});
