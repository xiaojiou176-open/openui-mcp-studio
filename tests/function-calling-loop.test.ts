import { afterEach, describe, expect, it, vi } from "vitest";
import { createSidecarHarness } from "./sidecar-harness.js";

type BridgeCall = {
	method: string;
	params: Record<string, unknown>;
};

const ENV_KEYS = [
	"GEMINI_API_KEY",
	"OPENUI_MAX_RETRIES",
	"OPENUI_RETRY_BASE_MS",
] as const;

const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

const RESOLUTION = {
	routeKey: "strong" as const,
	resolvedModel: "gemini-2.5-pro",
	source: "route" as const,
	routingMode: "on" as const,
};

async function loadProviderWithBridgeMock(): Promise<{
	provider: typeof import("../services/mcp-server/src/providers/gemini-provider.js");
	calls: BridgeCall[];
}> {
	const calls: BridgeCall[] = [];
	let turn = 0;

	class GeminiPythonSidecarBridgeMock {
		public async request(
			method: string,
			params: Record<string, unknown>,
		): Promise<unknown> {
			calls.push({ method, params });
			turn += 1;
			return {
				text: `turn-${turn}`,
				function_calls: [],
				safety_decisions: [],
			};
		}

		public async stop(): Promise<void> {}
	}

	vi.doMock("../services/mcp-server/src/providers/gemini-python-sidecar.js", () => ({
		GeminiPythonSidecarBridge: GeminiPythonSidecarBridgeMock,
	}));

	const provider = await import("../services/mcp-server/src/providers/gemini-provider.js");
	return { provider, calls };
}

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	vi.restoreAllMocks();
	vi.resetModules();
});

describe("function calling loop wiring", () => {
	it("supports two-turn tool loop payloads", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const tools = [
			{
				function_declarations: [
					{
						name: "lookup_weather",
						description: "Look up weather by city name.",
						parameters: {
							type: "object",
							properties: {
								city: { type: "string" },
							},
							required: ["city"],
						},
					},
				],
			},
		];

		const toolChoice = {
			type: "function",
			function: { name: "lookup_weather" },
		};

		const functionResponses = [
			{
				name: "lookup_weather",
				response: { city: "Seattle", temperatureC: 8 },
			},
		];

		const { provider, calls } = await loadProviderWithBridgeMock();

		const turn1 = await provider.completeWithGemini(
			{
				prompt: "Get weather for Seattle.",
				tools,
				toolChoice,
			},
			RESOLUTION,
		);

		const turn2 = await provider.completeWithGemini(
			{
				prompt: "Produce final answer using tool output.",
				tools,
				toolChoice,
				functionResponses,
			},
			RESOLUTION,
		);

		expect(turn1).toBe("turn-1");
		expect(turn2).toBe("turn-2");
		expect(calls).toHaveLength(2);

		expect(calls[0]?.params.tools).toEqual(tools);
		expect(calls[0]?.params.tool_choice).toEqual(toolChoice);
		expect(calls[0]?.params.function_responses).toBeUndefined();

		expect(calls[1]?.params.tools).toEqual(tools);
		expect(calls[1]?.params.tool_choice).toEqual(toolChoice);
		expect(calls[1]?.params.function_responses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "lookup_weather",
					response: { city: "Seattle", temperatureC: 8 },
					thought_signature: expect.stringMatching(/^legacy_/),
				}),
			]),
		);
	});

	it("sidecar maps OpenAI-style tool_choice and injects function_responses into contents", async () => {
		const harness = await createSidecarHarness();
		try {
			const response = await harness.request(1, "generate_content", {
				model: "gemini-2.5-pro",
				contents: [{ role: "user", parts: [{ text: "turn 2" }] }],
				tool_choice: {
					type: "function",
					function: { name: "lookup_weather" },
				},
				function_responses: [
					{
						name: "lookup_weather",
						response: { city: "Seattle", temperatureC: 8 },
					},
				],
			});

			const result = response.result as Record<string, unknown>;
			const payload = JSON.parse(String(result.text)) as Record<
				string,
				unknown
			>;
			const config = payload.config as Record<string, unknown>;
			const toolConfig = config.tool_config as Record<string, unknown>;
			const functionCallingConfig =
				toolConfig.function_calling_config as Record<string, unknown>;
			expect(functionCallingConfig.mode).toBe("ANY");
			expect(functionCallingConfig.allowed_function_names).toEqual([
				"lookup_weather",
			]);

			const contents = payload.contents as Array<Record<string, unknown>>;
			expect(contents).toHaveLength(2);
			const secondParts = (contents[1]?.parts ?? []) as Array<
				Record<string, unknown>
			>;
			const functionResponse = secondParts[0]?.function_response as Record<
				string,
				unknown
			>;
			expect(functionResponse.name).toBe("lookup_weather");
			expect(functionResponse.response).toEqual({
				city: "Seattle",
				temperatureC: 8,
			});
		} finally {
			harness.stop();
			await harness.cleanup();
		}
	});

	it("rejects invalid functionResponses shape", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider } = await loadProviderWithBridgeMock();

		await expect(
			provider.completeWithGemini(
				{
					prompt: "finalize response",
					functionResponses: [
						{
							name: "",
							response: { ok: true },
						},
					],
				},
				RESOLUTION,
			),
		).rejects.toThrow("functionResponses[0].name must be a non-empty string");
	});

	it("preserves function_calls and safety_decisions in detailed response", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		class GeminiPythonSidecarBridgeMock {
			public async request(): Promise<unknown> {
				return {
					text: "",
					function_calls: [
						{ name: "lookup_weather", args: { city: "Seattle" } },
					],
					safety_decisions: [{ policy: "computer_use", decision: "allow" }],
				};
			}

			public async stop(): Promise<void> {}
		}

		vi.doMock("../services/mcp-server/src/providers/gemini-python-sidecar.js", () => ({
			GeminiPythonSidecarBridge: GeminiPythonSidecarBridgeMock,
		}));

		const provider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		const response = await provider.completeWithGeminiResult(
			{
				prompt: "call tool",
			},
			RESOLUTION,
		);

		expect(response.text).toBe("");
		expect(response.function_calls).toEqual([
			{ name: "lookup_weather", args: { city: "Seattle" } },
		]);
		expect(response.safety_decisions).toEqual([
			{ policy: "computer_use", decision: "allow" },
		]);
	});

	it("rejects conflicting routeKey/useFast inputs", async () => {
		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		await expect(
			aiClient.aiChatComplete({
				prompt: "hello",
				routeKey: "strong",
				useFast: true,
			}),
		).rejects.toThrow("routeKey and useFast cannot be used together");
	});

	it("aborts retry backoff wait when signal is aborted", async () => {
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "1000";

		const completeWithGeminiMock = vi
			.fn()
			.mockRejectedValue(new Error("network timeout"));
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: completeWithGeminiMock,
			listGeminiModels: vi.fn(),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const controller = new AbortController();
		const input = {
			prompt: "retry then abort",
			signal: controller.signal,
		} as unknown as Parameters<typeof aiClient.aiChatComplete>[0];
		const promise = aiClient.aiChatComplete(input);
		setTimeout(() => controller.abort(), 10);

		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		expect(completeWithGeminiMock).toHaveBeenCalledTimes(1);
	});
});
