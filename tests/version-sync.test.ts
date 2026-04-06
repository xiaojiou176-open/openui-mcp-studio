import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MCP_SERVER_VERSION } from "../services/mcp-server/src/constants.js";

describe("version sync", () => {
	it("keeps package version aligned with MCP server version", async () => {
		const raw = await fs.readFile(
			new URL("../package.json", import.meta.url),
			"utf8",
		);
		const packageJson = JSON.parse(raw) as { version?: string };
		expect(packageJson.version).toBe(MCP_SERVER_VERSION);
	});
});
