import type { ShipPayloadBase, ShipSummary } from "./types.js";

export function buildSummary(
	payload: ShipPayloadBase,
	idempotencyHit: boolean,
): ShipSummary {
	if (payload.apply.rolledBack) {
		return {
			filesCount: payload.files.length,
			changedPaths: [],
			qualityGate: payload.quality.passed,
			status: payload.quality.passed ? "success" : "quality_failed",
			idempotencyHit,
		};
	}

	const changedPaths =
		payload.apply.written && payload.apply.written.length > 0
			? payload.apply.written
			: payload.files.map((file) => file.path);

	return {
		filesCount: payload.files.length,
		changedPaths,
		qualityGate: payload.quality.passed,
		status: payload.quality.passed ? "success" : "quality_failed",
		idempotencyHit,
	};
}
