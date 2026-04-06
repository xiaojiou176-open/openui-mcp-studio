import { describe, expect, it } from "vitest";

import manifest from "../apps/web/app/manifest";

describe("web manifest", () => {
	it("describes the front door as a builder-friendly MCP workflow", () => {
		const value = manifest();

		expect(value.name).toBe("OpenUI MCP Studio");
		expect(value.start_url).toBe("/");
		expect(value.description).toContain("Codex and Claude Code");
		expect(value.categories).toEqual(
			expect.arrayContaining(["developer", "productivity"]),
		);
		expect(value.shortcuts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					url: "/proof",
					description: expect.stringContaining("Proof desk"),
				}),
				expect.objectContaining({ url: "/llms.txt" }),
			]),
		);
		expect(
			value.shortcuts?.find((shortcut) => shortcut.url === "/workbench")
				?.description,
		).toContain("Operator desk");
	});
});
