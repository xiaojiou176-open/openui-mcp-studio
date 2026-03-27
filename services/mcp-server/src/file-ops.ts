import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspaceRoot } from "./constants.js";
import {
	isPathInsideRoot,
	isProtectedWorkspacePath,
	normalizePath,
} from "../../../packages/shared-runtime/src/path-utils.js";
import type { GeneratedFile } from "./types.js";

type ExistingBackup = {
	path: string;
	existed: boolean;
	previousContent?: string;
};

type RollbackStatus =
	| "restored"
	| "removed"
	| "restore_failed"
	| "remove_failed"
	| "restore_skipped_conflict"
	| "remove_skipped_conflict";

export type RollbackDetail = {
	path: string;
	status: RollbackStatus;
	message?: string;
};

type ApplyGeneratedFilesPlanItem = {
	path: string;
	status: "create" | "update";
};

type ApplyGeneratedFilesResult = {
	targetRoot: string;
	dryRun: boolean;
	rollbackOnError: boolean;
	plan: ApplyGeneratedFilesPlanItem[];
	written?: string[];
	rolledBack?: boolean;
	rollbackDetails?: RollbackDetail[];
};

const NOFOLLOW_SUPPORTED_PLATFORMS: readonly NodeJS.Platform[] = [
	"linux",
	"darwin",
];

export class ApplyGeneratedFilesError extends Error {
	readonly applyResult: ApplyGeneratedFilesResult;

	constructor(
		message: string,
		options: { cause: unknown; applyResult: ApplyGeneratedFilesResult },
	) {
		super(message, { cause: options.cause });
		this.name = "ApplyGeneratedFilesError";
		this.applyResult = options.applyResult;
	}
}

function assertRelativePath(filePath: string): void {
	const normalized = normalizePath(filePath);
	if (!normalized || normalized === "." || normalized.startsWith("/")) {
		throw new Error(`File path must be relative: ${filePath}`);
	}

	const segments = normalized.split("/");
	if (segments.some((segment) => segment === ".." || segment === "")) {
		throw new Error(`Path traversal is not allowed: ${filePath}`);
	}

	if (/^[A-Za-z]:/.test(normalized)) {
		throw new Error(`Windows drive prefixes are not allowed: ${filePath}`);
	}
}

function assertWritablePath(relativePath: string): void {
	if (isProtectedWorkspacePath(relativePath)) {
		throw new Error(`Refusing to write protected file path: ${relativePath}`);
	}
}

function toAbsolutePath(root: string, relativePath: string): string {
	const target = path.resolve(root, relativePath);
	if (!isPathInsideRoot(root, target)) {
		throw new Error(`Resolved path is outside workspace: ${relativePath}`);
	}
	return target;
}

async function ensureParentDir(
	filePath: string,
	workspaceRoot: string,
): Promise<void> {
	const parentDir = path.dirname(filePath);

	// Check existing ancestor realpath BEFORE creating directories to prevent TOCTOU
	let existingAncestor = parentDir;
	while (existingAncestor !== path.dirname(existingAncestor)) {
		try {
			await fs.access(existingAncestor);
			break;
		} catch {
			existingAncestor = path.dirname(existingAncestor);
		}
	}

	const ancestorReal = await fs.realpath(existingAncestor);
	if (!isPathInsideRoot(workspaceRoot, ancestorReal)) {
		throw new Error(
			`Parent directory escapes workspace root: ${normalizePath(parentDir)}`,
		);
	}

	await fs.mkdir(parentDir, { recursive: true });

	// Post-mkdir verification to ensure no symlink race occurred
	const parentRealPath = await fs.realpath(parentDir);
	if (!isPathInsideRoot(workspaceRoot, parentRealPath)) {
		throw new Error(
			`Parent directory escapes workspace root after creation: ${normalizePath(parentDir)}`,
		);
	}
}

async function ensureSafeExistingFile(
	absolutePath: string,
	workspaceRoot: string,
): Promise<string | null> {
	if (!isPathInsideRoot(workspaceRoot, absolutePath)) {
		throw new Error(
			`Resolved path is outside workspace: ${normalizePath(absolutePath)}`,
		);
	}

	let stat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		stat = await fs.lstat(absolutePath);
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return null;
		}
		throw error;
	}

	if (stat.isSymbolicLink()) {
		throw new Error(
			`Symlink targets are not allowed for writes: ${normalizePath(absolutePath)}`,
		);
	}

	if (!stat.isFile()) {
		throw new Error(
			`Expected file path but found non-file entry: ${normalizePath(absolutePath)}`,
		);
	}

	return fs.readFile(absolutePath, "utf8");
}

export function isNoFollowWriteProtectionSupported(options?: {
	platform?: NodeJS.Platform;
	oNoFollow?: number;
}): boolean {
	const platform = options?.platform ?? process.platform;
	const oNoFollow = options?.oNoFollow ?? fsConstants.O_NOFOLLOW;
	return (
		NOFOLLOW_SUPPORTED_PLATFORMS.includes(platform) &&
		typeof oNoFollow === "number" &&
		Number.isInteger(oNoFollow) &&
		oNoFollow > 0
	);
}

export function getNoFollowWriteFlagOrThrow(options?: {
	platform?: NodeJS.Platform;
	oNoFollow?: number;
}): number {
	const platform = options?.platform ?? process.platform;
	const oNoFollow = options?.oNoFollow ?? fsConstants.O_NOFOLLOW;
	if (
		!isNoFollowWriteProtectionSupported({
			platform,
			oNoFollow,
		})
	) {
		throw new Error(
			`Secure no-follow writes are unsupported on platform ${platform}; refusing to write to avoid symlink race.`,
		);
	}
	return oNoFollow;
}

async function writeFileNoFollow(
	absolutePath: string,
	content: string,
	workspaceRoot: string,
): Promise<void> {
	const noFollowFlag = getNoFollowWriteFlagOrThrow();
	await ensureParentDir(absolutePath, workspaceRoot);
	if (!isPathInsideRoot(workspaceRoot, absolutePath)) {
		throw new Error(
			`Resolved path is outside workspace: ${normalizePath(absolutePath)}`,
		);
	}
	const flags =
		fsConstants.O_WRONLY |
		fsConstants.O_CREAT |
		fsConstants.O_TRUNC |
		noFollowFlag;

	const fileHandle = await fs.open(absolutePath, flags, 0o666);
	try {
		await fileHandle.writeFile(content, "utf8");
	} finally {
		await fileHandle.close();
	}
}

async function removeFileIfExists(
	absolutePath: string,
	workspaceRoot: string,
): Promise<void> {
	if (!isPathInsideRoot(workspaceRoot, absolutePath)) {
		throw new Error(
			`Resolved path is outside workspace: ${normalizePath(absolutePath)}`,
		);
	}

	const stat = await fs.lstat(absolutePath).catch((error: unknown) => {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	});
	if (!stat) {
		return;
	}

	if (stat.isSymbolicLink()) {
		throw new Error(
			`Refusing to remove symlink during rollback: ${normalizePath(absolutePath)}`,
		);
	}

	await fs.rm(absolutePath, { force: true });
}

function resolveSafeWorkspacePath(
	targetRoot: string,
	filePath: string,
): { absolutePath: string } {
	const normalizedPath = normalizePath(filePath);
	assertRelativePath(normalizedPath);
	assertWritablePath(normalizedPath);
	const absolutePath = toAbsolutePath(targetRoot, normalizedPath);
	return { absolutePath };
}

function buildPathDedupKey(absolutePath: string): string {
	const normalized = path.normalize(absolutePath);
	return process.platform === "win32" || process.platform === "darwin"
		? normalized.toLowerCase()
		: normalized;
}

export async function readWorkspaceFileIfExistsNoFollow(input: {
	targetRoot: string;
	filePath: string;
}): Promise<string | null> {
	const resolvedTargetRoot = await fs
		.realpath(path.resolve(input.targetRoot))
		.catch((error: unknown) => {
			if (
				error instanceof Error &&
				"code" in error &&
				(error.code === "ENOENT" || error.code === "ENOTDIR")
			) {
				return null;
			}
			throw error;
		});
	if (!resolvedTargetRoot) {
		return null;
	}
	const { absolutePath } = resolveSafeWorkspacePath(
		resolvedTargetRoot,
		input.filePath,
	);
	return ensureSafeExistingFile(absolutePath, resolvedTargetRoot);
}

export async function writeWorkspaceFileNoFollow(input: {
	targetRoot: string;
	filePath: string;
	content: string;
}): Promise<void> {
	const resolvedTargetRoot = await fs.realpath(path.resolve(input.targetRoot));
	const { absolutePath } = resolveSafeWorkspacePath(
		resolvedTargetRoot,
		input.filePath,
	);
	await writeFileNoFollow(absolutePath, input.content, resolvedTargetRoot);
}

export async function removeWorkspaceFileIfExistsNoFollow(input: {
	targetRoot: string;
	filePath: string;
}): Promise<void> {
	const resolvedTargetRoot = await fs.realpath(path.resolve(input.targetRoot));
	const { absolutePath } = resolveSafeWorkspacePath(
		resolvedTargetRoot,
		input.filePath,
	);
	await removeFileIfExists(absolutePath, resolvedTargetRoot);
}

export async function applyGeneratedFiles(input: {
	files: GeneratedFile[];
	targetRoot?: string;
	dryRun?: boolean;
	rollbackOnError?: boolean;
}): Promise<ApplyGeneratedFilesResult> {
	const targetRoot = input.targetRoot || getWorkspaceRoot();
	const resolvedTargetRoot = await fs.realpath(path.resolve(targetRoot));
	const dryRun = input.dryRun ?? false;
	const rollbackOnError = input.rollbackOnError ?? true;

	if (!input.files.length) {
		throw new Error("files[] must not be empty");
	}

	const seenPathKeys = new Map<string, string>();
	const normalizedFiles = input.files.map((file) => {
		const relativePath = normalizePath(file.path);
		assertRelativePath(relativePath);
		assertWritablePath(relativePath);
		const absolutePath = toAbsolutePath(resolvedTargetRoot, relativePath);
		const dedupKey = buildPathDedupKey(absolutePath);
		const existingPath = seenPathKeys.get(dedupKey);
		if (existingPath) {
			throw new Error(
				`Duplicate file path in apply batch: ${relativePath} conflicts with ${existingPath}`,
			);
		}
		seenPathKeys.set(dedupKey, relativePath);
		return {
			path: relativePath,
			content: file.content,
			absolutePath,
		};
	});

	const plan: ApplyGeneratedFilesPlanItem[] = [];
	const backups = new Map<string, ExistingBackup>();
	const writtenContentByPath = new Map<string, string>();

	for (const file of normalizedFiles) {
		writtenContentByPath.set(file.path, file.content);
		const previousContent = await ensureSafeExistingFile(
			file.absolutePath,
			resolvedTargetRoot,
		);
		if (typeof previousContent === "string") {
			backups.set(file.path, {
				path: file.path,
				existed: true,
				previousContent,
			});
			plan.push({ path: file.path, status: "update" });
		} else {
			backups.set(file.path, {
				path: file.path,
				existed: false,
			});
			plan.push({ path: file.path, status: "create" });
		}
	}

	if (dryRun) {
		return {
			targetRoot,
			dryRun,
			rollbackOnError,
			plan,
		};
	}

	const written: string[] = [];
	const rollbackDetails: RollbackDetail[] = [];

	try {
		for (const file of normalizedFiles) {
			await writeFileNoFollow(
				file.absolutePath,
				file.content,
				resolvedTargetRoot,
			);
			written.push(file.path);
		}

		return {
			targetRoot,
			dryRun,
			rollbackOnError,
			plan,
			written,
			rolledBack: false,
		};
	} catch (error) {
		if (!rollbackOnError) {
			throw error;
		}

		for (const filePath of written.reverse()) {
			const backup = backups.get(filePath);
			if (!backup) {
				continue;
			}

			try {
				const absPath = toAbsolutePath(resolvedTargetRoot, backup.path);
				const expectedContent = writtenContentByPath.get(backup.path);
				const currentContent = await ensureSafeExistingFile(
					absPath,
					resolvedTargetRoot,
				);

				if (
					typeof expectedContent === "string" &&
					typeof currentContent === "string" &&
					currentContent !== expectedContent
				) {
					rollbackDetails.push({
						path: backup.path,
						status: backup.existed
							? "restore_skipped_conflict"
							: "remove_skipped_conflict",
						message:
							"Skipped rollback because file content changed after apply.",
					});
					continue;
				}

				if (backup.existed) {
					await writeFileNoFollow(
						absPath,
						backup.previousContent || "",
						resolvedTargetRoot,
					);
					rollbackDetails.push({
						path: backup.path,
						status: "restored",
					});
				} else {
					if (currentContent !== null) {
						await removeFileIfExists(absPath, resolvedTargetRoot);
					}
					rollbackDetails.push({
						path: backup.path,
						status: "removed",
					});
				}
			} catch (rollbackError) {
				rollbackDetails.push({
					path: backup.path,
					status: backup.existed ? "restore_failed" : "remove_failed",
					message:
						rollbackError instanceof Error
							? rollbackError.message
							: String(rollbackError),
				});
			}
		}

		const rolledBack =
			rollbackDetails.length === written.length &&
			rollbackDetails.every(
				(item) => item.status === "restored" || item.status === "removed",
			);

		throw new ApplyGeneratedFilesError(
			`Apply failed and rollback executed. ${
				error instanceof Error ? error.message : String(error)
			}`,
			{
				cause: error,
				applyResult: {
					targetRoot,
					dryRun,
					rollbackOnError,
					plan,
					written,
					rolledBack,
					rollbackDetails,
				},
			},
		);
	}
}
