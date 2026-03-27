import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_NEXT_DIST_DIR = ".next";

export function resolveSafeBuildOutputDir(
	root: string,
	distDir: string,
): string {
	const allowedRoot = path.resolve(root);
	const resolved = path.resolve(allowedRoot, distDir);
	if (
		resolved === allowedRoot ||
		!resolved.startsWith(`${allowedRoot}${path.sep}`)
	) {
		return path.resolve(allowedRoot, DEFAULT_NEXT_DIST_DIR);
	}
	return resolved;
}

async function loadNextConfig(
	root: string,
): Promise<Record<string, unknown> | null> {
	try {
		const requireFromRoot = createRequire(path.resolve(root, "package.json"));
		const [configModule, constantsModule] = await Promise.all([
			import(
				pathToFileURL(requireFromRoot.resolve("next/dist/server/config.js"))
					.href
			),
			import(pathToFileURL(requireFromRoot.resolve("next/constants.js")).href),
		]);
		const loadConfig = configModule.default;
		const phase =
			typeof constantsModule.PHASE_PRODUCTION_BUILD === "string"
				? constantsModule.PHASE_PRODUCTION_BUILD
				: typeof constantsModule.default?.PHASE_PRODUCTION_BUILD === "string"
					? constantsModule.default.PHASE_PRODUCTION_BUILD
					: null;
		if (typeof loadConfig !== "function" || typeof phase !== "string") {
			return null;
		}
		const loaded = await loadConfig(phase, root, { silent: true });
		if (!loaded || typeof loaded !== "object") {
			return null;
		}
		return loaded as Record<string, unknown>;
	} catch {
		return null;
	}
}

export async function resolveNextBuildDir(root: string): Promise<string> {
	const loadedConfig = await loadNextConfig(root);
	if (typeof loadedConfig?.distDir === "string") {
		return resolveSafeBuildOutputDir(root, loadedConfig.distDir);
	}

	const configCandidates = [
		"next.config.ts",
		"next.config.mjs",
		"next.config.js",
		"next.config.cjs",
	].map((file) => path.resolve(root, file));

	for (const configPath of configCandidates) {
		try {
			const raw = await fs.readFile(configPath, "utf8");
			const match =
				raw.match(/\bdistDir\s*:\s*["'`]([^"'`]+)["'`]/) ??
				raw.match(/\bdistDir\s*=\s*["'`]([^"'`]+)["'`]/);
			if (match?.[1]) {
				return resolveSafeBuildOutputDir(root, match[1]);
			}
		} catch {
			// Ignore missing or unreadable config files and fall back to .next.
		}
	}

	return path.resolve(root, DEFAULT_NEXT_DIST_DIR);
}
