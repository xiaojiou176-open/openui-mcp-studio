import { afterEach, describe, expect, it, vi } from "vitest";
import { createSidecarHarness } from "./sidecar-harness.js";

type BridgeCall = {
	method: string;
	params: Record<string, unknown>;
};

const ENV_KEYS = ["GEMINI_API_KEY"] as const;

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

	class GeminiPythonSidecarBridgeMock {
		public async request(
			method: string,
			params: Record<string, unknown>,
		): Promise<unknown> {
			calls.push({ method, params });
			return {
				text: "roundtrip-ok",
				function_calls: [],
				safety_decisions: [],
			};
		}

		public async stop(): Promise<void> {}
	}

	vi.doMock(
		"../services/mcp-server/src/providers/gemini-python-sidecar.js",
		() => ({
			GeminiPythonSidecarBridge: GeminiPythonSidecarBridgeMock,
		}),
	);

	const provider = await import(
		"../services/mcp-server/src/providers/gemini-provider.js"
	);
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

describe("thought signature roundtrip", () => {
	it("keeps thought_signature payload intact in function responses", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const functionResponses = [
			{
				name: "lookup_palette",
				response: {
					palette: "ocean",
					accent: "teal",
				},
				thought_signature: "sig_abc123",
			},
		];

		const { provider, calls } = await loadProviderWithBridgeMock();

		const text = await provider.completeWithGemini(
			{
				prompt: "Use the tool response to finish the design brief.",
				functionResponses,
			},
			RESOLUTION,
		);

		expect(text).toBe("roundtrip-ok");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.function_responses).toEqual(functionResponses);
		const firstResponse = (
			calls[0]?.params.function_responses as Array<Record<string, unknown>>
		)[0];
		expect(firstResponse?.thought_signature).toBe("sig_abc123");
	});

	it("sidecar keeps thought_signature when translating function_responses into request contents", async () => {
		const harness = await createSidecarHarness();
		try {
			const response = await harness.request(1, "generate_content", {
				model: "gemini-2.5-pro",
				contents: [{ role: "user", parts: [{ text: "final answer" }] }],
				function_responses: [
					{
						name: "lookup_palette",
						response: {
							palette: "ocean",
							accent: "teal",
						},
						thought_signature: "sig_abc123",
					},
				],
			});

			const result = response.result as Record<string, unknown>;
			const payload = JSON.parse(String(result.text)) as Record<
				string,
				unknown
			>;
			const contents = payload.contents as Array<Record<string, unknown>>;
			const secondParts = (contents[1]?.parts ?? []) as Array<
				Record<string, unknown>
			>;
			const functionResponse = secondParts[0]?.function_response as Record<
				string,
				unknown
			>;
			expect(functionResponse.thought_signature).toBe("sig_abc123");
		} finally {
			harness.stop();
			await harness.cleanup();
		}
	});
});
