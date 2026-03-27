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

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object") {
		throw new Error("Expected object payload.");
	}
	return value as Record<string, unknown>;
}

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
				text: "cache-ok",
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

describe("context caching", () => {
	it("requestHtmlFromPrompt forwards cachedContent and cacheTtlSeconds", async () => {
		const openui = await import("../services/mcp-server/src/openui-client.js");
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		const openuiSpy = vi
			.spyOn(openui, "openuiChatComplete")
			.mockResolvedValue("<main>cached-html</main>");

		const html = await shared.requestHtmlFromPrompt({
			prompt: "Generate dashboard shell.",
			styleGuide: "Use compact spacing",
			requestIdPrefix: "cache_case",
			cachedContent: "cache/doc-123",
			cacheTtlSeconds: 120,
		});

		expect(html).toBe("<main>cached-html</main>");
		expect(openuiSpy).toHaveBeenCalledTimes(1);
		const request = asRecord(openuiSpy.mock.calls[0]?.[0]);
		expect(request.cachedContent).toBe("cache/doc-123");
		expect(request.cacheTtlSeconds).toBe(120);
	});

	it("completeWithGemini forwards cached_content and cache_ttl_seconds", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider, calls } = await loadProviderWithBridgeMock();

		const text = await provider.completeWithGemini(
			{
				prompt: "Continue using cached context.",
				cachedContent: "cache/doc-123",
				cacheTtlSeconds: 300,
			},
			RESOLUTION,
		);

		expect(text).toBe("cache-ok");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.cached_content).toBe("cache/doc-123");
		expect(calls[0]?.params.cache_ttl_seconds).toBe(300);
	});

	it("auto-enables context cache for long prompts when not explicitly set", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider, calls } = await loadProviderWithBridgeMock();
		const longPrompt = "x".repeat(4_500);

		const text = await provider.completeWithGemini(
			{
				prompt: longPrompt,
			},
			RESOLUTION,
		);

		expect(text).toBe("cache-ok");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.cached_content).toEqual(
			expect.stringMatching(/^auto\//),
		);
		expect(calls[0]?.params.cache_ttl_seconds).toBe(300);
	});

	it("does not auto-enable cache for long prompts when system instruction is present", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider, calls } = await loadProviderWithBridgeMock();
		const longPrompt = "x".repeat(4_500);

		const text = await provider.completeWithGemini(
			{
				prompt: longPrompt,
				system: "Act as a strict UI reviewer.",
			},
			RESOLUTION,
		);

		expect(text).toBe("cache-ok");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.cached_content).toBeUndefined();
		expect(calls[0]?.params.cache_ttl_seconds).toBeUndefined();
	});

	it("sidecar validates positive cache_ttl_seconds and forwards cached_content via config", async () => {
		const harness = await createSidecarHarness();
		try {
			const okResponse = await harness.request(1, "generate_content", {
				model: "gemini-2.5-pro",
				contents: [{ role: "user", parts: [{ text: "use cache" }] }],
				cached_content: "cache/doc-123",
				cache_ttl_seconds: 120,
			});

			const okResult = asRecord(okResponse.result);
			const payload = JSON.parse(String(okResult.text)) as Record<
				string,
				unknown
			>;
			expect(payload.cached_content).toBeUndefined();
			expect(payload.cache_ttl_seconds).toBeUndefined();
			const config = asRecord(payload.config);
			expect(config.cached_content).toBe("cache/doc-123");

			const badResponse = await harness.request(2, "generate_content", {
				model: "gemini-2.5-pro",
				contents: [{ role: "user", parts: [{ text: "bad ttl" }] }],
				cache_ttl_seconds: 0,
			});

			const error = asRecord(badResponse.error);
			const data = asRecord(error.data);
			expect(data.reason).toBe("cache_ttl_seconds_must_be_positive_integer");
		} finally {
			harness.stop();
			await harness.cleanup();
		}
	});
});
