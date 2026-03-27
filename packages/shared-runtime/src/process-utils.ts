import { type StdioOptions, spawn } from "node:child_process";

export type RunProcessInput = {
	command: string;
	args: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdio?: StdioOptions;
	timeoutMs: number;
	killSignal?: NodeJS.Signals;
	forceKillAfterMs?: number;
	maxStdoutBytes?: number;
	maxStderrBytes?: number;
};

export type RunProcessResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
	timedOut: boolean;
	signal: NodeJS.Signals | null;
	errorMessage: string | null;
};

const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 45_000;
const TRUNCATED_MARKER = "\n[truncated]\n";

function resolvePositiveInteger(
	value: number | undefined,
	fallback: number,
): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		return fallback;
	}
	return value;
}

function appendChunkWithLimit(
	current: string,
	chunk: Buffer | string,
	maxBytes: number,
): { value: string; truncated: boolean } {
	const availableBytes = maxBytes - Buffer.byteLength(current);
	if (availableBytes <= 0) {
		return { value: current, truncated: true };
	}

	const chunkBuffer = Buffer.isBuffer(chunk)
		? chunk
		: Buffer.from(String(chunk));
	if (chunkBuffer.byteLength <= availableBytes) {
		return {
			value: current + chunkBuffer.toString("utf8"),
			truncated: false,
		};
	}

	return {
		value: current + chunkBuffer.subarray(0, availableBytes).toString("utf8"),
		truncated: true,
	};
}

export async function runProcess(
	input: RunProcessInput,
): Promise<RunProcessResult> {
	return await new Promise((resolve) => {
		const startedAt = Date.now();
		let stdout = "";
		let stderr = "";
		const timeoutMs = resolvePositiveInteger(
			input.timeoutMs,
			DEFAULT_TIMEOUT_MS,
		);
		const maxStdoutBytes = resolvePositiveInteger(
			input.maxStdoutBytes,
			DEFAULT_MAX_OUTPUT_BYTES,
		);
		const maxStderrBytes = resolvePositiveInteger(
			input.maxStderrBytes,
			DEFAULT_MAX_OUTPUT_BYTES,
		);
		let stdoutTruncated = false;
		let stderrTruncated = false;
		let timedOut = false;
		let settled = false;
		let errorMessage: string | null = null;
		let forceKillTimer: NodeJS.Timeout | undefined;

		const child = spawn(input.command, input.args, {
			cwd: input.cwd,
			env: input.env,
			stdio: input.stdio ?? ["ignore", "pipe", "pipe"],
			detached: true,
		});

		const finalize = (result: RunProcessResult) => {
			if (settled) {
				return;
			}

			settled = true;
			clearTimeout(timeoutId);
			if (forceKillTimer) {
				clearTimeout(forceKillTimer);
			}
			resolve(result);
		};

		const timeoutId = setTimeout(() => {
			timedOut = true;
			try {
				if (child.pid) {
					process.kill(-child.pid, input.killSignal ?? "SIGTERM");
				}
			} catch {
				child.kill(input.killSignal ?? "SIGTERM");
			}

			const forceKillAfterMs = resolvePositiveInteger(
				input.forceKillAfterMs,
				1_000,
			);
			forceKillTimer = setTimeout(() => {
				try {
					if (child.pid) {
						process.kill(-child.pid, "SIGKILL");
					}
				} catch {
					child.kill("SIGKILL");
				}
			}, forceKillAfterMs);
		}, timeoutMs);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			const next = appendChunkWithLimit(stdout, chunk, maxStdoutBytes);
			stdout = next.value;
			stdoutTruncated = stdoutTruncated || next.truncated;
		});

		child.stderr?.on("data", (chunk: Buffer | string) => {
			const next = appendChunkWithLimit(stderr, chunk, maxStderrBytes);
			stderr = next.value;
			stderrTruncated = stderrTruncated || next.truncated;
		});

		child.on("error", (error) => {
			errorMessage = error instanceof Error ? error.message : String(error);
			const normalizedStdout = stdoutTruncated
				? `${stdout}${TRUNCATED_MARKER}`
				: stdout;
			const normalizedStderr = stderrTruncated
				? `${stderr}${TRUNCATED_MARKER}`
				: stderr;
			finalize({
				exitCode: 1,
				stdout: normalizedStdout,
				stderr: normalizedStderr,
				durationMs: Date.now() - startedAt,
				timedOut,
				signal: null,
				errorMessage,
			});
		});

		child.on("close", (code, signal) => {
			const normalizedStdout = stdoutTruncated
				? `${stdout}${TRUNCATED_MARKER}`
				: stdout;
			const normalizedStderr = stderrTruncated
				? `${stderr}${TRUNCATED_MARKER}`
				: stderr;
			finalize({
				exitCode: typeof code === "number" ? code : 1,
				stdout: normalizedStdout,
				stderr: normalizedStderr,
				durationMs: Date.now() - startedAt,
				timedOut,
				signal,
				errorMessage,
			});
		});
	});
}
