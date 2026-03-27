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
const ORIGINAL_OPENUI_TIMEOUT_MS = process.env.OPENUI_TIMEOUT_MS;

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

	vi.doMock("../services/mcp-server/src/providers/gemini-python-sidecar.js", () => ({
		GeminiPythonSidecarBridge: GeminiPythonSidecarBridgeMock,
	}));

	const provider = await import("../services/mcp-server/src/providers/gemini-provider.js");
	return { provider, calls };
}

afterEach(async () => {
	if (ORIGINAL_GEMINI_API_KEY === undefined) {
		delete process.env.GEMINI_API_KEY;
	} else {
		process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_API_KEY;
	}
	if (ORIGINAL_OPENUI_TIMEOUT_MS === undefined) {
		delete process.env.OPENUI_TIMEOUT_MS;
	} else {
		process.env.OPENUI_TIMEOUT_MS = ORIGINAL_OPENUI_TIMEOUT_MS;
	}
	vi.restoreAllMocks();
	const provider = await import("../services/mcp-server/src/providers/gemini-provider.js");
	await provider.resetGeminiProviderForTests();
	vi.resetModules();
});

describe("gemini provider missing branches", () => {
	it("reuses cached bridge between provider calls", async () => {
		let constructorCount = 0;
		const calls: BridgeCall[] = [];

		process.env.GEMINI_API_KEY = "test-gemini-api-key"; // pragma: allowlist secret

		class GeminiPythonSidecarBridgeMock {
			public constructor() {
				constructorCount += 1;
			}

			public async request(
				method: string,
				params: Record<string, unknown>,
			): Promise<unknown> {
				calls.push({ method, params });
				return {
					text: "ok",
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
		await provider.completeWithGemini({ prompt: "first call" }, RESOLUTION);
		await provider.completeWithGemini({ prompt: "second call" }, RESOLUTION);

		expect(calls).toHaveLength(2);
		expect(constructorCount).toBe(1);
	});

	it("caps sidecar startup timeout at 15000ms when request timeout is larger", async () => {
		process.env.GEMINI_API_KEY = "test-gemini-api-key"; // pragma: allowlist secret
		process.env.OPENUI_TIMEOUT_MS = "90000";
		const constructorArgs: Array<Record<string, unknown>> = [];

		class GeminiPythonSidecarBridgeMock {
			public constructor(options: Record<string, unknown>) {
				constructorArgs.push(options);
			}

			public async request(): Promise<unknown> {
				return {
					text: "ok",
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
		await provider.completeWithGemini(
			{ prompt: "startup timeout cap" },
			RESOLUTION,
		);

		expect(constructorArgs[0]?.requestTimeoutMs).toBe(90_000);
		expect(constructorArgs[0]?.startupTimeoutMs).toBe(30_000);
		delete process.env.OPENUI_TIMEOUT_MS;
	});

	it("handles media resolution with non-text input parts lacking per-part mediaResolution", async () => {
		const { provider, calls } = await loadProviderWithBridgeMock(() => ({
			text: "ok",
			function_calls: [],
			safety_decisions: [],
		}));

		await expect(
			provider.completeWithGemini(
				{
					prompt: "Analyze this image.",
					mediaResolution: "high",
					inputParts: [
						{
							type: "image",
							mimeType: "image/png",
							data: "abcd",
						},
					],
				},
				RESOLUTION,
			),
		).resolves.toBe("ok");

		expect(calls).toHaveLength(1);
		expect(calls[0]?.params.media_resolution).toBe("HIGH");
	});

	it("normalizes non-string sidecar text to empty string in detailed response", async () => {
		const { provider } = await loadProviderWithBridgeMock(() => ({
			text: 123,
			function_calls: [{ name: "lookup_weather" }],
			safety_decisions: [],
		}));

		await expect(
			provider.completeWithGeminiResult(
				{
					prompt: "Return tool call only.",
				},
				RESOLUTION,
			),
		).resolves.toMatchObject({
			text: "",
			function_calls: [{ name: "lookup_weather" }],
			safety_decisions: [],
		});
	});

	it("rejects embeddings payload when an embedding row is not an array", async () => {
		const { provider } = await loadProviderWithBridgeMock((method) => {
			if (method === "embed_content") {
				return { embeddings: [123] };
			}
			return {
				text: "ok",
				function_calls: [],
				safety_decisions: [],
			};
		});

		await expect(
			provider.embedWithGemini({
				contents: "bad embeddings shape",
				model: "gemini-embed",
			}),
		).rejects.toMatchObject({
			errorCode: "GEMINI_EMBED_INVALID_RESPONSE",
			message: expect.stringContaining("embeddings[0]"),
		});
	});

	it("returns empty model list when sidecar models field is not an array", async () => {
		const { provider } = await loadProviderWithBridgeMock((method) => {
			if (method === "list_models") {
				return { models: "bad-shape" };
			}
			return {
				text: "ok",
				function_calls: [],
				safety_decisions: [],
			};
		});

		await expect(provider.listGeminiModels()).resolves.toMatchObject({
			provider: "gemini",
			models: [],
		});
	});

	it("rethrows embed request errors when outputDimensionality is omitted", async () => {
		const embedError = new Error("embed request failed");
		const { provider } = await loadProviderWithBridgeMock((method) => {
			if (method === "embed_content") {
				throw embedError;
			}
			return {
				text: "ok",
				function_calls: [],
				safety_decisions: [],
			};
		});

		await expect(
			provider.embedWithGemini({
				contents: "input",
				model: "gemini-embed",
			}),
		).rejects.toBe(embedError);
	});
});
