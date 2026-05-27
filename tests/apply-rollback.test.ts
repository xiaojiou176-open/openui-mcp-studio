import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ApplyGeneratedFilesError,
	applyGeneratedFiles,
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

async function expectApplyRollbackError(
	input: Parameters<typeof applyGeneratedFiles>[0],
): Promise<ApplyGeneratedFilesError> {
	try {
		await applyGeneratedFiles(input);
	} catch (error) {
		expect(error).toBeInstanceOf(ApplyGeneratedFilesError);
		return error as ApplyGeneratedFilesError;
	}

	throw new Error("Expected applyGeneratedFiles to throw");
}

describe("applyGeneratedFiles rollback", () => {
	it("fails fast when files list is empty", async () => {
		const root = await mkTempDir("openui-apply-");
		await expect(
			applyGeneratedFiles({
				targetRoot: root,
				files: [],
			}),
		).rejects.toThrow(/files\[\] must not be empty/i);
	});

	it("fails fast when files input contains duplicate paths", async () => {
		const root = await mkTempDir("openui-apply-");
		await expect(
			applyGeneratedFiles({
				targetRoot: root,
				files: [
					{ path: "app/page.tsx", content: "first" },
					{ path: "app/page.tsx", content: "second" },
				],
			}),
		).rejects.toThrow(/duplicate file path/i);
		await expect(
			fs.access(path.join(root, "app/page.tsx")),
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("returns plan only in dry-run mode without writing files", async () => {
		const root = await mkTempDir("openui-apply-");
		const result = await applyGeneratedFiles({
			targetRoot: root,
			dryRun: true,
			files: [{ path: "app/page.tsx", content: "dry-run-content" }],
		});

		expect(result.dryRun).toBe(true);
		expect(result.plan).toEqual([{ path: "app/page.tsx", status: "create" }]);
		await expect(
			fs.access(path.join(root, "app/page.tsx")),
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("restores pre-existing file content and returns structured rollback details", async () => {
		const root = await mkTempDir("openui-apply-");

		await fs.mkdir(path.join(root, "app"), { recursive: true });
		await fs.writeFile(path.join(root, "app/page.tsx"), "old-content");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/page.tsx", content: "new-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(
			fs.readFile(path.join(root, "app/page.tsx"), "utf8"),
		).resolves.toBe("old-content");
		expect(error.applyResult.rolledBack).toBe(true);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/page.tsx",
				status: "restored",
			},
		]);
	});

	it("deletes newly created files when rollback is triggered", async () => {
		const root = await mkTempDir("openui-apply-");

		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/new-file.tsx", content: "new-file-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(
			fs.access(path.join(root, "app/new-file.tsx")),
		).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(error.applyResult.rolledBack).toBe(true);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/new-file.tsx",
				status: "removed",
			},
		]);
	});

	it("marks created files as removed when they already disappeared before rollback cleanup", async () => {
		const root = await mkTempDir("openui-apply-");
		const createdFilePath = path.join(root, "app/new-file.tsx");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const originalLstat = fs.lstat.bind(fs);
		const originalRm = fs.rm.bind(fs);
		let targetLstatCount = 0;

		vi.spyOn(fs, "lstat").mockImplementation(async (...args: unknown[]) => {
			const target = String(args[0]);
			if (target.endsWith(`${path.sep}app${path.sep}new-file.tsx`)) {
				targetLstatCount += 1;
				if (targetLstatCount >= 2) {
					await originalRm(createdFilePath, { force: true }).catch(
						() => undefined,
					);
					throw Object.assign(new Error("file disappeared"), {
						code: "ENOENT",
					});
				}
			}
			const [filePath] = args as [unknown];
			return originalLstat(filePath as Parameters<typeof fs.lstat>[0]);
		});

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/new-file.tsx", content: "new-file-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(fs.access(createdFilePath)).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(error.applyResult.rolledBack).toBe(true);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/new-file.tsx",
				status: "removed",
			},
		]);
	});

	it("does not rollback when rollbackOnError is false", async () => {
		const root = await mkTempDir("openui-apply-");

		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		await expect(
			applyGeneratedFiles({
				targetRoot: root,
				rollbackOnError: false,
				files: [
					{ path: "app/new-file.tsx", content: "new-file-content" },
					{
						path: "components/header.tsx",
						content: "export function Header(){return null}",
					},
				],
			}),
		).rejects.toThrow();

		await expect(
			fs.readFile(path.join(root, "app/new-file.tsx"), "utf8"),
		).resolves.toBe("new-file-content");
	});

	it("rejects writing through symlinked file targets", async () => {
		const root = await mkTempDir("openui-apply-");
		const outsideDir = await mkTempDir("openui-apply-outside-");
		const outsideFile = path.join(outsideDir, "outside.txt");
		await fs.mkdir(path.join(root, "app"), { recursive: true });
		await fs.writeFile(outsideFile, "outside-original", "utf8");
		await fs.symlink(outsideFile, path.join(root, "app/page.tsx"));

		await expect(
			applyGeneratedFiles({
				targetRoot: root,
				files: [{ path: "app/page.tsx", content: "inside-update" }],
			}),
		).rejects.toThrow(/symlink/i);

		await expect(fs.readFile(outsideFile, "utf8")).resolves.toBe(
			"outside-original",
		);
	});

	it("rejects protected workspace files", async () => {
		const root = await mkTempDir("openui-apply-");

		await expect(
			applyGeneratedFiles({
				targetRoot: root,
				files: [{ path: ".env", content: "MALICIOUS=true" }],
			}),
		).rejects.toThrow(/protected file path/i);
	});

	it("skips rollback deletion when file content was changed by another writer", async () => {
		const root = await mkTempDir("openui-apply-");
		const conflictingFilePath = path.join(root, "app/new-file.tsx");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const originalReadFile = fs.readFile.bind(fs);
		const originalWriteFile = fs.writeFile.bind(fs);
		let conflictInjected = false;

		vi.spyOn(fs, "readFile").mockImplementation(async (...args: unknown[]) => {
			const target = String(args[0]);
			if (
				target.endsWith(`${path.sep}app${path.sep}new-file.tsx`) &&
				!conflictInjected
			) {
				conflictInjected = true;
				await originalWriteFile(
					conflictingFilePath,
					"external-content",
					"utf8",
				);
			}
			const [filePath, options] = args as [unknown, unknown];
			return originalReadFile(
				filePath as Parameters<typeof fs.readFile>[0],
				options as BufferEncoding,
			);
		});

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/new-file.tsx", content: "new-file-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(fs.readFile(conflictingFilePath, "utf8")).resolves.toBe(
			"external-content",
		);
		expect(error.applyResult.rolledBack).toBe(false);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/new-file.tsx",
				status: "remove_skipped_conflict",
				message: "Skipped rollback because file content changed after apply.",
			},
		]);
	});

	it("skips rollback restore when existing file content was changed by another writer", async () => {
		const root = await mkTempDir("openui-apply-");
		const conflictingFilePath = path.join(root, "app/page.tsx");
		await fs.mkdir(path.dirname(conflictingFilePath), { recursive: true });
		await fs.writeFile(conflictingFilePath, "old-content", "utf8");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const originalReadFile = fs.readFile.bind(fs);
		const originalWriteFile = fs.writeFile.bind(fs);
		let conflictInjected = false;
		let pageFileReadCount = 0;

		vi.spyOn(fs, "readFile").mockImplementation(async (...args: unknown[]) => {
			const target = String(args[0]);
			if (target.endsWith(`${path.sep}app${path.sep}page.tsx`)) {
				pageFileReadCount += 1;
				if (pageFileReadCount >= 2 && !conflictInjected) {
					conflictInjected = true;
					await originalWriteFile(
						conflictingFilePath,
						"external-content",
						"utf8",
					);
				}
			}
			const [filePath, options] = args as [unknown, unknown];
			return originalReadFile(
				filePath as Parameters<typeof fs.readFile>[0],
				options as BufferEncoding,
			);
		});

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/page.tsx", content: "new-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(fs.readFile(conflictingFilePath, "utf8")).resolves.toBe(
			"external-content",
		);
		expect(error.applyResult.rolledBack).toBe(false);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/page.tsx",
				status: "restore_skipped_conflict",
				message: "Skipped rollback because file content changed after apply.",
			},
		]);
	});

	it("captures rollback failure details when remove rollback throws non-Error values", async () => {
		const root = await mkTempDir("openui-apply-");
		const failingRollbackTarget = path.join(root, "app/new-file.tsx");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const originalRm = fs.rm.bind(fs);
		vi.spyOn(fs, "rm").mockImplementation(async (...args: unknown[]) => {
			const target = String(args[0]);
			if (target.endsWith(`${path.sep}app${path.sep}new-file.tsx`)) {
				throw "rm-fail";
			}
			const [filePath, options] = args as [unknown, unknown];
			return originalRm(
				filePath as Parameters<typeof fs.rm>[0],
				options as Parameters<typeof fs.rm>[1],
			);
		});

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/new-file.tsx", content: "new-file-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(fs.readFile(failingRollbackTarget, "utf8")).resolves.toBe(
			"new-file-content",
		);
		expect(error.applyResult.rolledBack).toBe(false);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/new-file.tsx",
				status: "remove_failed",
				message: "rm-fail",
			},
		]);
	});

	it("captures rollback failure details when restore rollback throws", async () => {
		const root = await mkTempDir("openui-apply-");
		const targetFile = path.join(root, "app/page.tsx");
		await fs.mkdir(path.dirname(targetFile), { recursive: true });
		await fs.writeFile(targetFile, "old-content", "utf8");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const originalOpen = fs.open.bind(fs);
		let targetOpenCount = 0;
		vi.spyOn(fs, "open").mockImplementation(async (...args: unknown[]) => {
			const target = String(args[0]);
			if (target.endsWith(`${path.sep}app${path.sep}page.tsx`)) {
				targetOpenCount += 1;
				if (targetOpenCount >= 2) {
					throw new Error("restore-write-fail");
				}
			}
			const [filePath, flags, mode] = args as [unknown, unknown, unknown];
			return originalOpen(
				filePath as Parameters<typeof fs.open>[0],
				flags as Parameters<typeof fs.open>[1],
				mode as Parameters<typeof fs.open>[2],
			);
		});

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/page.tsx", content: "new-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(fs.readFile(targetFile, "utf8")).resolves.toBe("new-content");
		expect(error.applyResult.rolledBack).toBe(false);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/page.tsx",
				status: "restore_failed",
				message: "restore-write-fail",
			},
		]);
	});

	it("captures rollback failure details when remove rollback throws Error objects", async () => {
		const root = await mkTempDir("openui-apply-");
		const failingRollbackTarget = path.join(root, "app/new-file.tsx");
		await fs.writeFile(path.join(root, "components"), "not_a_dir");

		const originalRm = fs.rm.bind(fs);
		vi.spyOn(fs, "rm").mockImplementation(async (...args: unknown[]) => {
			const target = String(args[0]);
			if (target.endsWith(`${path.sep}app${path.sep}new-file.tsx`)) {
				throw new Error("rm-error-object");
			}
			const [filePath, options] = args as [unknown, unknown];
			return originalRm(
				filePath as Parameters<typeof fs.rm>[0],
				options as Parameters<typeof fs.rm>[1],
			);
		});

		const error = await expectApplyRollbackError({
			targetRoot: root,
			rollbackOnError: true,
			files: [
				{ path: "app/new-file.tsx", content: "new-file-content" },
				{
					path: "components/header.tsx",
					content: "export function Header(){return null}",
				},
			],
		});

		await expect(fs.readFile(failingRollbackTarget, "utf8")).resolves.toBe(
			"new-file-content",
		);
		expect(error.applyResult.rolledBack).toBe(false);
		expect(error.applyResult.rollbackDetails).toEqual([
			{
				path: "app/new-file.tsx",
				status: "remove_failed",
				message: "rm-error-object",
			},
		]);
	});
});
