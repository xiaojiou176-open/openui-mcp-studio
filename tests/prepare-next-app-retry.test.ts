import { describe, expect, it } from "vitest";

import { shouldRetryPrepareBuild } from "../tooling/prepare-next-app.ts";

describe("prepare-next-app retry classifier", () => {
	it("retries on the observed build-finalization flake family", () => {
		expect(
			shouldRetryPrepareBuild(
				new Error(
					"next build --webpack failed with code 1.\nError: ENOENT: no such file or directory, open '/tmp/app/.next/server/pages-manifest.json'",
				),
			),
		).toBe(true);
		expect(
			shouldRetryPrepareBuild(
				new Error(
					"next build --webpack failed with code 143.\nError: ENOENT: no such file or directory, open '/tmp/app/.next/routes-manifest.json'",
				),
			),
		).toBe(true);
		expect(
			shouldRetryPrepareBuild(
				new Error(
					"next build --webpack failed with code 1.\nError: ENOENT: no such file or directory, open '/tmp/app/.next/prerender-manifest.json'",
				),
			),
		).toBe(true);
	});

	it("does not retry ordinary build failures", () => {
		expect(
			shouldRetryPrepareBuild(
				new Error("Module not found: Can't resolve './missing-component'"),
			),
		).toBe(false);
		expect(
			shouldRetryPrepareBuild(new Error("Type error in app/page.tsx")),
		).toBe(false);
	});
});
