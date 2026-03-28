import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ci container portability", () => {
	it("avoids sha256sum-only hashing so macOS hosts can compute the runtime marker", async () => {
		const scriptPath = path.resolve(
			import.meta.dirname,
			"..",
			"ops",
			"ci-container",
			"run-in-container.sh",
		);
		const content = await fs.readFile(scriptPath, "utf8");
		expect(content).not.toContain("sha256sum");
		expect(content).toContain("compute_sha256_file");
		expect(content).toContain('crypto.createHash("sha256")');
	});
});
