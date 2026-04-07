import { createRequire } from "node:module";
import path from "node:path";
import type {
	NextSmokeCommand,
	NextSmokeStartResult,
	NextSmokeStepResult,
} from "./types.js";

export function getNpmCommand(): string {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function getNominalCommand(step: "build" | "start"): string {
	return step === "build" ? "next build" : "next start";
}

export function getCommandForStep(input: {
	step: "build" | "start";
	cwd: string;
}): NextSmokeCommand {
	let executable = path.resolve(
		input.cwd,
		"node_modules",
		".bin",
		process.platform === "win32" ? "next.cmd" : "next",
	);
	if (process.platform !== "win32") {
		try {
			const requireFromRoot = createRequire(
				path.resolve(input.cwd, "package.json"),
			);
			executable = requireFromRoot.resolve("next/dist/bin/next");
		} catch {
			// Fall back to the local .bin path for fixture-style runtimes.
		}
	}
	return {
		executable,
		command: getNominalCommand(input.step),
		args: input.step === "build" ? ["build"] : ["start"],
	};
}

export function createSkippedStep(
	command: string,
	reason: string,
): NextSmokeStepResult {
	return {
		ok: false,
		command,
		exitCode: null,
		timedOut: false,
		durationMs: 0,
		detail: reason,
	};
}

export function createSkippedStart(
	command: string,
	reason: string,
): NextSmokeStartResult {
	return {
		...createSkippedStep(command, reason),
		pid: null,
		cleanup: "not-needed",
	};
}
