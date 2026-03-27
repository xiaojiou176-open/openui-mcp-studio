import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPinnedSourceCheck } from "../tooling/check-pinned-sources.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("pinned source governance", () => {
	it("fails on floating :latest references", async () => {
		const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openui-pinned-"));
		try {
			await writeJson(path.join(rootDir, ".github", "ci-image.lock.json"), {
				version: 1,
				imageRepo: "ghcr.io/example/repo",
				digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
				bootstrap: { dockerfile: ".devcontainer/Dockerfile", context: "." },
			});
			await writeFile(
				path.join(rootDir, ".github", "workflows", "ci.yml"),
				"jobs:\n  test:\n    steps:\n      - run: docker pull ghcr.io/example/repo:latest\n",
			);
			await writeFile(
				path.join(rootDir, ".github", "actions", "sample", "action.yml"),
				"name: test\nruns:\n  using: composite\n  steps:\n    - run: echo ok\n",
			);
			await writeFile(
				path.join(rootDir, "ops", "ci-container", "run-in-container.sh"),
				"echo ok\n",
			);

			const result = await runPinnedSourceCheck({ rootDir });
			expect(result.ok).toBe(false);
			expect(result.errors[0]).toContain("floating source reference");
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
