import { afterEach, describe, expect, it, vi } from "vitest";

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
				text: '{"status":"ok"}',
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

describe("structured output provider wiring", () => {
	it("forwards responseMimeType and responseJsonSchema to sidecar", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const schema = {
			type: "object",
			properties: {
				title: { type: "string" },
				tags: {
					type: "array",
					items: { type: "string" },
				},
			},
			required: ["title"],
		};

		const { provider, calls } = await loadProviderWithBridgeMock();

		const text = await provider.completeWithGemini(
			{
				prompt: "Return a JSON object with page title and tags.",
				responseMimeType: "application/json",
				responseJsonSchema: schema,
			},
			RESOLUTION,
		);

		expect(text).toBe('{"status":"ok"}');
		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.response_mime_type).toBe("application/json");
		expect(calls[0]?.params.response_json_schema).toEqual(schema);
	});

	it("drops non-object responseJsonSchema values", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider, calls } = await loadProviderWithBridgeMock();

		await provider.completeWithGemini(
			{
				prompt: "Return JSON",
				responseMimeType: "application/json",
				responseJsonSchema: "invalid-schema" as unknown as Record<
					string,
					unknown
				>,
			},
			RESOLUTION,
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.response_mime_type).toBe("application/json");
		expect(calls[0]?.params.response_json_schema).toBeUndefined();
	});
});
