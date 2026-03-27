import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MAX_RETRIES",
	"OPENUI_RETRY_BASE_MS",
] as const;

const originalEnv = new Map<string, string | undefined>(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

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

describe("ai gemini retry policy", () => {
	it("retries retriable Gemini 5xx errors and succeeds without fallback provider", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const geminiError = Object.assign(new Error("temporary failure"), {
			status: 503,
		});
		const completeWithGemini = vi
			.fn(async () => "retry-ok")
			.mockRejectedValueOnce(geminiError);

		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");

		const result = await aiClient.aiChatComplete({
			prompt: "hello",
			routeKey: "strong",
		});

		expect(result).toBe("retry-ok");
		expect(vi.mocked(geminiProvider.completeWithGemini)).toHaveBeenCalledTimes(
			2,
		);
	});

	it("does not retry non-retriable Gemini 4xx config errors", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "3";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const geminiError = Object.assign(new Error("invalid argument"), {
			status: 400,
		});
		const completeWithGemini = vi
			.fn(async () => "unused")
			.mockRejectedValue(geminiError);

		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");

		await expect(
			aiClient.aiChatComplete({ prompt: "hello", routeKey: "strong" }),
		).rejects.toThrow("invalid argument");

		expect(vi.mocked(geminiProvider.completeWithGemini)).toHaveBeenCalledTimes(
			1,
		);
	});

	it("surfaces stable error semantics after retried network-like failures", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const completeWithGemini = vi
			.fn(async () => "unused")
			.mockRejectedValue(new Error("network timeout"));

		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");

		await expect(
			aiClient.aiChatComplete({
				prompt: "hello",
				routeKey: "strong",
				requestId: "net_fail_case",
			}),
		).rejects.toThrow(
			"Gemini request failed (requestId=net_fail_case, attempt=3/3): network timeout",
		);

		expect(vi.mocked(geminiProvider.completeWithGemini)).toHaveBeenCalledTimes(
			3,
		);
	});
});
