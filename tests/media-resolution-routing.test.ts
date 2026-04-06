import { afterEach, describe, expect, it, vi } from "vitest";

type BridgeCall = {
	method: string;
	params: Record<string, unknown>;
};

const ENV_KEYS = [
	"GEMINI_API_KEY",
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MAX_RETRIES",
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
	vi.resetModules();
	const calls: BridgeCall[] = [];
	const sidecar = await import(
		"../services/mcp-server/src/providers/gemini-python-sidecar.js"
	);
	vi.spyOn(
		sidecar.GeminiPythonSidecarBridge.prototype,
		"request",
	).mockImplementation(
		async (method: string, params: Record<string, unknown>) => {
			calls.push({ method, params });
			return {
				text: "media-ok",
				function_calls: [],
				safety_decisions: [],
			};
		},
	);
	vi.spyOn(
		sidecar.GeminiPythonSidecarBridge.prototype,
		"stop",
	).mockResolvedValue();

	const provider = await import(
		"../services/mcp-server/src/providers/gemini-provider.js"
	);
	return { provider, calls };
}

afterEach(async () => {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	const provider = await import(
		"../services/mcp-server/src/providers/gemini-provider.js"
	);
	if ("resetGeminiProviderForTests" in provider) {
		await provider.resetGeminiProviderForTests();
	}
	vi.restoreAllMocks();
	vi.doUnmock("../services/mcp-server/src/providers/gemini-provider.js");
	vi.resetModules();
});

describe("media resolution routing", () => {
	it("normalizes media resolution for request-level payloads", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider, calls } = await loadProviderWithBridgeMock();

		const text = await provider.completeWithGemini(
			{
				prompt: "Describe this screenshot and suggest fixes.",
				inputParts: [
					{
						type: "image",
						mimeType: "image/png",
						data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
						mediaResolution: "ultra_high",
					},
				],
				mediaResolution: "high",
			},
			RESOLUTION,
		);

		expect(text).toBe("media-ok");
		expect(calls).toHaveLength(1);

		const params = calls[0]?.params;
		const contents = params.contents as Array<{
			parts?: Array<Record<string, unknown>>;
		}>;
		const firstPart = contents[0]?.parts?.[0] as Record<string, unknown>;

		expect(firstPart.inline_data).toEqual({
			mime_type: "image/png",
			data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
		});
		expect(firstPart.media_resolution).toBeUndefined();
		expect(params.media_resolution).toBe("HIGH");
	});

	it("keeps model routing behavior when mediaResolution is present", async () => {
		vi.resetModules();
		process.env.GEMINI_API_KEY = "gemini-test-key";
		process.env.GEMINI_MODEL = "gemini-3.1-pro-preview";
		process.env.GEMINI_MODEL_FAST = "gemini-3-flash-preview";
		process.env.GEMINI_MODEL_STRONG = "gemini-3.1-pro-preview";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "0";

		const geminiProvider = await import(
			"../services/mcp-server/src/providers/gemini-provider.js"
		);
		const completeSpy = vi
			.spyOn(geminiProvider, "completeWithGemini")
			.mockResolvedValue("route-ok");
		vi.spyOn(geminiProvider, "listGeminiModels").mockResolvedValue({
			provider: "gemini",
			models: [],
		});
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		const text = await aiClient.aiChatComplete({
			prompt: "Route with media input.",
			routeKey: "fast",
			mediaResolution: "high",
		});

		expect(text).toBe("route-ok");
		expect(completeSpy).toHaveBeenCalledTimes(1);
		const [input, resolution] = completeSpy.mock.calls[0] as [
			Record<string, unknown>,
			Record<string, unknown>,
		];
		expect(input.mediaResolution).toBe("high");
		expect(resolution.resolvedModel).toBe("gemini-3-flash-preview");
	});

	it("auto-injects high media resolution for UI workflow context", async () => {
		process.env.GEMINI_API_KEY = "gemini-test-key";

		const { provider, calls } = await loadProviderWithBridgeMock();

		await provider.completeWithGemini(
			{
				prompt: "Refine UI spacing and hierarchy.",
				policyConfig: {
					uiWorkflow: true,
				},
			},
			RESOLUTION,
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.media_resolution).toBe("HIGH");
	});
});
