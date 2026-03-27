import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/mcp-server/src/ai-client.js", () => ({
	aiChatComplete: vi.fn(),
	aiListModels: vi.fn(),
}));

afterEach(() => {
	vi.restoreAllMocks();
});

describe("openui-client", () => {
	it("forwards chat completion input and returns upstream response", async () => {
		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const module = await import("../services/mcp-server/src/openui-client.js");
		const completeSpy = vi
			.mocked(aiClient.aiChatComplete)
			.mockResolvedValue("ok");

		const input = {
			prompt: "build dashboard",
			model: "gemini-3.1-pro-preview",
			routeKey: "default",
		};
		await expect(module.openuiChatComplete(input)).resolves.toBe("ok");
		expect(completeSpy).toHaveBeenCalledWith(input);
	});

	it("uses default list-model limit and accepts custom limit", async () => {
		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const module = await import("../services/mcp-server/src/openui-client.js");
		const listSpy = vi
			.mocked(aiClient.aiListModels)
			.mockResolvedValue([{ name: "gemini-3" }]);

		await expect(module.openuiListModels()).resolves.toEqual([
			{ name: "gemini-3" },
		]);
		await expect(module.openuiListModels(5)).resolves.toEqual([
			{ name: "gemini-3" },
		]);

		expect(listSpy).toHaveBeenNthCalledWith(1, 120);
		expect(listSpy).toHaveBeenNthCalledWith(2, 5);
	});

	it("propagates upstream list-model errors", async () => {
		const aiClient = await import("../services/mcp-server/src/ai-client.js");
		const module = await import("../services/mcp-server/src/openui-client.js");

		vi.mocked(aiClient.aiListModels).mockRejectedValue(
			new Error("provider unavailable"),
		);

		await expect(module.openuiListModels()).rejects.toThrow(
			"provider unavailable",
		);
	});
});
