import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalRunId = process.env.OPENUI_RUNTIME_RUN_ID;
const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	if (originalRunId === undefined) {
		delete process.env.OPENUI_RUNTIME_RUN_ID;
	} else {
		process.env.OPENUI_RUNTIME_RUN_ID = originalRunId;
	}
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship artifact writer guards", () => {
	it("returns undefined for writes when the resolved run root escapes the workspace", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-artifacts-guard-");
		process.env.OPENUI_RUNTIME_RUN_ID = "guarded-run";

		vi.doMock("../packages/runtime-observability/src/run-context.js", () => ({
			resolveRuntimeRunId: () => "guarded-run",
			resolveRuntimeRunRoot: () =>
				path.join(os.tmpdir(), "openui-outside-run-root"),
		}));

		const { readRunArtifactText, writeRunArtifactJson, writeRunArtifactText } =
			await import("../services/mcp-server/src/ship/artifacts.js");

		await expect(
			writeRunArtifactJson({
				workspaceRoot,
				name: "review-bundle",
				payload: { ok: true },
			}),
		).resolves.toBeUndefined();
		await expect(
			writeRunArtifactText({
				workspaceRoot,
				name: "review-bundle",
				text: "# blocked\n",
			}),
		).resolves.toBeUndefined();
		await expect(
			readRunArtifactText({
				workspaceRoot,
				name: "missing-artifact",
			}),
		).resolves.toBeNull();
	});
});
