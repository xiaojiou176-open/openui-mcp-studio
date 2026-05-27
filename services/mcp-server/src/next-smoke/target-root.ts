import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWorkspaceRoot } from "../constants.js";
import type { LogTailBuffer } from "./logging.js";
import type {
	PackageJson,
	RootValidation,
	RunNextSmokeInput,
} from "./types.js";

function getDefaultAppRoot(): string {
	const currentFilePath = fileURLToPath(import.meta.url);
	const currentDir = path.dirname(currentFilePath);
	return path.resolve(currentDir, "..", "..", "apps", "web");
}

export async function validateTargetRoot(
	root: string,
): Promise<RootValidation> {
	try {
		const stats = await fs.stat(root);
		if (!stats.isDirectory()) {
			return {
				ok: false,
				root,
				reason: "Target root exists but is not a directory.",
			};
		}
	} catch {
		return {
			ok: false,
			root,
			reason: "Target root does not exist.",
		};
	}

	const packageJsonPath = path.resolve(root, "package.json");
	let rawPackageJson: string;

	try {
		rawPackageJson = await fs.readFile(packageJsonPath, "utf8");
	} catch {
		return {
			ok: false,
			root,
			reason: "Missing package.json.",
		};
	}

	let packageJson: PackageJson;
	try {
		packageJson = JSON.parse(rawPackageJson) as PackageJson;
	} catch {
		return {
			ok: false,
			root,
			reason: "package.json is not valid JSON.",
		};
	}

	const nextVersion =
		packageJson.dependencies?.next ||
		packageJson.devDependencies?.next ||
		packageJson.peerDependencies?.next;

	if (!nextVersion || typeof nextVersion !== "string") {
		return {
			ok: false,
			root,
			reason: "package.json must declare a next dependency.",
		};
	}

	return {
		ok: true,
		root,
		packageJson,
	};
}

function isPathWithinBoundary(root: string, boundary: string): boolean {
	const relative = path.relative(boundary, root);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

async function validateRootWithinWorkspace(
	root: string,
	workspaceRoot: string,
): Promise<RootValidation | null> {
	const workspaceForCheck = await fs
		.realpath(workspaceRoot)
		.catch(() => workspaceRoot);
	const rootForCheck = await fs.realpath(root).catch(() => root);
	if (isPathWithinBoundary(rootForCheck, workspaceForCheck)) {
		return null;
	}

	return {
		ok: false,
		root,
		reason: `Target root is outside workspace boundary: ${workspaceRoot}`,
	};
}

function getValidationReason(validation: RootValidation): string {
	return validation.ok ? "Validation passed." : validation.reason;
}

export async function chooseRoot(
	input: RunNextSmokeInput,
	logs: LogTailBuffer,
): Promise<{ validation: RootValidation }> {
	const workspaceRoot = path.resolve(getWorkspaceRoot());
	const defaultRoot = path.resolve(getDefaultAppRoot());

	if (input.targetRoot) {
		const preferredRoot = path.resolve(input.targetRoot);
		const preferredBoundaryValidation = await validateRootWithinWorkspace(
			preferredRoot,
			workspaceRoot,
		);
		if (preferredBoundaryValidation) {
			logs.append(
				"select",
				`Preferred target rejected (${preferredRoot}): ${getValidationReason(preferredBoundaryValidation)}`,
			);
		}
		const preferredValidation = await validateTargetRoot(preferredRoot);
		if (!preferredBoundaryValidation && preferredValidation.ok) {
			logs.append("select", `Using preferred target root: ${preferredRoot}`);
				return {
					validation: preferredValidation,
				};
		}
		logs.append(
			"select",
			`Preferred target unusable (${preferredRoot}): ${
				preferredBoundaryValidation
					? getValidationReason(preferredBoundaryValidation)
					: getValidationReason(preferredValidation)
			}`,
		);
			return {
				validation: preferredBoundaryValidation ?? preferredValidation,
			};
	}

	logs.append(
		"select",
		`No preferred target provided. Using default target root: ${defaultRoot}`,
	);
	const fallbackBoundaryValidation = await validateRootWithinWorkspace(
		defaultRoot,
		workspaceRoot,
	);
	if (fallbackBoundaryValidation) {
		logs.append(
			"select",
			`Default target rejected (${defaultRoot}): ${getValidationReason(fallbackBoundaryValidation)}`,
		);
		return {
			validation: fallbackBoundaryValidation,
		};
	}

	const fallbackValidation = await validateTargetRoot(defaultRoot);
	return {
		validation: fallbackValidation,
	};
}
