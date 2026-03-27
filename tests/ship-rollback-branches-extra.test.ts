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

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship rollback extra branches", () => {
	it("removes generated files when rollback snapshot marks them as newly created", async () => {
		const root = await mkTempDir("openui-ship-rollback-extra-");
		const relativePath = "app/new-file.tsx";
		const absolutePath = path.join(root, relativePath);
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, "generated-content", "utf8");

		const ship = await import("../services/mcp-server/src/tools/ship.js");
		const result = await ship.__test__.rollbackWrittenFiles(
			root,
			[relativePath],
			new Map([
				[
					relativePath,
					{
						path: relativePath,
						existed: false,
					},
				],
			]),
			new Map([[relativePath, "generated-content"]]),
		);

		expect(result.rolledBack).toBe(true);
		expect(result.rollbackDetails).toEqual([
			{ path: relativePath, status: "removed" },
		]);
		await expect(fs.access(absolutePath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("serializes non-Error rollback failures with String(error)", async () => {
		const readWorkspaceFileIfExistsNoFollow = vi.fn(async () => "new-content");
		const writeWorkspaceFileNoFollow = vi.fn(async () => {
			throw "restore-string-failure";
		});

		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual =
				await vi.importActual<typeof import("../services/mcp-server/src/file-ops.js")>(
					"../services/mcp-server/src/file-ops.js",
				);
			return {
				...actual,
				readWorkspaceFileIfExistsNoFollow,
				writeWorkspaceFileNoFollow,
			};
		});

		const ship = await import("../services/mcp-server/src/tools/ship.js");
		const relativePath = "app/page.tsx";
		const result = await ship.__test__.rollbackWrittenFiles(
			"/tmp/openui-ship-rollback-extra",
			[relativePath],
			new Map([
				[
					relativePath,
					{
						path: relativePath,
						existed: true,
						previousContent: "old-content",
					},
				],
			]),
			new Map([[relativePath, "new-content"]]),
		);

		expect(result.rolledBack).toBe(false);
		expect(result.rollbackDetails).toEqual([
			{
				path: relativePath,
				status: "restore_failed",
				message: "restore-string-failure",
			},
		]);
		expect(readWorkspaceFileIfExistsNoFollow).toHaveBeenCalled();
		expect(writeWorkspaceFileNoFollow).toHaveBeenCalled();
	});
});
