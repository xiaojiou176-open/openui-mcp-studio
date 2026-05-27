import fs from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./path-utils.js";

export async function listWorkspaceFilesRecursive(
	root: string,
	predicate: (relativePath: string) => boolean,
): Promise<string[]> {
	const results: string[] = [];

	async function walk(current: string): Promise<void> {
		const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				entry.name === ".next" ||
				entry.name === "dist" ||
				entry.name === "build"
			) {
				continue;
			}
			const absolutePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(absolutePath);
				continue;
			}
			const relativePath = normalizePath(path.relative(root, absolutePath));
			if (predicate(relativePath)) {
				results.push(relativePath);
			}
		}
	}

	await walk(root);
	return results.sort();
}

export function collectWorkspaceExportNames(source: string): string[] {
	const matches = source.matchAll(
		/export\s+(?:function|const|class)\s+([A-Za-z0-9_]+)/g,
	);
	return Array.from(matches, (match) => match[1]).filter(Boolean);
}

export function routePathFromAppFile(relativePath: string): string {
	const normalized = normalizePath(relativePath);
	const routeSegment = normalized.startsWith("app/")
		? normalized.slice("app/".length)
		: (() => {
				const appIndex = normalized.indexOf("/app/");
				return appIndex >= 0 ? normalized.slice(appIndex + "/app/".length) : normalized;
			})();
	const withoutLeaf = routeSegment.replace(
		/(?:^|\/)(page|layout|route|loading|error)\.(tsx|ts|jsx|js)$/,
		"",
	);
	const cleaned = withoutLeaf
		.split("/")
		.filter((segment) => segment.length > 0 && !segment.startsWith("("))
		.join("/");
	return cleaned ? `/${cleaned}` : "/";
}
