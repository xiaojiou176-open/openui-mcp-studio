import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SUMMARY_ROOT_DIR = ".runtime-cache/runs";

function assertSummaryFilePathIsSafe(summaryFilePath) {
	if (summaryFilePath.length === 0) {
		return;
	}
	if (path.isAbsolute(summaryFilePath)) {
		throw new Error("--summary-file must be a workspace-relative path.");
	}
	if (!summaryFilePath.endsWith(".json")) {
		throw new Error("--summary-file must use .json extension.");
	}
	if (!/\.runtime-cache\/runs\/[^/]+\/summary\.json$/u.test(summaryFilePath)) {
		throw new Error(
			`--summary-file must target .runtime-cache/runs/<run_id>/summary.json (received: ${summaryFilePath}).`,
		);
	}

	const workspaceRoot = path.resolve(process.cwd());
	const allowedRoot = path.resolve(workspaceRoot, SUMMARY_ROOT_DIR);
	const resolvedPath = path.resolve(workspaceRoot, summaryFilePath);
	const relativeToAllowedRoot = path.relative(allowedRoot, resolvedPath);
	const outsideAllowedRoot =
		relativeToAllowedRoot.startsWith("..") ||
		path.isAbsolute(relativeToAllowedRoot);

	if (outsideAllowedRoot) {
		throw new Error(
			`--summary-file must stay within ${SUMMARY_ROOT_DIR} (received: ${summaryFilePath}).`,
		);
	}
}

function isPathOutsideRoot(rootPath, candidatePath) {
	const relativePath = path.relative(rootPath, candidatePath);
	return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

async function resolveSafeSummaryWriteTarget(summaryFilePath) {
	const workspaceRoot = path.resolve(process.cwd());
	const allowedRoot = path.resolve(workspaceRoot, SUMMARY_ROOT_DIR);
	const resolvedPath = path.resolve(workspaceRoot, summaryFilePath);
	const summaryDirPath = path.dirname(resolvedPath);

	await mkdir(allowedRoot, { recursive: true });
	const allowedRootRealPath = await realpath(allowedRoot);

	if (isPathOutsideRoot(workspaceRoot, allowedRootRealPath)) {
		throw new Error(
			`--summary-file root ${SUMMARY_ROOT_DIR} resolves outside workspace via symlink.`,
		);
	}

	await mkdir(summaryDirPath, { recursive: true });
	const summaryDirRealPath = await realpath(summaryDirPath);
	if (isPathOutsideRoot(allowedRootRealPath, summaryDirRealPath)) {
		throw new Error(
			`--summary-file directory resolves outside ${SUMMARY_ROOT_DIR} via symlink (received: ${summaryFilePath}).`,
		);
	}

	try {
		const fileStat = await lstat(resolvedPath);
		if (fileStat.isSymbolicLink()) {
			throw new Error(
				`--summary-file target must not be a symlink (received: ${summaryFilePath}).`,
			);
		}
		const fileRealPath = await realpath(resolvedPath);
		if (isPathOutsideRoot(allowedRootRealPath, fileRealPath)) {
			throw new Error(
				`--summary-file target resolves outside ${SUMMARY_ROOT_DIR} via symlink (received: ${summaryFilePath}).`,
			);
		}
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return resolvedPath;
		}
		throw error;
	}

	return resolvedPath;
}

async function writeSummaryFile(summaryFile, summary) {
	if (!summaryFile) {
		return;
	}
	const summaryFilePath = summaryFile.trim();
	assertSummaryFilePathIsSafe(summaryFilePath);
	const resolvedPath = await resolveSafeSummaryWriteTarget(summaryFilePath);
	await writeFile(
		resolvedPath,
		`${JSON.stringify(summary, null, 2)}\n`,
		"utf8",
	);
}

export { assertSummaryFilePathIsSafe, writeSummaryFile };
