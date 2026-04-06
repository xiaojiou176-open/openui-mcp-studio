import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspaceRoot } from "./constants.js";
import {
	isPathInsideRoot,
	normalizePath,
} from "../../../packages/shared-runtime/src/path-utils.js";
import { pathExists } from "../../../packages/shared-runtime/src/runtime-ops.js";

export type ShadcnDetectionResult = {
	workspaceRoot: string;
	source: "components.json" | "scan" | "default";
	uiImportBase: string;
	uiDir: string;
	componentsImportBase: string;
	componentsDir: string;
	evidence: string[];
};

type CompilerOptions = {
	baseUrl?: string;
	paths?: Record<string, string[]>;
};

type ComponentsJson = {
	aliases?: {
		ui?: string;
		components?: string;
	};
};

function normalizeCompilerOptionsToWorkspace(input: {
	compilerOptions: CompilerOptions | null;
	projectRoot: string;
}): CompilerOptions | null {
	if (!input.compilerOptions) {
		return null;
	}

	const normalizedBaseUrl = path.resolve(
		input.projectRoot,
		input.compilerOptions.baseUrl ?? ".",
	);
	return {
		...input.compilerOptions,
		baseUrl: normalizedBaseUrl,
	};
}

function stripJsonComments(input: string): string {
	return input
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function readJsonc<T>(filePath: string): Promise<T | null> {
	try {
		const content = await fs.readFile(filePath, "utf8");
		return JSON.parse(stripJsonComments(content)) as T;
	} catch {
		return null;
	}
}

function splitPattern(pattern: string): [string, string] {
	const starIndex = pattern.indexOf("*");
	if (starIndex === -1) {
		return [pattern, ""];
	}
	return [pattern.slice(0, starIndex), pattern.slice(starIndex + 1)];
}

function matchAlias(pattern: string, alias: string): string | null {
	if (pattern.includes("*")) {
		const [prefix, suffix] = splitPattern(pattern);
		if (!alias.startsWith(prefix) || !alias.endsWith(suffix)) {
			return null;
		}
		return alias.slice(prefix.length, alias.length - suffix.length);
	}
	return pattern === alias ? "" : null;
}

function applyPattern(target: string, wildcardValue: string): string {
	if (!target.includes("*")) {
		return target;
	}
	const [prefix, suffix] = splitPattern(target);
	return `${prefix}${wildcardValue}${suffix}`;
}

type AliasCandidate = {
	alias: string;
	staticLength: number;
	aliasStartsWithAt: boolean;
};

async function resolveAliasToDir(
	alias: string,
	compilerOptions: CompilerOptions | null,
	workspaceRoot: string,
): Promise<string> {
	const baseUrl = compilerOptions?.baseUrl ?? ".";
	const paths = compilerOptions?.paths ?? {};

	for (const [pattern, targets] of Object.entries(paths)) {
		const wildcardValue = matchAlias(pattern, alias);
		if (wildcardValue === null) {
			continue;
		}

		for (const target of targets) {
			const substituted = applyPattern(target, wildcardValue);
			const resolved = path.resolve(workspaceRoot, baseUrl, substituted);
			if (!isPathInsideRoot(workspaceRoot, resolved)) {
				continue;
			}
			return normalizePath(path.relative(workspaceRoot, resolved));
		}
	}

	if (alias.startsWith("@/")) {
		return normalizePath(alias.slice(2));
	}

	if (alias.startsWith("./") || alias.startsWith("../")) {
		return normalizePath(
			path.relative(workspaceRoot, path.resolve(workspaceRoot, alias)),
		);
	}

	return normalizePath(alias);
}

function resolveTargetToDirPattern(
	targetPattern: string,
	baseUrl: string,
	workspaceRoot: string,
): string {
	const resolved = path.resolve(workspaceRoot, baseUrl, targetPattern);
	return normalizePath(path.relative(workspaceRoot, resolved));
}

function resolveDirToAlias(
	dir: string,
	compilerOptions: CompilerOptions | null,
	workspaceRoot: string,
): string | null {
	const normalizedDir = normalizePath(dir);
	const baseUrl = compilerOptions?.baseUrl ?? ".";
	const paths = compilerOptions?.paths ?? {};
	const candidates: AliasCandidate[] = [];

	for (const [aliasPattern, targets] of Object.entries(paths)) {
		for (const target of targets) {
			const dirPattern = resolveTargetToDirPattern(
				target,
				baseUrl,
				workspaceRoot,
			);
			if (dirPattern.startsWith("../") || dirPattern === "..") {
				continue;
			}
			const wildcardValue = matchAlias(dirPattern, normalizedDir);
			if (wildcardValue === null) {
				continue;
			}

			const alias = normalizePath(applyPattern(aliasPattern, wildcardValue));
			candidates.push({
				alias,
				staticLength: dirPattern.replace(/\*/g, "").length,
				aliasStartsWithAt: alias.startsWith("@/"),
			});
		}
	}

	if (!candidates.length) {
		return null;
	}

	candidates.sort((a, b) => {
		if (a.staticLength !== b.staticLength) {
			return b.staticLength - a.staticLength;
		}

		if (a.aliasStartsWithAt !== b.aliasStartsWithAt) {
			return Number(b.aliasStartsWithAt) - Number(a.aliasStartsWithAt);
		}

		if (a.alias.length !== b.alias.length) {
			return a.alias.length - b.alias.length;
		}

		return a.alias.localeCompare(b.alias);
	});

	return candidates[0]?.alias ?? null;
}

export async function detectShadcnPaths(
	workspaceRootInput?: string,
): Promise<ShadcnDetectionResult> {
	const workspaceRoot = await fs.realpath(
		path.resolve(workspaceRootInput || getWorkspaceRoot()),
	);
	const evidence: string[] = [];
	const rootCompilerConfig =
		(await readJsonc<{ compilerOptions?: CompilerOptions }>(
			path.resolve(workspaceRoot, "tsconfig.json"),
		)) ||
		(await readJsonc<{ compilerOptions?: CompilerOptions }>(
			path.resolve(workspaceRoot, "jsconfig.json"),
		));
	const rootCompilerOptions = normalizeCompilerOptionsToWorkspace({
		compilerOptions: rootCompilerConfig?.compilerOptions ?? null,
		projectRoot: workspaceRoot,
	});
	const projectRootCandidates = Array.from(
		new Set([workspaceRoot, path.resolve(workspaceRoot, "apps", "web")]),
	);

	for (const projectRoot of projectRootCandidates) {
		if (!(await pathExists(projectRoot))) {
			continue;
		}
		const componentsJsonPath = path.resolve(projectRoot, "components.json");
		const tsConfigPath = path.resolve(projectRoot, "tsconfig.json");
		const jsConfigPath = path.resolve(projectRoot, "jsconfig.json");
		const compilerConfig =
			(await readJsonc<{ compilerOptions?: CompilerOptions }>(tsConfigPath)) ||
			(await readJsonc<{ compilerOptions?: CompilerOptions }>(jsConfigPath));
		const compilerOptions = normalizeCompilerOptionsToWorkspace({
			compilerOptions: compilerConfig?.compilerOptions ?? null,
			projectRoot,
		});
		const componentsJson = await readJsonc<ComponentsJson>(componentsJsonPath);
		if (!componentsJson?.aliases?.ui) {
			continue;
		}

		const uiImportBase = componentsJson.aliases.ui;
		const componentsImportBase =
			componentsJson.aliases.components ||
			(uiImportBase.includes("/ui")
				? uiImportBase.replace(/\/ui$/, "")
				: "@/components");

		const uiDir = await resolveAliasToDir(
			uiImportBase,
			compilerOptions,
			workspaceRoot,
		);
		const componentsDir = await resolveAliasToDir(
			componentsImportBase,
			compilerOptions,
			workspaceRoot,
		);

		evidence.push(
			`Detected from ${normalizePath(path.relative(workspaceRoot, componentsJsonPath))} aliases.ui`,
		);
		if (componentsJson.aliases.components) {
			evidence.push("Detected from components.json aliases.components");
		}

		return {
			workspaceRoot,
			source: "components.json",
			uiImportBase,
			uiDir,
			componentsImportBase,
			componentsDir,
			evidence,
		};
	}

	const scanCandidates: Array<{ legacyImportBase: string; uiDir: string }> = [
		{
			legacyImportBase: "@/components/ui",
			uiDir: "apps/web/components/ui",
		},
		{
			legacyImportBase: "@/app/components/ui",
			uiDir: "apps/web/app/components/ui",
		},
		{ legacyImportBase: "@/components/ui", uiDir: "components/ui" },
		{ legacyImportBase: "@/src/components/ui", uiDir: "src/components/ui" },
		{ legacyImportBase: "@/app/components/ui", uiDir: "app/components/ui" },
		{
			legacyImportBase: "@/src/app/components/ui",
			uiDir: "src/app/components/ui",
		},
		{
			legacyImportBase: "@/shared/components/ui",
			uiDir: "shared/components/ui",
		},
	];

	for (const candidate of scanCandidates) {
		const candidatePath = path.resolve(workspaceRoot, candidate.uiDir);
		if (await pathExists(candidatePath)) {
			const candidateRealPath = await fs
				.realpath(candidatePath)
				.catch(() => null);
			if (
				!candidateRealPath ||
				!isPathInsideRoot(workspaceRoot, candidateRealPath)
			) {
				continue;
			}
			const canonicalUiDir = normalizePath(
				path.relative(workspaceRoot, candidateRealPath),
			);
			const inferredImportBase = resolveDirToAlias(
				canonicalUiDir,
				rootCompilerOptions,
				workspaceRoot,
			);
			const uiImportBase = inferredImportBase || candidate.legacyImportBase;
			const componentsImportBase = uiImportBase.includes("/ui")
				? uiImportBase.replace(/\/ui$/, "")
				: "@/components";

			evidence.push(`Detected by folder scan: ${canonicalUiDir}`);
			if (inferredImportBase) {
				evidence.push(
					`Alias inferred from ts/js config: ${inferredImportBase}`,
				);
			} else {
				evidence.push(`Alias fallback used: ${candidate.legacyImportBase}`);
			}

			return {
				workspaceRoot,
				source: "scan",
				uiImportBase,
				uiDir: canonicalUiDir,
				componentsImportBase,
				componentsDir: canonicalUiDir.replace(/\/ui$/, ""),
				evidence,
			};
		}
	}

	evidence.push("Fallback to default '@/components/ui' + 'components/ui'");
	return {
		workspaceRoot,
		source: "default",
		uiImportBase: "@/components/ui",
		uiDir: "components/ui",
		componentsImportBase: "@/components",
		componentsDir: "components",
		evidence,
	};
}
