import type { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { type LogTailBuffer, normalizeReason } from "./logging.js";
import type { NextSmokeProbeResult } from "./types.js";
import {
	DEFAULT_PROBE_INTERVAL_MS,
	DEFAULT_PROBE_TIMEOUT_MS,
} from "./types.js";

type ChildProcessHandle = ReturnType<typeof spawn>;
export const MIN_PROBE_TIMEOUT_MS = 1_000;
export const MIN_PROBE_INTERVAL_MS = 50;

function normalizeProbeTimingMs(input: {
	value: number;
	fallbackMs: number;
	minMs: number;
	fieldName: "probeTimeoutMs" | "probeIntervalMs";
	logs: LogTailBuffer;
}): number {
	if (
		!Number.isFinite(input.value) ||
		!Number.isInteger(input.value) ||
		input.value <= 0
	) {
		input.logs.append(
			"probe",
			`${input.fieldName} invalid (${String(input.value)}), falling back to ${input.fallbackMs}ms.`,
		);
		return input.fallbackMs;
	}
	if (input.value < input.minMs) {
		input.logs.append(
			"probe",
			`${input.fieldName} too small (${input.value}ms), clamped to ${input.minMs}ms.`,
		);
		return input.minMs;
	}
	return input.value;
}

export function normalizeProbeTimings(input: {
	timeoutMs: number;
	intervalMs: number;
	logs: LogTailBuffer;
}): { timeoutMs: number; intervalMs: number } {
	const timeoutMs = normalizeProbeTimingMs({
		value: input.timeoutMs,
		fallbackMs: DEFAULT_PROBE_TIMEOUT_MS,
		minMs: MIN_PROBE_TIMEOUT_MS,
		fieldName: "probeTimeoutMs",
		logs: input.logs,
	});
	const normalizedInterval = normalizeProbeTimingMs({
		value: input.intervalMs,
		fallbackMs: DEFAULT_PROBE_INTERVAL_MS,
		minMs: MIN_PROBE_INTERVAL_MS,
		fieldName: "probeIntervalMs",
		logs: input.logs,
	});
	const intervalMs = Math.min(normalizedInterval, timeoutMs);
	if (intervalMs !== normalizedInterval) {
		input.logs.append(
			"probe",
			`probeIntervalMs (${normalizedInterval}ms) exceeded probeTimeoutMs (${timeoutMs}ms), clamped to ${intervalMs}ms.`,
		);
	}
	return {
		timeoutMs,
		intervalMs,
	};
}

export function createSkippedProbe(
	url: string,
	reason: string,
): NextSmokeProbeResult {
	return {
		ok: false,
		url,
		statusCode: null,
		durationMs: 0,
		detail: reason,
	};
}

export async function probeServer(input: {
	url: string;
	timeoutMs: number;
	intervalMs: number;
	child: ChildProcessHandle;
	logs: LogTailBuffer;
}): Promise<NextSmokeProbeResult> {
	const probeTimings = normalizeProbeTimings({
		timeoutMs: input.timeoutMs,
		intervalMs: input.intervalMs,
		logs: input.logs,
	});
	const startedAt = Date.now();
	let lastError = "No response received.";

	while (Date.now() - startedAt <= probeTimings.timeoutMs) {
		if (input.child.exitCode !== null || input.child.signalCode !== null) {
			lastError = `Start process exited before probe succeeded (exit=${String(input.child.exitCode)}, signal=${String(input.child.signalCode)}).`;
			break;
		}

		try {
			const elapsed = Date.now() - startedAt;
			const remaining = Math.max(1, probeTimings.timeoutMs - elapsed);
			const response = await fetch(input.url, {
				signal: AbortSignal.timeout(Math.min(1_000, remaining)),
			});

			if (response.ok) {
				return {
					ok: true,
					url: input.url,
					statusCode: response.status,
					durationMs: Date.now() - startedAt,
					detail: `Probe succeeded with status ${response.status}.`,
				};
			}

			lastError = `HTTP ${response.status}`;
			input.logs.append("probe", `HTTP probe returned ${response.status}.`);
		} catch (error) {
			lastError = normalizeReason(error);
			input.logs.append("probe", `Probe attempt failed: ${lastError}`);
		}

		await delay(probeTimings.intervalMs);
	}

	return {
		ok: false,
		url: input.url,
		statusCode: null,
		durationMs: Date.now() - startedAt,
		detail: `Probe timed out after ${probeTimings.timeoutMs}ms. Last error: ${lastError}`,
	};
}
