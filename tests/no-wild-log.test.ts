import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runNoWildLogCheck } from "../tooling/check-no-wild-log.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

describe("wild log governance", () => {
	it("fails when a .log file exists outside governed roots", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-wild-log-"));
		try {
			await writeFile(
				path.join(rootDir, ".gitignore"),
				".runtime-cache/\n",
			);
			await writeFile(path.join(rootDir, "tmp", "oops.log"), "bad\n");

			const result = await runNoWildLogCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors[0]).toContain("wild log file detected");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
