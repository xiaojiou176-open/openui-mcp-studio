import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function importFileOpsWithPathInsideMock(
	mockImpl: (root: string, target: string) => boolean,
): Promise<typeof import("../services/mcp-server/src/file-ops.js")> {
	vi.resetModules();
	vi.doMock("../packages/shared-runtime/src/path-utils.js", async () => {
		const actual = await vi.importActual<
			typeof import("../packages/shared-runtime/src/path-utils.js")
		>("../packages/shared-runtime/src/path-utils.js");
		return {
			...actual,
			isPathInsideRoot: vi.fn(mockImpl),
		};
	});
	return import("../services/mcp-server/src/file-ops.js");
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("file-ops guard branch extras", () => {
	it("rethrows non-ENOENT/ENOTDIR lstat errors while reading workspace files", async () => {
		const root = await mkTempDir("openui-file-ops-guard-");
		const expectedError = Object.assign(new Error("read denied"), {
			code: "EACCES",
		});
		vi.spyOn(fs, "lstat").mockRejectedValueOnce(expectedError);

		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		await expect(
			fileOps.readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toBe(expectedError);
	});

	it("rejects read when final no-follow check detects a workspace escape", async () => {
		const root = await mkTempDir("openui-file-ops-guard-");
		const absolutePath = path.join(root, "app/page.tsx");
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, "safe", "utf8");

		let callCount = 0;
		const fileOps = await importFileOpsWithPathInsideMock(() => {
			callCount += 1;
			return callCount === 1;
		});

		await expect(
			fileOps.readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toThrow(/outside workspace/i);
	});

	it("rejects write when post-mkdir no-follow check detects a workspace escape", async () => {
		const root = await mkTempDir("openui-file-ops-guard-");

		let callCount = 0;
		const fileOps = await importFileOpsWithPathInsideMock(() => {
			callCount += 1;
			return callCount <= 3;
		});

		await expect(
			fileOps.writeWorkspaceFileNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
				content: "export default function Page() { return null; }",
			}),
		).rejects.toThrow(/outside workspace/i);
	});

	it("rejects remove when no-follow check detects a workspace escape", async () => {
		const root = await mkTempDir("openui-file-ops-guard-");

		let callCount = 0;
		const fileOps = await importFileOpsWithPathInsideMock(() => {
			callCount += 1;
			return callCount === 1;
		});

		await expect(
			fileOps.removeWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toThrow(/outside workspace/i);
	});
});
