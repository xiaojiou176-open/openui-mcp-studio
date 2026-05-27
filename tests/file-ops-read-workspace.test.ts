import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	readWorkspaceFileIfExistsNoFollow,
	removeWorkspaceFileIfExistsNoFollow,
	writeWorkspaceFileNoFollow,
} from "../services/mcp-server/src/file-ops.js";

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
});

describe("readWorkspaceFileIfExistsNoFollow", () => {
	it("returns file content when target file exists", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const filePath = path.join(root, "app/page.tsx");
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, "hello-world", "utf8");

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).resolves.toBe("hello-world");
	});

	it("returns null when targetRoot does not exist (ENOENT)", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const missingRoot = path.join(root, "missing-root");

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: missingRoot,
				filePath: "app/page.tsx",
			}),
		).resolves.toBeNull();
	});

	it("returns null when targetRoot resolves through a non-directory segment (ENOTDIR)", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const notDir = path.join(root, "not-a-dir");
		await fs.writeFile(notDir, "plain-file", "utf8");

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: path.join(notDir, "nested"),
				filePath: "app/page.tsx",
			}),
		).resolves.toBeNull();
	});

	it("rethrows non-ENOENT/ENOTDIR errors from targetRoot realpath", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const expectedError = Object.assign(new Error("permission denied"), {
			code: "EACCES",
		});
		const realpathSpy = vi
			.spyOn(fs, "realpath")
			.mockRejectedValueOnce(expectedError);

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toBe(expectedError);

		expect(realpathSpy).toHaveBeenCalled();
	});

	it("returns null when target file is missing under an existing root", async () => {
		const root = await mkTempDir("openui-file-ops-");

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/missing.tsx",
			}),
		).resolves.toBeNull();
	});

	it("returns null when target file lookup hits ENOTDIR", async () => {
		const root = await mkTempDir("openui-file-ops-");
		await fs.writeFile(path.join(root, "not-a-dir"), "plain-file", "utf8");

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "not-a-dir/child.tsx",
			}),
		).resolves.toBeNull();
	});

	it("rejects symlink file targets", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const outside = await mkTempDir("openui-file-ops-outside-");
		const outsideFile = path.join(outside, "outside.tsx");
		await fs.mkdir(path.join(root, "app"), { recursive: true });
		await fs.writeFile(outsideFile, "outside", "utf8");
		await fs.symlink(outsideFile, path.join(root, "app/page.tsx"));

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toThrow(/Symlink targets are not allowed/i);
	});

	it("rejects non-file entries", async () => {
		const root = await mkTempDir("openui-file-ops-");
		await fs.mkdir(path.join(root, "app/dir-entry"), { recursive: true });

		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/dir-entry",
			}),
		).rejects.toThrow(/Expected file path but found non-file entry/i);
	});

	it("rejects absolute file paths", async () => {
		const root = await mkTempDir("openui-file-ops-");
		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "/tmp/absolute.tsx",
			}),
		).rejects.toThrow(/File path must be relative/i);
	});

	it("rejects path traversal segments", async () => {
		const root = await mkTempDir("openui-file-ops-");
		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/../escape.tsx",
			}),
		).rejects.toThrow(/Path traversal is not allowed/i);
	});

	it("rejects Windows drive prefixes in file paths", async () => {
		const root = await mkTempDir("openui-file-ops-");
		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "C:/windows/path.tsx",
			}),
		).rejects.toThrow(/Windows drive prefixes are not allowed/i);
	});
});

describe("write/remove workspace file helpers", () => {
	it("writes file content and removes it with no-follow safeguards", async () => {
		const root = await mkTempDir("openui-file-ops-");

		await writeWorkspaceFileNoFollow({
			targetRoot: root,
			filePath: "app/page.tsx",
			content: "export default function Page() { return null; }",
		});
		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).resolves.toBe("export default function Page() { return null; }");

		await removeWorkspaceFileIfExistsNoFollow({
			targetRoot: root,
			filePath: "app/page.tsx",
		});
		await expect(
			readWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).resolves.toBeNull();
	});

	it("removeWorkspaceFileIfExistsNoFollow is a no-op for missing file", async () => {
		const root = await mkTempDir("openui-file-ops-");
		await expect(
			removeWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/missing.tsx",
			}),
		).resolves.toBeUndefined();
	});

	it("removeWorkspaceFileIfExistsNoFollow rethrows non-ENOENT lstat failures", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const expectedError = Object.assign(new Error("permission denied"), {
			code: "EACCES",
		});
		const lstatSpy = vi.spyOn(fs, "lstat").mockRejectedValue(expectedError);

		await expect(
			removeWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toBe(expectedError);

		expect(lstatSpy).toHaveBeenCalled();
	});

	it("removeWorkspaceFileIfExistsNoFollow rejects symlink file targets", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const outside = await mkTempDir("openui-file-ops-outside-");
		const outsideFile = path.join(outside, "outside.tsx");
		await fs.mkdir(path.join(root, "app"), { recursive: true });
		await fs.writeFile(outsideFile, "outside", "utf8");
		await fs.symlink(outsideFile, path.join(root, "app/page.tsx"));

		await expect(
			removeWorkspaceFileIfExistsNoFollow({
				targetRoot: root,
				filePath: "app/page.tsx",
			}),
		).rejects.toThrow(/Refusing to remove symlink during rollback/i);
	});

	it("writeWorkspaceFileNoFollow rejects parent directories escaping workspace root", async () => {
		const root = await mkTempDir("openui-file-ops-");
		const outside = await mkTempDir("openui-file-ops-outside-");
		await fs.mkdir(path.join(root, "safe"), { recursive: true });
		await fs.symlink(outside, path.join(root, "safe", "jump"));

		await expect(
			writeWorkspaceFileNoFollow({
				targetRoot: root,
				filePath: "safe/jump/page.tsx",
				content: "export default function Page() { return null; }",
			}),
		).rejects.toThrow(/Parent directory escapes workspace root/i);
	});
});
