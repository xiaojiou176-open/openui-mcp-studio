import path from "node:path";
import type { AcceptanceEvaluation, AcceptancePack } from "../../../../packages/contracts/src/acceptance-pack.js";
import type { ChangePlan, ReviewBundle } from "../../../../packages/contracts/src/review-bundle.js";
import type { WorkspaceProfile } from "../../../../packages/contracts/src/workspace-profile.js";
import { resolveRuntimeRunId, resolveRuntimeRunRoot } from "../../../../packages/runtime-observability/src/run-context.js";
import { isPathInsideRootWithRealpath, normalizePath } from "../../../../packages/shared-runtime/src/path-utils.js";
import {
	readWorkspaceFileIfExistsNoFollow,
	writeWorkspaceFileNoFollow,
} from "../file-ops.js";
import { buildReviewBundleMarkdown } from "../review-bundle.js";

function sanitizeArtifactName(name: string): string {
	const normalized = name.trim().toLowerCase();
	if (!/^[a-z0-9._-]+$/u.test(normalized)) {
		throw new Error(`Invalid artifact name: ${JSON.stringify(name)}.`);
	}
	if (normalized === "." || normalized === ".." || normalized.includes("..")) {
		throw new Error(`Invalid artifact name: ${JSON.stringify(name)}.`);
	}
	return normalized;
}

function sanitizeArtifactSegment(segment: string): string {
	const normalized = segment.trim().toLowerCase();
	if (!/^[a-z0-9._-]+$/u.test(normalized)) {
		throw new Error(`Invalid artifact segment: ${JSON.stringify(segment)}.`);
	}
	if (normalized === "." || normalized === ".." || normalized.includes("..")) {
		throw new Error(`Invalid artifact segment: ${JSON.stringify(segment)}.`);
	}
	return normalized;
}

function normalizeArtifactSubdir(subdirSegments?: string[]): string[] {
	return (subdirSegments || []).map((segment) => sanitizeArtifactSegment(segment));
}

export function resolveRunArtifactRelativePath(
	name: string,
	subdirSegments?: string[],
): string {
	const runId = resolveRuntimeRunId(process.env);
	const safeName = sanitizeArtifactName(name);
	const safeSubdir = normalizeArtifactSubdir(subdirSegments);
	return normalizePath(
		path.join(
			".runtime-cache",
			"runs",
			runId,
			"artifacts",
			"openui",
			...safeSubdir,
			safeName,
		),
	);
}

export function resolveRunArtifactDirectoryRelativePath(
	subdirSegments?: string[],
): string {
	const runId = resolveRuntimeRunId(process.env);
	const safeSubdir = normalizeArtifactSubdir(subdirSegments);
	return normalizePath(
		path.join(".runtime-cache", "runs", runId, "artifacts", "openui", ...safeSubdir),
	);
}

export async function writeRunArtifactJson(input: {
	workspaceRoot: string;
	name: string;
	payload: unknown;
	subdirSegments?: string[];
}): Promise<string | undefined> {
	const resolvedRoot = path.resolve(input.workspaceRoot);
	const runRoot = resolveRuntimeRunRoot(resolvedRoot, resolveRuntimeRunId(process.env));
	if (!isPathInsideRootWithRealpath(resolvedRoot, runRoot)) {
		return undefined;
	}
	const relativePath = resolveRunArtifactRelativePath(
		`${input.name}.json`,
		input.subdirSegments,
	);
	await writeWorkspaceFileNoFollow({
		targetRoot: resolvedRoot,
		filePath: relativePath,
		content: JSON.stringify(input.payload, null, 2),
	});
	return relativePath;
}

export async function writeRunArtifactText(input: {
	workspaceRoot: string;
	name: string;
	text: string;
	subdirSegments?: string[];
}): Promise<string | undefined> {
	const resolvedRoot = path.resolve(input.workspaceRoot);
	const runRoot = resolveRuntimeRunRoot(resolvedRoot, resolveRuntimeRunId(process.env));
	if (!isPathInsideRootWithRealpath(resolvedRoot, runRoot)) {
		return undefined;
	}
	const relativePath = resolveRunArtifactRelativePath(
		`${input.name}.md`,
		input.subdirSegments,
	);
	await writeWorkspaceFileNoFollow({
		targetRoot: resolvedRoot,
		filePath: relativePath,
		content: input.text,
	});
	return relativePath;
}

export async function readRunArtifactText(input: {
	workspaceRoot: string;
	name: string;
	subdirSegments?: string[];
}): Promise<string | null> {
	const resolvedRoot = path.resolve(input.workspaceRoot);
	return readWorkspaceFileIfExistsNoFollow({
		targetRoot: resolvedRoot,
		filePath: resolveRunArtifactRelativePath(
			`${input.name}.md`,
			input.subdirSegments,
		),
	});
}

export async function writeDeliveryArtifacts(input: {
	workspaceRoot: string;
	subdirSegments?: string[];
	workspaceProfile?: WorkspaceProfile;
	changePlan?: ChangePlan;
	acceptancePack?: AcceptancePack;
	acceptanceEvaluation?: AcceptanceEvaluation;
	reviewBundle?: ReviewBundle;
	extraJsonArtifacts?: Record<string, unknown>;
}): Promise<Record<string, string>> {
	const artifacts: Record<string, string> = {};

	async function writeJsonArtifact(key: string, name: string, payload: unknown) {
		const artifactPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			subdirSegments: input.subdirSegments,
			name,
			payload,
		});
		if (artifactPath) {
			artifacts[key] = artifactPath;
		}
	}

	if (input.workspaceProfile) {
		await writeJsonArtifact("workspaceProfile", "workspace-profile", input.workspaceProfile);
	}
	if (input.changePlan) {
		await writeJsonArtifact("changePlan", "change-plan", input.changePlan);
	}
	if (input.acceptancePack) {
		await writeJsonArtifact("acceptancePack", "acceptance-pack", input.acceptancePack);
	}
	if (input.acceptanceEvaluation) {
		await writeJsonArtifact(
			"acceptanceResult",
			"acceptance-result",
			input.acceptanceEvaluation,
		);
	}
	if (input.reviewBundle) {
		const jsonPath = await writeRunArtifactJson({
			workspaceRoot: input.workspaceRoot,
			subdirSegments: input.subdirSegments,
			name: "review-bundle",
			payload: input.reviewBundle,
		});
		const markdownPath = await writeRunArtifactText({
			workspaceRoot: input.workspaceRoot,
			subdirSegments: input.subdirSegments,
			name: "review-bundle",
			text: buildReviewBundleMarkdown(input.reviewBundle),
		});
		if (jsonPath) {
			artifacts.reviewBundle = jsonPath;
		}
		if (markdownPath) {
			artifacts.reviewBundleMarkdown = markdownPath;
		}
	}

	for (const [key, payload] of Object.entries(input.extraJsonArtifacts || {})) {
		await writeJsonArtifact(key, key, payload);
	}

	return artifacts;
}
