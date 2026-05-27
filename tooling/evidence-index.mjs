import { mkdir, readdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readJsonFile } from "./shared/governance-utils.mjs";
import { resolveRunLayout } from "./shared/run-layout.mjs";

// Evidence indices are run-scoped under .runtime-cache/runs/<run_id>/evidence/index.json.
const DEFAULT_ARTIFACT_DIRECTORIES = [
	"artifacts/playwright",
	"artifacts/playwright-firefox",
	"artifacts/playwright-webkit",
	"artifacts/visual",
];

function classifyTask(task) {
	const explicitCategory = String(task?.category ?? "").trim().toLowerCase();
	if (explicitCategory) {
		return explicitCategory;
	}
	const taskId = String(task?.id ?? "");
	const command = String(task?.command ?? "");
	const stdout = String(task?.stdout ?? "");
	const stderr = String(task?.stderr ?? "");
	const combined = `${taskId} ${command} ${stdout} ${stderr}`.toLowerCase();

	if (combined.includes("upstream")) {
		return "upstream";
	}
	if (
		combined.includes("playwright") ||
		combined.includes("visual") ||
		combined.includes("test") ||
		combined.includes("smoke")
	) {
		return "test";
	}
	if (
		combined.includes("env") ||
		combined.includes("lint") ||
		combined.includes("workflow") ||
		combined.includes("iac") ||
		combined.includes("resource")
	) {
		return "infra";
	}
	return "business";
}

async function listJsonlLogFiles(logDir) {
	try {
		const entries = await readdir(logDir, { withFileTypes: true });
		return entries
			.filter(
				(entry) =>
					entry.isFile() &&
					(entry.name.endsWith(".jsonl") || entry.name.endsWith(".log")),
			)
			.map((entry) => path.join(logDir, entry.name));
	} catch {
		return [];
	}
}

async function listExistingArtifactDirectories(rootDir, directories) {
	const results = [];
	for (const directory of directories) {
		const absolutePath = path.resolve(rootDir, directory);
		try {
			const directoryStat = await stat(absolutePath);
			if (!directoryStat.isDirectory()) {
				continue;
			}
			results.push({
				path: directory,
				exists: true,
			});
		} catch {
			results.push({
				path: directory,
				exists: false,
			});
		}
	}
	return results;
}

function buildClassification(summary) {
	let businessFailureCount = 0;
	let testFailureCount = 0;
	let infraFailureCount = 0;
	let upstreamFailureCount = 0;

	for (const stage of summary.stages ?? []) {
		for (const task of stage.tasks ?? []) {
			if (task.status !== "failed" && task.status !== "warning") {
				continue;
			}
			const classification = classifyTask(task);
			if (classification === "business") {
				businessFailureCount += 1;
			} else if (classification === "test") {
				testFailureCount += 1;
			} else if (classification === "infra") {
				infraFailureCount += 1;
			} else if (classification === "upstream") {
				upstreamFailureCount += 1;
			}
		}
	}

	return {
		businessFailureCount,
		testFailureCount,
		infraFailureCount,
		upstreamFailureCount,
	};
}

function buildStageResults(summary) {
	return (summary.stages ?? []).map((stage) => {
		const tasks = Array.isArray(stage.tasks) ? stage.tasks : [];
		const hasFailure = tasks.some((task) => task.status === "failed");
		const hasWarning = tasks.some((task) => task.status === "warning");
		return {
			stageId: String(stage.id ?? stage.stageId ?? ""),
			status: hasFailure ? "failed" : hasWarning ? "warning" : "passed",
			taskCount: tasks.length,
		};
	});
}

async function buildEvidenceIndex(options) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const layout = await resolveRunLayout({
		rootDir,
		runId: options.runId ?? options.summary?.runId,
	});
	const summaryPath = path.resolve(rootDir, options.summaryPath ?? layout.summaryPathRelative);
	const summary = options.summary ?? (await readJsonFile(summaryPath));
	const qualityScorePath = path.resolve(
		rootDir,
		options.qualityScorePath ?? layout.qualityScorePathRelative,
	);
	const logDir = path.resolve(rootDir, layout.logRootRelative);

	const logPaths = (await listJsonlLogFiles(logDir)).map((filePath) =>
		path.relative(rootDir, filePath).split(path.sep).join("/"),
	);
	const artifactDirectories = await listExistingArtifactDirectories(
		rootDir,
		(options.artifactDirectories ?? DEFAULT_ARTIFACT_DIRECTORIES).map((directory) =>
			path.posix.join(layout.runRootRelative, directory),
		),
	);

	return {
		runId: layout.runId,
		runRoot: layout.runRootRelative,
		generatedAt: new Date().toISOString(),
		runManifestPath: layout.runManifestPathRelative,
		summaryPath: path.relative(rootDir, summaryPath).split(path.sep).join("/"),
		qualityScorePath: path
			.relative(rootDir, qualityScorePath)
			.split(path.sep)
			.join("/"),
		logPaths,
		artifactDirectories,
		classification: buildClassification(summary),
		stageResults: buildStageResults(summary),
		toolchainFingerprint: `${process.platform}-${process.arch}-node-${process.version}`,
		upstreamSnapshotIds: ["gemini-api", "openui-upstream-reference", "ghcr-ci-image"],
	};
}

async function writeEvidenceIndex(options) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const index = await buildEvidenceIndex(options);
	const evidenceRoot = path.resolve(rootDir, index.runRoot, "evidence");
	await mkdir(evidenceRoot, { recursive: true });
	const evidenceRootRealPath = await realpath(evidenceRoot);
	const outputPath = path.join(evidenceRootRealPath, "index.json");
	await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
	return {
		index,
		outputPath: path.relative(rootDir, outputPath).split(path.sep).join("/"),
	};
}

export { buildEvidenceIndex, writeEvidenceIndex };
