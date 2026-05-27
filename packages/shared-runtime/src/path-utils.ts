import fs from "node:fs";
import path from "node:path";

const PROTECTED_WORKSPACE_PATH_PATTERNS: RegExp[] = [
	/^\.env(?:\..+)?$/i,
	/^\.git(?:\/|$)/i,
	/^\.gitignore$/i,
	/^package(?:-lock)?\.json$/i,
	/^pnpm-lock\.ya?ml$/i,
	/^yarn\.lock$/i,
	/^bun\.lockb$/i,
	/^node_modules(?:\/|$)/i,
];

export function normalizePath(value: string): string {
	if (value.includes("\0")) {
		throw new Error("Null bytes in paths are not allowed.");
	}
	return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isProtectedWorkspacePath(relativePath: string): boolean {
	const normalized = normalizePath(relativePath).replace(/^\/+/, "");
	return PROTECTED_WORKSPACE_PATH_PATTERNS.some((pattern) =>
		pattern.test(normalized),
	);
}

export function isPathInsideRoot(
	rootPath: string,
	targetPath: string,
): boolean {
	const normalizedRoot = path.resolve(rootPath);
	const normalizedTarget = path.resolve(targetPath);
	const relative = path.relative(normalizedRoot, normalizedTarget);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function tryRealpathSync(candidatePath: string): string | null {
	try {
		return fs.realpathSync(candidatePath);
	} catch {
		return null;
	}
}

function resolveExistingAncestorRealPathSync(
	targetPath: string,
): string | null {
	let current = path.resolve(targetPath);
	while (true) {
		const real = tryRealpathSync(current);
		if (real) {
			return real;
		}
		const parent = path.dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

export function isPathInsideRootWithRealpath(
	rootPath: string,
	targetPath: string,
): boolean {
	const normalizedRoot = path.resolve(rootPath);
	const normalizedTarget = path.resolve(targetPath);
	const rootReal = tryRealpathSync(normalizedRoot) ?? normalizedRoot;
	const targetReal = tryRealpathSync(normalizedTarget);
	if (targetReal) {
		return isPathInsideRoot(rootReal, targetReal);
	}

	const existingAncestorReal =
		resolveExistingAncestorRealPathSync(normalizedTarget);
	if (existingAncestorReal) {
		if (!isPathInsideRoot(rootReal, existingAncestorReal)) {
			return false;
		}
	}

	return isPathInsideRoot(normalizedRoot, normalizedTarget);
}
