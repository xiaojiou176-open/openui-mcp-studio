import crypto from "node:crypto";
import path from "node:path";
import type { FunctionResponseInput } from "../providers/types.js";
import type { ShipPayloadBase } from "./types.js";

export function deriveImplicitIdempotencyKey(input: {
	prompt: string;
	styleGuide?: string;
	requestedUiImportBase?: string;
	resolvedUiImportBase?: string;
	pagePath: string;
	componentsDir: string;
	workspaceRoot: string;
	model?: string;
	thinkingLevel?: "low" | "high";
	includeThoughts?: boolean;
	responseMimeType?: string;
	responseJsonSchema?: Record<string, unknown>;
	tools?: Array<Record<string, unknown>>;
	toolChoice?: string | Record<string, unknown>;
	functionResponses?: FunctionResponseInput[];
	cachedContent?: string;
	cacheTtlSeconds?: number;
	mediaResolution?: "low" | "medium" | "high" | "ultra_high";
	uiuxScore?: number;
	uiuxThreshold?: number;
	dryRun: boolean;
	runCommands: boolean;
	acceptanceCriteria?: string[];
	responsiveRequirements?: string[];
	a11yRequirements?: string[];
	visualRequirements?: string[];
	manualReviewItems?: string[];
}): string {
	const payload = JSON.stringify({
		...input,
		workspaceRoot: path.resolve(input.workspaceRoot),
	});
	return crypto.createHash("sha256").update(payload).digest("hex");
}

type PipelineResult = {
	payload: ShipPayloadBase;
	idempotencyHit: boolean;
};

type SingleFlightResult<T> = {
	value: T;
	shared: boolean;
};

const PIPELINE_SAFETY_TIMEOUT_MS = 300_000;
const inflightByIdempotencyKey = new Map<string, Promise<PipelineResult>>();

function isReusableCachedPayload(
	payload: ShipPayloadBase | undefined,
): payload is ShipPayloadBase {
	return payload !== undefined && payload.quality.passed === true;
}

async function awaitPipelineSafetyTimeout<T>(task: Promise<T>): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			task,
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error("Ship pipeline safety timeout")),
					PIPELINE_SAFETY_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	}
}

export async function runSingleFlightByKey(
	key: string,
	execute: () => Promise<PipelineResult>,
): Promise<SingleFlightResult<PipelineResult>> {
	const existing = inflightByIdempotencyKey.get(key);
	if (existing) {
		return { value: await awaitPipelineSafetyTimeout(existing), shared: true };
	}

	const task = execute();
	inflightByIdempotencyKey.set(key, task);
	const onSettled = () => {
		if (inflightByIdempotencyKey.get(key) === task) {
			inflightByIdempotencyKey.delete(key);
		}
	};
	void task.then(onSettled, onSettled);
	return {
		value: await awaitPipelineSafetyTimeout(task),
		shared: false,
	};
}

export { isReusableCachedPayload, PIPELINE_SAFETY_TIMEOUT_MS };
