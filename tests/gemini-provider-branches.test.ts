import { afterEach, describe, expect, it, vi } from "vitest";

type BridgeCall = {
	method: string;
	params: Record<string, unknown>;
};

const RESOLUTION = {
	routeKey: "strong" as const,
	resolvedModel: "gemini-2.5-pro",
	source: "route" as const,
	routingMode: "on" as const,
};
const ORIGINAL_GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function loadProviderWithBridgeMock(
	responder: (method: string) => unknown,
): Promise<{
	provider: typeof import("../services/mcp-server/src/providers/gemini-provider.js");
	calls: BridgeCall[];
}> {
	process.env.GEMINI_API_KEY = "test-gemini-api-key"; // pragma: allowlist secret
	const calls: BridgeCall[] = [];

	class GeminiPythonSidecarBridgeMock {
		public async request(
			method: string,
			params: Record<string, unknown>,
		): Promise<unknown> {
			calls.push({ method, params });
			return responder(method);
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

async function loadProviderWithBridgeAndLoggerMock(
	responder: (method: string) => unknown,
): Promise<{
	provider: typeof import("../services/mcp-server/src/providers/gemini-provider.js");
	calls: BridgeCall[];
	logErrorSpy: ReturnType<typeof vi.fn>;
}> {
	process.env.GEMINI_API_KEY = "test-gemini-api-key"; // pragma: allowlist secret
	const calls: BridgeCall[] = [];
	const logErrorSpy = vi.fn();

	class GeminiPythonSidecarBridgeMock {
		public async request(
			method: string,
			params: Record<string, unknown>,
		): Promise<unknown> {
			calls.push({ method, params });
			return responder(method);
		}

		public async stop(): Promise<void> {}
	}

	vi.doMock(
		"../services/mcp-server/src/providers/gemini-python-sidecar.js",
		() => ({
			GeminiPythonSidecarBridge: GeminiPythonSidecarBridgeMock,
		}),
	);
	vi.doMock("../services/mcp-server/src/logger.js", () => ({
		logDebug: vi.fn(),
		logError: logErrorSpy,
	}));

	const provider = await import(
		"../services/mcp-server/src/providers/gemini-provider.js"
	);
	return { provider, calls, logErrorSpy };
}

afterEach(async () => {
	if (ORIGINAL_GEMINI_API_KEY === undefined) {
		delete process.env.GEMINI_API_KEY;
	} else {
		process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_API_KEY;
	}
	vi.restoreAllMocks();
	const provider = await import(
		"../services/mcp-server/src/providers/gemini-provider.js"
	);
	await provider.resetGeminiProviderForTests();
	vi.resetModules();
});

describe("gemini provider branch coverage", () => {
	it("validates functionResponses input types and trims/normalizes values", async () => {
		const { provider, calls } = await loadProviderWithBridgeMock(() => ({
			text: "ok",
			function_calls: [],
			safety_decisions: [],
		}));

		await expect(
			provider.completeWithGemini(
				{
					prompt: "bad payload",
					functionResponses: {} as unknown as Array<Record<string, unknown>>,
				},
				RESOLUTION,
			),
		).rejects.toThrow("functionResponses must be an array when provided.");

		await expect(
			provider.completeWithGemini(
				{
					prompt: "bad payload",
					functionResponses: [1 as unknown as Record<string, unknown>],
				},
				RESOLUTION,
			),
		).rejects.toThrow("functionResponses[0] must be an object.");

		await expect(
			provider.completeWithGemini(
				{
					prompt: "bad payload",
					functionResponses: [
						{
							name: "tool_call",
							response: "not-object",
						} as unknown as Record<string, unknown>,
					],
				},
				RESOLUTION,
			),
		).rejects.toThrow("functionResponses[0].response must be an object.");

		await expect(
			provider.completeWithGemini(
				{
					prompt: "bad payload",
					functionResponses: [
						{
							name: "tool_call",
							response: {},
							thought_signature: "   ",
						},
					],
				},
				RESOLUTION,
			),
		).rejects.toThrow(
			"functionResponses[0].thought_signature must be a non-empty string.",
		);

		const circular: Record<string, unknown> = {};
		circular.self = circular;
		await provider.completeWithGemini(
			{
				prompt: "normalize circular response signature",
				functionResponses: [
					{
						name: "  circular_lookup  ",
						response: circular,
					},
				],
			},
			RESOLUTION,
		);

		const forwarded = calls.at(-1)?.params.function_responses as Array<
			Record<string, unknown>
		>;
		expect(forwarded[0]?.name).toBe("circular_lookup");
		expect(String(forwarded[0]?.thought_signature)).toMatch(/^legacy_/);
	});

	it("normalizes result arrays and preserves prompt fallback content shape", async () => {
		const { provider, calls } = await loadProviderWithBridgeMock(() => ({
			text: "ok",
			function_calls: "invalid-shape",
			safety_decisions: null,
		}));

		const first = await provider.completeWithGeminiResult(
			{
				prompt: "   ",
				mediaResolution: "high",
			},
			RESOLUTION,
		);
		expect(first.text).toBe("ok");
		expect(first.function_calls).toEqual([]);
		expect(first.safety_decisions).toEqual([]);
		expect(calls[0]?.params.contents).toBe("   ");
		expect(calls[0]?.params.media_resolution).toBe("HIGH");

		await provider.completeWithGeminiResult(
			{
				prompt: "",
				inputParts: [{ type: "text", text: "inline text part" }],
			},
			RESOLUTION,
		);
		expect(calls[1]?.params.contents).toEqual([
			{ role: "user", parts: [{ text: "inline text part" }] },
		]);
	});

	it("returns valid embeddings and wraps non-Error embed failures", async () => {
		let embedCallCount = 0;
		const { provider } = await loadProviderWithBridgeMock((method) => {
			if (method !== "embed_content") {
				return {
					text: "ok",
					function_calls: [],
					safety_decisions: [],
				};
			}

			embedCallCount += 1;
			if (embedCallCount === 1) {
				return { embeddings: [[0.1, 0.2]] };
			}

			return {
				get embeddings() {
					throw "getter-failed";
				},
			};
		});

		await expect(
			provider.embedWithGemini({
				contents: "valid embedding",
				model: "gemini-embed",
			}),
		).resolves.toEqual([[0.1, 0.2]]);

		await expect(
			provider.embedWithGemini({
				contents: "getter throws",
				model: "gemini-embed",
			}),
		).rejects.toMatchObject({
			errorCode: "GEMINI_EMBED_INVALID_RESPONSE",
			message: expect.stringContaining("getter-failed"),
		});
	});

	it("resetGeminiProviderForTests is a no-op when bridge is not initialized", async () => {
		const { provider } = await loadProviderWithBridgeMock(() => ({
			text: "ok",
			function_calls: [],
			safety_decisions: [],
		}));
		await expect(
			provider.resetGeminiProviderForTests(),
		).resolves.toBeUndefined();
	});

	it("throws on empty text + no function calls", async () => {
		const { provider } = await loadProviderWithBridgeMock(() => ({
			text: "   ",
			function_calls: [],
			safety_decisions: [],
		}));

		await expect(
			provider.completeWithGemini({ prompt: "hello" }, RESOLUTION),
		).rejects.toThrow("Gemini returned empty text content.");
	});

	it("normalizes and validates functionResponses", async () => {
		const { provider, calls } = await loadProviderWithBridgeMock(() => ({
			text: "ok",
			function_calls: [],
			safety_decisions: [],
		}));

		await provider.completeWithGemini(
			{
				prompt: "Use tool results",
				functionResponses: [
					{
						name: "  lookup_user  ",
						response: { id: "u-1" },
					},
				],
			},
			RESOLUTION,
		);

		const forwarded = calls[0]?.params.function_responses as Array<
			Record<string, unknown>
		>;
		expect(forwarded).toHaveLength(1);
		expect(forwarded[0]?.name).toBe("lookup_user");
		expect(String(forwarded[0]?.thought_signature)).toMatch(/^legacy_/);

		await expect(
			provider.completeWithGemini(
				{
					prompt: "bad function responses",
					functionResponses: [{ name: "", response: {} }],
				},
				RESOLUTION,
			),
		).rejects.toThrow("functionResponses[0].name must be a non-empty string.");
	});

	it("logs and rethrows when generate_content request fails", async () => {
		const bridgeError = new Error("bridge offline");
		const { provider, calls, logErrorSpy } =
			await loadProviderWithBridgeAndLoggerMock(() => {
				throw bridgeError;
			});

		await expect(
			provider.completeWithGeminiResult(
				{
					prompt: "hello",
					requestId: "req-123",
				},
				RESOLUTION,
			),
		).rejects.toBe(bridgeError);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("generate_content");
		expect(logErrorSpy).toHaveBeenCalledTimes(1);
		expect(logErrorSpy).toHaveBeenCalledWith(
			"gemini_generate_content_failed",
			expect.objectContaining({
				requestId: "req-123",
				traceId: "req-123",
				stage: "provider_request",
				provider: "gemini",
				context: { model: RESOLUTION.resolvedModel },
				error: "bridge offline",
			}),
		);
	});

	it("logs and rethrows when list_models request fails", async () => {
		const bridgeError = new Error("list failed");
		const { provider, calls, logErrorSpy } =
			await loadProviderWithBridgeAndLoggerMock((method) => {
				if (method === "list_models") {
					throw bridgeError;
				}
				return {
					text: "ok",
					function_calls: [],
					safety_decisions: [],
				};
			});

		await expect(provider.listGeminiModels(500)).rejects.toBe(bridgeError);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("list_models");
		expect(calls[0]?.params.limit).toBe(200);
		expect(logErrorSpy).toHaveBeenCalledTimes(1);
		expect(logErrorSpy).toHaveBeenCalledWith(
			"gemini_list_models_failed",
			expect.objectContaining({
				traceId: expect.stringMatching(/^gemini_list_models_/),
				stage: "provider_request",
				provider: "gemini",
				context: { limit: 200 },
				error: "list failed",
			}),
		);
	});

	it("logs and rethrows when embed_content request fails", async () => {
		const bridgeError = new Error("embed failed");
		const { provider, calls, logErrorSpy } =
			await loadProviderWithBridgeAndLoggerMock((method) => {
				if (method === "embed_content") {
					throw bridgeError;
				}
				return {
					text: "ok",
					function_calls: [],
					safety_decisions: [],
				};
			});

		await expect(
			provider.embedWithGemini({
				contents: "hello",
				model: "gemini-embed",
				outputDimensionality: 256,
			}),
		).rejects.toBe(bridgeError);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("embed_content");
		expect(logErrorSpy).toHaveBeenCalledTimes(1);
		expect(logErrorSpy).toHaveBeenCalledWith(
			"gemini_embed_failed",
			expect.objectContaining({
				traceId: expect.stringMatching(/^gemini_embed_/),
				stage: "provider_request",
				provider: "gemini",
				context: {
					model: "gemini-embed",
					outputDimensionality: 256,
				},
				error: "embed failed",
			}),
		);
	});

	it("logs and rethrows when computer_use_step request fails", async () => {
		const bridgeError = new Error("computer use failed");
		const { provider, calls, logErrorSpy } =
			await loadProviderWithBridgeAndLoggerMock((method) => {
				if (method === "computer_use_step") {
					throw bridgeError;
				}
				return {
					text: "ok",
					function_calls: [],
					safety_decisions: [],
				};
			});

		await expect(
			provider.computerUseStepWithGemini({
				model: "gemini-2.5-pro",
				contents: [{ role: "user", parts: [{ text: "do step" }] }],
			}),
		).rejects.toBe(bridgeError);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.method).toBe("computer_use_step");
		expect(logErrorSpy).toHaveBeenCalledTimes(1);
		expect(logErrorSpy).toHaveBeenCalledWith(
			"gemini_computer_use_step_failed",
			expect.objectContaining({
				traceId: expect.stringMatching(/^gemini_computer_use_/),
				stage: "provider_request",
				provider: "gemini",
				context: { model: "gemini-2.5-pro" },
				error: "computer use failed",
			}),
		);
	});

	it("drops non-object responseJsonSchema payloads before provider call", async () => {
		const { provider, calls } = await loadProviderWithBridgeMock(() => ({
			text: "ok",
			function_calls: [],
			safety_decisions: [],
		}));

		await provider.completeWithGemini(
			{
				prompt: "Return structured data",
				responseJsonSchema: [] as unknown as Record<string, unknown>,
			},
			RESOLUTION,
		);
		expect(calls[0]?.params.response_json_schema).toBeUndefined();

		await provider.completeWithGemini(
			{
				prompt: "Return structured data",
				responseJsonSchema: {
					type: "object",
					properties: {
						ok: { type: "boolean" },
					},
				},
			},
			RESOLUTION,
		);
		expect(calls[1]?.params.response_json_schema).toEqual({
			type: "object",
			properties: {
				ok: { type: "boolean" },
			},
		});
	});

	it("disables auto media/cache policy and surfaces embed invalid response", async () => {
		const { provider, calls } = await loadProviderWithBridgeMock((method) => {
			if (method === "list_models") {
				return { models: ["z", "a", "a", "", 1] };
			}
			if (method === "embed_content") {
				return { embeddings: "invalid" };
			}
			return {
				text: "ok",
				function_calls: [],
				safety_decisions: [],
			};
		});

		await provider.completeWithGemini(
			{
				prompt: "x".repeat(5000),
				policyConfig: {
					autoContextCaching: false,
					autoMediaResolution: false,
					autoIncludeThoughts: false,
				},
				inputParts: [
					{
						type: "image",
						mimeType: "image/png",
						data: "abc",
					},
				],
			},
			RESOLUTION,
		);

		const generateParams = calls[0]?.params;
		expect(generateParams.cached_content).toBeUndefined();
		expect(generateParams.cache_ttl_seconds).toBeUndefined();
		expect(generateParams.media_resolution).toBeUndefined();
		expect(generateParams.include_thoughts).toBeUndefined();

		const models = await provider.listGeminiModels(999);
		expect(models.models).toEqual(["a", "z"]);
		const listCall = calls.find((call) => call.method === "list_models");
		expect(listCall?.params.limit).toBe(200);

		await expect(
			provider.embedWithGemini({
				contents: "hi",
				model: "gemini-embed",
				outputDimensionality: 8,
			}),
		).rejects.toMatchObject({
			errorCode: "GEMINI_EMBED_INVALID_RESPONSE",
			message: expect.stringContaining("expected embeddings to be an array"),
		});
	});

	it("validates nested embeddings payload shape and dimension consistency", async () => {
		let embedCallCount = 0;
		const { provider } = await loadProviderWithBridgeMock((method) => {
			if (method === "embed_content") {
				embedCallCount += 1;
				if (embedCallCount === 1) {
					return {
						embeddings: [[0.1, 0.2], [0.3]],
					};
				}
				return {
					embeddings: [[0.1, Number.NaN]],
				};
			}
			return {
				text: "ok",
				function_calls: [],
				safety_decisions: [],
			};
		});

		await expect(
			provider.embedWithGemini({
				contents: "dimension mismatch",
				model: "gemini-embed",
			}),
		).rejects.toMatchObject({
			errorCode: "GEMINI_EMBED_INVALID_RESPONSE",
			message: expect.stringContaining(
				"expected consistent embedding dimensions",
			),
		});

		await expect(
			provider.embedWithGemini({
				contents: "non-finite payload",
				model: "gemini-embed",
			}),
		).rejects.toMatchObject({
			errorCode: "GEMINI_EMBED_INVALID_RESPONSE",
			message: expect.stringContaining("to be a finite number"),
		});
	});
});
