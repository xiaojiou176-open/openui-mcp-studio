import { afterEach, describe, expect, it, vi } from "vitest";

type BridgeCall = {
	method: string;
	params: Record<string, unknown>;
};

const ENV_KEYS = ["GEMINI_API_KEY", "GEMINI_DEFAULT_THINKING_LEVEL"] as const;

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
				text: "thinking-ok",
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

describe("thinking config", () => {
	it("uses GEMINI_DEFAULT_THINKING_LEVEL when input does not specify thinkingLevel", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key"; // pragma: allowlist secret
		process.env.GEMINI_DEFAULT_THINKING_LEVEL = "low";

		const { provider, calls } = await loadProviderWithBridgeMock();

		const text = await provider.completeWithGemini(
			{
				prompt: "Summarize the dashboard hierarchy.",
			},
			RESOLUTION,
		);

		expect(text).toBe("thinking-ok");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("generate_content");
		expect(calls[0]?.params.thinking_level).toBe("low");
		expect(calls[0]?.params.include_thoughts).toBe(true);
	});

	it("keeps explicit thinkingLevel override and includeThoughts flag", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key"; // pragma: allowlist secret
		process.env.GEMINI_DEFAULT_THINKING_LEVEL = "low";

		const { provider, calls } = await loadProviderWithBridgeMock();

		await provider.completeWithGemini(
			{
				prompt: "Reason at high depth and include chain of thought.",
				thinkingLevel: "high",
				includeThoughts: true,
			},
			RESOLUTION,
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.thinking_level).toBe("high");
		expect(calls[0]?.params.include_thoughts).toBe(true);
	});
});
