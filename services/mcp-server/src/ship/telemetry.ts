import type { TelemetryStep } from "./types.js";

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

export async function runRequiredStep<T>(
	steps: TelemetryStep[],
	name: string,
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		steps.push({
			name,
			status: "ok",
			durationMs: Date.now() - start,
		});
		return result;
	} catch (error) {
		steps.push({
			name,
			status: "error",
			durationMs: Date.now() - start,
			error: toErrorMessage(error),
		});
		throw error;
	}
}

export async function runBestEffortStep<T>(
	steps: TelemetryStep[],
	name: string,
	fn: () => Promise<T>,
): Promise<T | undefined> {
	const start = Date.now();
	try {
		const result = await fn();
		steps.push({
			name,
			status: "ok",
			durationMs: Date.now() - start,
		});
		return result;
	} catch (error) {
		steps.push({
			name,
			status: "error",
			durationMs: Date.now() - start,
			error: toErrorMessage(error),
		});
		return undefined;
	}
}
