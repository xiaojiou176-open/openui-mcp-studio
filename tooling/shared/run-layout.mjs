import fs from "node:fs/promises";
import path from "node:path";
import { readJsonFile } from "./governance-utils.mjs";

const DEFAULT_RUN_LAYOUT_PATH = "contracts/runtime/run-layout.json";
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;

function sanitizeRunId(runId) {
	const candidate = String(runId ?? "").trim();
	if (!RUN_ID_PATTERN.test(candidate)) {
		throw new Error(`Invalid run id: ${JSON.stringify(runId)}.`);
	}
	return candidate;
}

async function readRunLayout(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_RUN_LAYOUT_PATH,
	);
	const contract = await readJsonFile(contractPath);
	return { rootDir, contractPath, contract };
}

async function readRunManifestIfPresent(filePath) {
	try {
		return await readJsonFile(filePath);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

function buildRunLayout(rootDir, runId, contract) {
	const safeRunId = sanitizeRunId(runId);
	const runsRoot = String(contract.runsRoot ?? ".runtime-cache/runs");
	const runRootRelative = path.posix.join(runsRoot, safeRunId);
	const metaRootRelative = path.posix.join(runRootRelative, "meta");
	const logRootRelative = path.posix.join(runRootRelative, "logs");
	const artifactRootRelative = path.posix.join(runRootRelative, "artifacts");
	const evidenceRootRelative = path.posix.join(runRootRelative, "evidence");
	return {
		runId: safeRunId,
		runRootRelative,
		runRootAbsolute: path.resolve(rootDir, runRootRelative),
		metaRootRelative,
		runManifestPathRelative: path.posix.join(metaRootRelative, "run.json"),
		summaryPathRelative: path.posix.join(runRootRelative, "summary.json"),
		qualityScorePathRelative: path.posix.join(runRootRelative, "quality-score.json"),
		evidenceIndexPathRelative: path.posix.join(evidenceRootRelative, "index.json"),
		logRootRelative,
		artifactRootRelative,
		evidenceRootRelative,
		logPathsByChannel: Object.fromEntries(
			(Array.isArray(contract.logChannels) ? contract.logChannels : []).map((channel) => [
				String(channel),
				path.posix.join(logRootRelative, `${String(channel)}.jsonl`),
			]),
		),
	};
}

async function resolveLatestRunId(options = {}) {
	const { rootDir, contract } = await readRunLayout(options);
	const runsRootAbsolute = path.resolve(
		rootDir,
		String(contract.runsRoot ?? ".runtime-cache/runs"),
	);
	let entries;
	try {
		entries = await fs.readdir(runsRootAbsolute, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}

	const requiredRunFiles = Array.isArray(options.requiredRunFiles)
		? options.requiredRunFiles
				.map((value) => String(value).trim())
				.filter(Boolean)
		: [];
	const candidates = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}
		if (!RUN_ID_PATTERN.test(entry.name)) {
			continue;
		}
		const stat = await fs.stat(path.join(runsRootAbsolute, entry.name));
		const runRootAbsolute = path.join(runsRootAbsolute, entry.name);
		let satisfiesRequirements = true;
		for (const relativePath of requiredRunFiles) {
			try {
				await fs.access(path.join(runRootAbsolute, relativePath));
			} catch {
				satisfiesRequirements = false;
				break;
			}
		}
		if (!satisfiesRequirements) {
			continue;
		}
		if (options.requireAuthoritativeManifest === true) {
			const manifest = await readRunManifestIfPresent(
				path.join(runRootAbsolute, "meta", "run.json"),
			);
			if (!manifest || manifest.authoritative !== true) {
				continue;
			}
		}
		candidates.push({
			runId: entry.name,
			mtimeMs: stat.mtimeMs,
		});
	}

	if (candidates.length === 0) {
		return null;
	}

	candidates.sort((left, right) => {
		if (right.mtimeMs !== left.mtimeMs) {
			return right.mtimeMs - left.mtimeMs;
		}
		return right.runId.localeCompare(left.runId);
	});
	return candidates[0].runId;
}

async function describeRunSurfaceState(options = {}) {
	const { rootDir, contract } = await readRunLayout(options);
	const runsRootRelative = String(contract.runsRoot ?? ".runtime-cache/runs");
	const runsRootAbsolute = path.resolve(rootDir, runsRootRelative);
	let entries;
	try {
		entries = await fs.readdir(runsRootAbsolute, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return {
				rootDir,
				runsRootRelative,
				state: "absent",
				runDirectoryCount: 0,
			};
		}
		throw error;
	}

	const runDirectories = entries.filter(
		(entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name),
	);

	return {
		rootDir,
		runsRootRelative,
		state: runDirectories.length === 0 ? "empty" : "present",
		runDirectoryCount: runDirectories.length,
	};
}

async function resolveRunLayout(options = {}) {
	const { rootDir, contractPath, contract } = await readRunLayout(options);
	const explicitRunId =
		options.runId ??
		process.env.OPENUI_RUNTIME_RUN_ID?.trim() ??
		process.env.OPENUI_CI_GATE_RUN_KEY?.trim();
	const resolvedRunId =
		explicitRunId ||
		(options.preferLatestExistingRun
			? await resolveLatestRunId({
					rootDir,
					requiredRunFiles: options.requiredRunFiles,
					requireAuthoritativeManifest: options.requireAuthoritativeManifest,
				})
			: null);
	if (!resolvedRunId) {
		throw new Error(
			'No authoritative run id is available. Provide OPENUI_RUNTIME_RUN_ID/OPENUI_CI_GATE_RUN_KEY or generate a fresh run first.',
		);
	}
	return {
		rootDir,
		contractPath,
		contract,
		...buildRunLayout(rootDir, resolvedRunId, contract),
	};
}

export {
	DEFAULT_RUN_LAYOUT_PATH,
	buildRunLayout,
	describeRunSurfaceState,
	readRunLayout,
	resolveLatestRunId,
	resolveRunLayout,
	sanitizeRunId,
};
