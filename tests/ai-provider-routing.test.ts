import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
	"GEMINI_MODEL",
	"GEMINI_MODEL_FAST",
	"GEMINI_MODEL_STRONG",
	"OPENUI_MODEL_ROUTING",
	"OPENUI_MAX_RETRIES",
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

describe("ai provider routing", () => {
	it("uses fast and strong gemini models based on route key", async () => {
		process.env.GEMINI_MODEL = "gemini-default";
		process.env.GEMINI_MODEL_FAST = "gemini-fast";
		process.env.GEMINI_MODEL_STRONG = "gemini-strong";
		process.env.OPENUI_MODEL_ROUTING = "on";
		process.env.OPENUI_MAX_RETRIES = "0";

		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: vi.fn(async () => "ok"),
			listGeminiModels: vi.fn(async () => ({ provider: "gemini", models: [] })),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		const completeSpy = vi.mocked(geminiProvider.completeWithGemini);

		await aiClient.aiChatComplete({ prompt: "fast", routeKey: "fast" });
		await aiClient.aiChatComplete({ prompt: "strong", routeKey: "strong" });

		expect(completeSpy).toHaveBeenCalledTimes(2);
		expect(completeSpy.mock.calls[0]?.[1]?.resolvedModel).toBe("gemini-fast");
		expect(completeSpy.mock.calls[1]?.[1]?.resolvedModel).toBe("gemini-strong");
	});

	it("lists models from Gemini only", async () => {
		process.env.GEMINI_MODEL = "gemini-default";

		vi.doMock("../services/mcp-server/src/providers/gemini-provider.js", () => ({
			completeWithGemini: vi.fn(async () => "ok"),
			listGeminiModels: vi.fn(async () => ({
				provider: "gemini",
				models: ["gemini-2.5-flash"],
			})),
		}));

		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");

		const result = await aiClient.aiListModels(50);

		expect(vi.mocked(geminiProvider.listGeminiModels)).toHaveBeenCalledWith(50);
		expect(result).toEqual({
			primary: {
				provider: "gemini",
				models: ["gemini-2.5-flash"],
			},
			notes: ["Gemini is the only runtime provider."],
		});
		expect(Object.hasOwn(result, "fallback")).toBe(false);
	});
});
