export type StressRecord = {
	target: string;
	operation: string;
	latencyMs: number;
	ok: boolean;
	errorType?: string;
	extra?: Record<string, unknown>;
};

export type OperationSummary = {
	target: string;
	operation: string;
	total: number;
	success: number;
	failure: number;
	successRate: number;
	p50Ms: number;
	p95Ms: number;
	throughputRps: number;
	errorTypes: Record<string, number>;
};

function clampPercentile(value: number): number {
	if (!Number.isFinite(value)) {
		return 0.5;
	}
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

export function percentile(latencies: number[], p: number): number {
	if (latencies.length === 0) {
		return 0;
	}

	const sorted = [...latencies].sort((a, b) => a - b);
	const rank = clampPercentile(p) * (sorted.length - 1);
	const lowerIndex = Math.floor(rank);
	const upperIndex = Math.ceil(rank);

	if (lowerIndex === upperIndex) {
		return Number(sorted[lowerIndex]?.toFixed(2) ?? 0);
	}

	const lowerValue = sorted[lowerIndex] ?? 0;
	const upperValue = sorted[upperIndex] ?? lowerValue;
	const weight = rank - lowerIndex;
	return Number((lowerValue + (upperValue - lowerValue) * weight).toFixed(2));
}

function safeDurationSeconds(durationMs: number): number {
	return Math.max(durationMs, 1) / 1_000;
}

export function summarizeByOperation(input: {
	records: StressRecord[];
	elapsedMs: number;
}): OperationSummary[] {
	const groups = new Map<string, StressRecord[]>();

	for (const record of input.records) {
		const key = `${record.target}::${record.operation}`;
		const current = groups.get(key) ?? [];
		current.push(record);
		groups.set(key, current);
	}

	const elapsedSeconds = safeDurationSeconds(input.elapsedMs);

	return Array.from(groups.entries())
		.map(([key, records]) => {
			const [target, operation] = key.split("::");
			const latencies = records.map((record) => record.latencyMs);
			const success = records.filter((record) => record.ok).length;
			const failure = records.length - success;
			const errorTypes: Record<string, number> = {};

			for (const record of records) {
				if (record.ok) {
					continue;
				}
				const bucket = record.errorType || "UNKNOWN_ERROR";
				errorTypes[bucket] = (errorTypes[bucket] ?? 0) + 1;
			}

			return {
				target,
				operation,
				total: records.length,
				success,
				failure,
				successRate: Number(
					((success / Math.max(records.length, 1)) * 100).toFixed(2),
				),
				p50Ms: percentile(latencies, 0.5),
				p95Ms: percentile(latencies, 0.95),
				throughputRps: Number((records.length / elapsedSeconds).toFixed(2)),
				errorTypes,
			} satisfies OperationSummary;
		})
		.sort(
			(a, b) =>
				a.target.localeCompare(b.target) ||
				a.operation.localeCompare(b.operation),
		);
}

export function formatErrorTypes(errorTypes: Record<string, number>): string {
	const entries = Object.entries(errorTypes);
	if (entries.length === 0) {
		return "-";
	}
	return entries
		.sort((a, b) => b[1] - a[1])
		.map(([key, count]) => `${key}:${count}`)
		.join(",");
}
