import { describe, expect, it } from "vitest";

import { GET } from "../apps/web/app/api/social-preview/route";
import {
	buildSocialPreviewResponse,
	SOCIAL_PREVIEW_CACHE_CONTROL,
} from "../apps/web/lib/social-preview";

describe("social preview route", () => {
	it("returns the tracked PNG asset with cache headers", async () => {
		const response = await GET();
		const body = new Uint8Array(await response.arrayBuffer());

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("image/png");
		expect(response.headers.get("cache-control")).toBe(
			SOCIAL_PREVIEW_CACHE_CONTROL,
		);
		expect(body.byteLength).toBeGreaterThan(0);
	});

	it("returns 404 when the social preview asset is missing", async () => {
		const response = await buildSocialPreviewResponse({
			assetPath: "/missing/social-preview.png",
			readFile: async () => {
				const error = new Error("missing");
				Object.assign(error, { code: "ENOENT" });
				throw error;
			},
		});

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not found");
	});

	it("returns 500 for unexpected read failures", async () => {
		const response = await buildSocialPreviewResponse({
			assetPath: "/broken/social-preview.png",
			readFile: async () => {
				throw new Error("boom");
			},
		});

		expect(response.status).toBe(500);
		expect(await response.text()).toBe("Internal Server Error");
	});
});
