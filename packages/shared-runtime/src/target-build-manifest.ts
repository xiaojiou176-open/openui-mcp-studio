import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { resolveNextBuildDir } from "./next-build-dir.js";
import { pathExists } from "./runtime-ops.js";

const TARGET_BUILD_MANIFEST_VERSION = 2;
const REQUIRED_BUILD_ARTIFACTS = [
	"BUILD_ID",
	"required-server-files.json",
	"routes-manifest.json",
	"prerender-manifest.json",
] as const;

const SOURCE_DIR_CANDIDATES = ["app", "pages", "src", "components", "lib"];
const SOURCE_FILE_CANDIDATES = [
	"package.json",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"next.config.js",
	"next.config.mjs",
	"next.config.ts",
];

type TargetBuildManifest = {
	version: number;
	targetRoot: string;
	buildDir: string;
	requiredPackages: string[];
	latestSourceMtimeMs: number;
	buildMarkerMtimeMs: number;
	preparedAt: string;
};

export type TargetBuildManifestStatus = {
	valid: boolean;
	reason: string;
	manifestPath: string;
	latestSourceMtimeMs: number;
	buildMarkerMtimeMs: number | null;
};

function createManifestFilePath(
	root: string,
	workspaceRoot = process.cwd(),
): string {
	const resolvedRoot = path.resolve(root);
	const key = createHash("sha1").update(resolvedRoot).digest("hex");
	return path.resolve(
		workspaceRoot,
		".runtime-cache",
		"cache",
		"target-build-manifest",
		`${key}.json`,
	);
}

async function readManifest(
	manifestPath: string,
): Promise<TargetBuildManifest | null> {
	if (!(await pathExists(manifestPath))) {
		return null;
	}

	try {
		const raw = await fs.readFile(manifestPath, "utf8");
		const parsed = JSON.parse(raw) as Partial<TargetBuildManifest>;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			parsed.version !== TARGET_BUILD_MANIFEST_VERSION ||
			typeof parsed.targetRoot !== "string" ||
			typeof parsed.buildDir !== "string" ||
			!Array.isArray(parsed.requiredPackages) ||
			typeof parsed.latestSourceMtimeMs !== "number" ||
			typeof parsed.buildMarkerMtimeMs !== "number" ||
			typeof parsed.preparedAt !== "string"
		) {
			return null;
		}
		return {
			version: parsed.version,
			targetRoot: parsed.targetRoot,
			buildDir: parsed.buildDir,
			requiredPackages: parsed.requiredPackages,
			latestSourceMtimeMs: parsed.latestSourceMtimeMs,
			buildMarkerMtimeMs: parsed.buildMarkerMtimeMs,
			preparedAt: parsed.preparedAt,
		};
	} catch {
		return null;
	}
}

function normalizeRequiredPackages(
	requiredPackages: readonly string[],
): string[] {
	return [...new Set(requiredPackages)].sort((left, right) =>
		left.localeCompare(right),
	);
}

async function collectLatestMtimeMs(root: string): Promise<number> {
	const sourcePaths = [
		...SOURCE_DIR_CANDIDATES.map((name) => path.resolve(root, name)),
		...SOURCE_FILE_CANDIDATES.map((name) => path.resolve(root, name)),
	];

	let latest = 0;
	const stack: string[] = [];

	for (const sourcePath of sourcePaths) {
		if (!(await pathExists(sourcePath))) {
			continue;
		}
		const stat = await fs.stat(sourcePath);
		latest = Math.max(latest, stat.mtimeMs);
		if (stat.isDirectory()) {
			stack.push(sourcePath);
		}
	}

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) {
			continue;
		}

		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.resolve(current, entry.name);
			const stat = await fs.stat(entryPath);
			latest = Math.max(latest, stat.mtimeMs);
			if (entry.isDirectory()) {
				stack.push(entryPath);
			}
		}
	}

	return latest;
}

async function allRuntimePackagesPresent(input: {
	root: string;
	requiredPackages: readonly string[];
}): Promise<boolean> {
	const requireFromRoot = createRequire(path.resolve(input.root, "package.json"));
	return input.requiredPackages.every((name) => {
		try {
			requireFromRoot.resolve(`${name}/package.json`);
			return true;
		} catch {
			return false;
		}
	});
}

async function requiredBuildArtifactsPresent(buildDir: string): Promise<boolean> {
	const artifactPaths = REQUIRED_BUILD_ARTIFACTS.map((relativePath) =>
		path.resolve(buildDir, relativePath),
	);
	const existsList = await Promise.all(artifactPaths.map(pathExists));
	return existsList.every(Boolean);
}

export async function getTargetBuildManifestStatus(input: {
	root: string;
	requiredPackages: readonly string[];
	workspaceRoot?: string;
}): Promise<TargetBuildManifestStatus> {
	const root = path.resolve(input.root);
	const manifestPath = createManifestFilePath(root, input.workspaceRoot);
	const manifest = await readManifest(manifestPath);

	if (!manifest) {
		return {
			valid: false,
			reason: "manifest-missing-or-invalid",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	if (manifest.targetRoot !== root) {
		return {
			valid: false,
			reason: "manifest-target-root-mismatch",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	const buildDir = await resolveNextBuildDir(root);
	if (manifest.buildDir !== buildDir) {
		return {
			valid: false,
			reason: "manifest-build-dir-mismatch",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	const expectedPackages = normalizeRequiredPackages(input.requiredPackages);
	const manifestPackages = normalizeRequiredPackages(manifest.requiredPackages);
	if (expectedPackages.join(",") !== manifestPackages.join(",")) {
		return {
			valid: false,
			reason: "manifest-required-packages-mismatch",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	if (
		!(await allRuntimePackagesPresent({
			root,
			requiredPackages: input.requiredPackages,
		}))
	) {
		return {
			valid: false,
			reason: "runtime-packages-missing",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	const buildMarkerPath = path.resolve(buildDir, "BUILD_ID");
	if (!(await pathExists(buildMarkerPath))) {
		return {
			valid: false,
			reason: "build-marker-missing",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	if (!(await requiredBuildArtifactsPresent(buildDir))) {
		return {
			valid: false,
			reason: "build-artifacts-missing",
			manifestPath,
			latestSourceMtimeMs: 0,
			buildMarkerMtimeMs: null,
		};
	}

	const [latestSourceMtimeMs, buildMarkerStat] = await Promise.all([
		collectLatestMtimeMs(root),
		fs.stat(buildMarkerPath),
	]);
	if (latestSourceMtimeMs > buildMarkerStat.mtimeMs) {
		return {
			valid: false,
			reason: "build-stale",
			manifestPath,
			latestSourceMtimeMs,
			buildMarkerMtimeMs: buildMarkerStat.mtimeMs,
		};
	}

	return {
		valid: true,
		reason: "manifest-valid",
		manifestPath,
		latestSourceMtimeMs,
		buildMarkerMtimeMs: buildMarkerStat.mtimeMs,
	};
}

export async function writeTargetBuildManifest(input: {
	root: string;
	requiredPackages: readonly string[];
	workspaceRoot?: string;
}): Promise<string | null> {
	const root = path.resolve(input.root);
	const manifestPath = createManifestFilePath(root, input.workspaceRoot);
	const buildDir = await resolveNextBuildDir(root);
	const buildMarkerPath = path.resolve(buildDir, "BUILD_ID");
	if (!(await pathExists(buildMarkerPath))) {
		return null;
	}
	const [latestSourceMtimeMs, buildMarkerStat] = await Promise.all([
		collectLatestMtimeMs(root),
		fs.stat(buildMarkerPath),
	]);

	const payload: TargetBuildManifest = {
		version: TARGET_BUILD_MANIFEST_VERSION,
		targetRoot: root,
		buildDir,
		requiredPackages: normalizeRequiredPackages(input.requiredPackages),
		latestSourceMtimeMs,
		buildMarkerMtimeMs: buildMarkerStat.mtimeMs,
		preparedAt: new Date().toISOString(),
	};

	await fs.mkdir(path.dirname(manifestPath), { recursive: true });
	await fs.writeFile(
		`${manifestPath}.tmp`,
		JSON.stringify(payload, null, 2),
		"utf8",
	);
	await fs.rename(`${manifestPath}.tmp`, manifestPath);
	return manifestPath;
}
