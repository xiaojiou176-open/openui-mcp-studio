#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
	buildReportFileNames,
	buildSpaceGovernanceContext,
	describeRepoLocalPath,
	isCanonicalRuntimePath,
} from "./shared/space-governance.mjs";
import { isPathOutsideRoot, toPosixPath } from "./shared/governance-utils.mjs";

function hasKnownRebuildPath(relativePath) {
	return [
		".runtime-cache/go-mod",
		".runtime-cache/precommit-full-home",
		"$HOME",
		"$HOME/.cache/pre-commit",
	].includes(String(relativePath));
}

function countActiveRefs(targetPath) {
	try {
		const stdout = execFileSync("lsof", ["+D", targetPath], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const lines = stdout
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
		return {
			known: true,
			count: Math.max(lines.length - 1, 0),
			error: null,
		};
	} catch (error) {
		const stdout =
			typeof error?.stdout === "string" ? error.stdout.trim() : "";
		const stderr =
			typeof error?.stderr === "string" ? error.stderr.trim() : "";
		if (error && typeof error === "object" && "status" in error) {
			const status = Number(error.status);
			if (status === 1 && stdout === "" && stderr === "") {
				return {
					known: true,
					count: 0,
					error: null,
				};
			}
		}
		return {
			known: false,
			count: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function formatStatusMarkdown(report) {
	const lines = [
		"# Space Verification Candidates",
		"",
		`- Generated at: ${report.generatedAt}`,
		"",
		"| Path | Exists | Active refs known | Active refs | Rebuild path known | Eligible |",
		"| --- | --- | --- | ---: | --- | --- |",
		...report.candidates.map(
			(entry) =>
				`| ${entry.path} | ${entry.exists ? "yes" : "no"} | ${entry.activeRefsKnown ? "yes" : "no"} | ${entry.activeRefs} | ${entry.rebuildPathKnown ? "yes" : "no"} | ${entry.eligibleForCleanup ? "yes" : "no"} |`,
		),
	];
	return lines.join("\n");
}

async function collectSpaceVerificationCandidates(options = {}) {
	const context = options.contract
		? options
		: await buildSpaceGovernanceContext(options);
	const activeRefCounter =
		typeof options.activeRefCounter === "function"
			? options.activeRefCounter
			: countActiveRefs;
	const candidates = [];
	const workspaceRealRoot = await fs.realpath(context.rootDir);
	for (const entry of context.contract.verificationCandidates ?? []) {
		const relativePath = String(entry?.path ?? "").trim();
		if (!relativePath) {
			continue;
		}
		const detail = await describeRepoLocalPath(context.rootDir, relativePath);
		const activeRefs =
			detail.exists && detail.isDirectory
				? await activeRefCounter(detail.absolutePath)
				: {
						known: true,
						count: 0,
						error: null,
					};
		const canonical = isCanonicalRuntimePath(relativePath, context.registry);
		const rebuildPathKnown = hasKnownRebuildPath(relativePath);
		const insideWorkspace = !isPathOutsideRoot(
			workspaceRealRoot,
			detail.realPath,
		);
		const eligibleForCleanup =
			detail.exists &&
			!canonical &&
			activeRefs.known &&
			activeRefs.count === 0 &&
			rebuildPathKnown &&
			insideWorkspace;
		candidates.push({
			path: relativePath,
			reason: String(entry?.reason ?? "").trim(),
			exists: detail.exists,
			canonical,
			activeRefs: activeRefs.count,
			activeRefsKnown: activeRefs.known,
			activeRefsError: activeRefs.error,
			insideWorkspace,
			rebuildPathKnown,
			eligibleForCleanup,
			sizeBytes: detail.sizeBytes,
			sizeHuman: detail.sizeHuman,
		});
	}
	return candidates;
}

async function generateSpaceVerificationReport(options = {}) {
	const context = await buildSpaceGovernanceContext(options);
	const candidates = await collectSpaceVerificationCandidates({
		rootDir: context.rootDir,
		contractPath: context.contractPath,
		registryPath: context.registryPath,
		contract: context.contract,
		registry: context.registry,
		activeRefCounter: options.activeRefCounter,
	});
	const report = {
		generatedAt: new Date().toISOString(),
		rootDir: context.rootDir,
		candidates,
	};

	const outputRoot = path.resolve(
		context.rootDir,
		String(context.contract.reportRoot ?? ".runtime-cache/reports/space-governance"),
	);
	await fs.mkdir(outputRoot, { recursive: true });
	const fileNames = buildReportFileNames(options.label ?? "verified-candidates");
	const jsonPath = path.join(outputRoot, fileNames.jsonName);
	const markdownPath = path.join(outputRoot, fileNames.markdownName);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${formatStatusMarkdown(report)}\n`, "utf8"),
	]);

	return { report, jsonPath, markdownPath };
}

async function runSpaceVerifyCandidatesCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const result = await generateSpaceVerificationReport(options);
		stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					reportPath: toPosixPath(
						path.relative(process.cwd(), result.jsonPath),
					),
					markdownPath: toPosixPath(
						path.relative(process.cwd(), result.markdownPath),
					),
					candidates: result.report.candidates,
				},
				null,
				2,
			)}\n`,
		);
		return 0;
	} catch (error) {
		stderr.write(
			`Space verification report failed: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runSpaceVerifyCandidatesCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	collectSpaceVerificationCandidates,
	generateSpaceVerificationReport,
	runSpaceVerifyCandidatesCli,
};
