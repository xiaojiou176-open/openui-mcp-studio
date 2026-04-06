import {
	readWorkspaceFileIfExistsNoFollow,
	removeWorkspaceFileIfExistsNoFollow,
	writeWorkspaceFileNoFollow,
	type RollbackDetail,
} from "../file-ops.js";

export type FileBackup = {
	path: string;
	existed: boolean;
	previousContent?: string;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export async function snapshotFiles(
	targetRoot: string,
	paths: string[],
): Promise<Map<string, FileBackup>> {
	const snapshots = new Map<string, FileBackup>();
	for (const filePath of paths) {
		const previousContent = await readWorkspaceFileIfExistsNoFollow({
			targetRoot,
			filePath,
		});
		snapshots.set(filePath, {
			path: filePath,
			existed: typeof previousContent === "string",
			...(typeof previousContent === "string"
				? { previousContent }
				: {}),
		});
	}
	return snapshots;
}

export async function rollbackWrittenFiles(
	targetRoot: string,
	writtenPaths: string[],
	snapshots: Map<string, FileBackup>,
	writtenContentByPath: Map<string, string>,
): Promise<{ rolledBack: boolean; rollbackDetails: RollbackDetail[] }> {
	const rollbackDetails: RollbackDetail[] = [];
	for (const filePath of [...writtenPaths].reverse()) {
		const snapshot = snapshots.get(filePath);
		if (!snapshot) {
			rollbackDetails.push({
				path: filePath,
				status: "remove_failed",
				message: "Missing pre-apply backup snapshot.",
			});
			continue;
		}

		try {
			const expectedContent = writtenContentByPath.get(snapshot.path);
			const currentContent = await readWorkspaceFileIfExistsNoFollow({
				targetRoot,
				filePath: snapshot.path,
			});

			if (
				typeof expectedContent === "string" &&
				currentContent !== null &&
				currentContent !== expectedContent
			) {
				rollbackDetails.push({
					path: snapshot.path,
					status: snapshot.existed
						? "restore_skipped_conflict"
						: "remove_skipped_conflict",
					message: "Skipped rollback because file content changed after apply.",
				});
				continue;
			}

			if (snapshot.existed) {
				await writeWorkspaceFileNoFollow({
					targetRoot,
					filePath: snapshot.path,
					content: snapshot.previousContent || "",
				});
				rollbackDetails.push({ path: snapshot.path, status: "restored" });
			} else {
				if (currentContent !== null) {
					await removeWorkspaceFileIfExistsNoFollow({
						targetRoot,
						filePath: snapshot.path,
					});
				}
				rollbackDetails.push({ path: snapshot.path, status: "removed" });
			}
		} catch (error) {
			rollbackDetails.push({
				path: snapshot.path,
				status: snapshot.existed ? "restore_failed" : "remove_failed",
				message: toErrorMessage(error),
			});
		}
	}

	return {
		rolledBack:
			rollbackDetails.length === writtenPaths.length &&
			rollbackDetails.every(
				(detail) => detail.status === "restored" || detail.status === "removed",
			),
		rollbackDetails,
	};
}
