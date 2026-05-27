import { describe, expect, it } from "vitest";
import { MultimodalInputSchema } from "../services/mcp-server/src/tools/computer-use.js";

describe("multimodal input schema", () => {
	it("accepts text plus image attachments", () => {
		const parsed = MultimodalInputSchema.parse({
			text: "Review this screenshot and summarize UI issues.",
			images: [{ mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAUA" }],
		});

		expect(parsed.text).toContain("Review this screenshot");
		expect(parsed.images).toHaveLength(1);
		expect(parsed.images[0]?.mimeType).toBe("image/png");
	});

	it("defaults images to empty array", () => {
		const parsed = MultimodalInputSchema.parse({
			text: "No image input this turn.",
		});

		expect(parsed.images).toEqual([]);
	});

	it("rejects empty text prompt", () => {
		const result = MultimodalInputSchema.safeParse({
			text: "",
			images: [],
		});

		expect(result.success).toBe(false);
	});
});
