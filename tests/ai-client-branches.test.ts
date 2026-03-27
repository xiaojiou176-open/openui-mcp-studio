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

describe("ai-client branch coverage", () => {
	it("extractStatus reads statusCode and nested sidecar status", async () => {
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: vi.fn(async () => "ok"),
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		expect(aiClient.extractStatus({ statusCode: 429 })).toBe(429);
		expect(
			aiClient.extractStatus({
				details: { rpcError: { data: { status: 503 } } },
			}),
		).toBe(503);
		expect(aiClient.extractStatus({ details: { status: 418 } })).toBe(418);
		expect(aiClient.extractStatus("not-an-object")).toBeUndefined();
	});

	it("rejects mixed route selectors before provider invocation", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "0";

		const completeWithGemini = vi.fn(async () => "unused");
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		await expect(
			aiClient.aiChatComplete({
				prompt: "hello",
				routeKey: "strong",
				useFast: true,
			}),
		).rejects.toThrow("routeKey and useFast cannot be used together");
		expect(completeWithGemini).not.toHaveBeenCalled();
	});

	it("fails fast when abort signal is already aborted", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "1";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const completeWithGemini = vi.fn(async () => "unused");
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		const controller = new AbortController();
		controller.abort();

		await expect(
			aiClient.aiChatComplete({
				prompt: "abort",
				routeKey: "strong",
				abortSignal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(completeWithGemini).not.toHaveBeenCalled();
	});

	it("propagates abort during retry backoff sleep", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		const controller = new AbortController();
		const completeWithGemini = vi
			.fn(async () => "unused")
			.mockImplementationOnce(async () => {
				controller.abort();
				throw Object.assign(new Error("503 service unavailable"), {
					status: 503,
				});
			});

		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		await expect(
			aiClient.aiChatComplete({
				prompt: "retry-then-abort",
				routeKey: "strong",
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(completeWithGemini).toHaveBeenCalledTimes(1);
	});

	it("wraps non-Error failures from model listing", async () => {
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: vi.fn(async () => "ok"),
			listGeminiModels: vi.fn(async () => {
				throw "model-list-unavailable";
			}),
		}));
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		await expect(aiClient.aiListModels(3)).rejects.toThrow(
			"model-list-unavailable",
		);
	});
});
