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

function restoreEnv(): void {
	for (const key of ENV_KEYS) {
		const value = originalEnv.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
}

function mockLogger(): void {
	vi.doMock("../services/mcp-server/src/logger.js", () => ({
		logDebug: vi.fn(),
		logInfo: vi.fn(),
		logWarn: vi.fn(),
		logError: vi.fn(),
	}));
}

afterEach(() => {
	restoreEnv();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ai-client low-core branches", () => {
	it("retries network-like failures without status when no abort signal is provided", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.GEMINI_MODEL_STRONG = "gemini-strong";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "1";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		mockLogger();
		const completeWithGemini = vi
			.fn(async () => "ok")
			.mockRejectedValueOnce(new Error("network timeout while fetching"));
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const result = await aiClient.aiChatComplete({
			prompt: "retry me",
			routeKey: "strong",
		});

		expect(result).toBe("ok");
		expect(completeWithGemini).toHaveBeenCalledTimes(2);
	});

	it("does not retry AbortError and wraps non-retriable failure context", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.OPENUI_MODEL_ROUTING = "off";
		process.env.OPENUI_MAX_RETRIES = "2";
		process.env.OPENUI_RETRY_BASE_MS = "1";

		mockLogger();
		const abortLike = Object.assign(new Error("provider aborted"), {
			name: "AbortError",
			statusCode: 400,
		});
		const completeWithGemini = vi
			.fn(async () => "unused")
			.mockRejectedValue(abortLike);
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini,
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		await expect(
			aiClient.aiChatComplete({
				prompt: "abort-like",
			}),
		).rejects.toThrow(/requestId=.*attempt=1\/3, status=400/);
		expect(completeWithGemini).toHaveBeenCalledTimes(1);
	});

	it("extractStatus handles non-object details and undefined status fields", async () => {
		mockLogger();
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: vi.fn(async () => "ok"),
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));
		const aiClient = await import("../services/mcp-server/src/ai-client.js");

		expect(aiClient.extractStatus({ details: "text-details" })).toBeUndefined();
		expect(aiClient.extractStatus({ status: "NaN" })).toBeUndefined();
		expect(
			aiClient.extractStatus({ statusCode: "not-number" }),
		).toBeUndefined();
	});

	it("keeps Error instances when list models fails with Error object", async () => {
		mockLogger();
		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: vi.fn(async () => "ok"),
			listGeminiModels: vi.fn(async () => {
				throw new Error("upstream model list failed");
			}),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		await expect(aiClient.aiListModels(5)).rejects.toThrow(
			"upstream model list failed",
		);
	});
});
