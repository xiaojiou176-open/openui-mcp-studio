import { runNextSmoke as runNextSmokeImpl } from "./next-smoke/run.js";
import type {
	NextSmokeProbeResult,
	NextSmokeResult,
	NextSmokeStartResult,
	NextSmokeStepResult,
	RunNextSmokeInput,
} from "./next-smoke/types.js";

export async function runNextSmoke(
	input?: RunNextSmokeInput,
): Promise<NextSmokeResult> {
	return runNextSmokeImpl(input);
}

export type {
	NextSmokeProbeResult,
	NextSmokeResult,
	NextSmokeStartResult,
	NextSmokeStepResult,
	RunNextSmokeInput,
};
