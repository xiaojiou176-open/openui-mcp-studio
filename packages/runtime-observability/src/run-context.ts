import path from "node:path";

export const DEFAULT_RUNTIME_ROOT = ".runtime-cache";
export const DEFAULT_RUNS_ROOT = ".runtime-cache/runs";
export const DEFAULT_LOG_CHANNELS = ["runtime", "tests", "ci", "upstream"] as const;

export type RuntimeLogChannel = (typeof DEFAULT_LOG_CHANNELS)[number];

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;

export function sanitizeRunId(runId: string): string {
	const candidate = runId.trim();
	if (!RUN_ID_PATTERN.test(candidate)) {
		throw new Error(`Invalid run id: ${JSON.stringify(runId)}.`);
	}
	return candidate;
}

export function resolveRuntimeRunId(env: NodeJS.ProcessEnv = process.env): string {
	const explicit =
		env.OPENUI_RUNTIME_RUN_ID?.trim() || env.OPENUI_CI_GATE_RUN_KEY?.trim();
	if (explicit) {
		return sanitizeRunId(explicit);
	}
	return sanitizeRunId(`mcp-runtime-${process.pid}`);
}

export function resolveRuntimeRunRoot(
	workspaceRoot: string,
	runId: string,
): string {
	return path.resolve(workspaceRoot, DEFAULT_RUNS_ROOT, sanitizeRunId(runId));
}

export function resolveRuntimeLogFilePath(
	workspaceRoot: string,
	runId: string,
	channel: RuntimeLogChannel = "runtime",
): string {
	const safeRunId = sanitizeRunId(runId);
	return path.resolve(
		workspaceRoot,
		DEFAULT_RUNS_ROOT,
		safeRunId,
		"logs",
		`${channel}.jsonl`,
	);
}

