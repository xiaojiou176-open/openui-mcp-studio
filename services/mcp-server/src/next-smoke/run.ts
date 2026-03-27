import fs from "node:fs/promises";
import {
	getTargetBuildManifestStatus,
	writeTargetBuildManifest,
} from "../../../../packages/shared-runtime/src/target-build-manifest.js";
import { resolveNextBuildDir } from "../../../../packages/shared-runtime/src/next-build-dir.js";
import { getWorkspaceRoot } from "../constants.js";
import { LogTailBuffer } from "./logging.js";
import { createSkippedProbe, probeServer } from "./probe.js";
import {
	createSkippedStart,
	createSkippedStep,
	ensureDependenciesInstalled,
	findOpenPort,
	getCommandForStep,
	getNominalCommand,
	runBuildStep,
	startServerStep,
	terminateChildProcess,
} from "./process.js";
import { chooseRoot } from "./target-root.js";
import type {
	NextSmokeResult,
	NextSmokeStartResult,
	RunNextSmokeInput,
} from "./types.js";
import {
	DEFAULT_BUILD_TIMEOUT_MS,
	DEFAULT_INSTALL_TIMEOUT_MS,
	DEFAULT_LOG_TAIL_LINES,
	DEFAULT_PROBE_INTERVAL_MS,
	DEFAULT_PROBE_PATH,
	DEFAULT_PROBE_TIMEOUT_MS,
	DEFAULT_STARTUP_GRACE_MS,
	REQUIRED_NEXT_RUNTIME_PACKAGES,
} from "./types.js";

export async function runNextSmoke(
	input: RunNextSmokeInput = {},
): Promise<NextSmokeResult> {
	const startedAt = Date.now();
	const logs = new LogTailBuffer(DEFAULT_LOG_TAIL_LINES);
	const probePath = input.probePath || DEFAULT_PROBE_PATH;
	const workspaceRoot = getWorkspaceRoot();

	const selected = await chooseRoot(input, logs);
	const usedTargetRoot = selected.validation.root;
	const requestedBuildTimeoutMs =
		input.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
	const buildTimeoutMs = Math.max(requestedBuildTimeoutMs, 15_000);

	if (!selected.validation.ok) {
		const probeUrl = "http://127.0.0.1:0";
		const build = createSkippedStep(
			getNominalCommand("build"),
			`Target selection failed: ${selected.validation.reason}`,
		);
		const start = createSkippedStart(
			getNominalCommand("start"),
			`Skipped because no usable target root was found: ${selected.validation.reason}`,
		);
		const probe = createSkippedProbe(
			probeUrl,
			"Skipped because start phase did not run.",
		);

			return {
				passed: false,
				usedTargetRoot,
				build,
				start,
			probe,
			logsTail: logs.snapshot(),
			durationMs: Date.now() - startedAt,
		};
	}

	const buildCommand = getCommandForStep({
		step: "build",
		cwd: selected.validation.root,
	});
	const startCommand = getCommandForStep({
		step: "start",
		cwd: selected.validation.root,
	});

	const manifestStatus = await getTargetBuildManifestStatus({
		root: selected.validation.root,
		requiredPackages: REQUIRED_NEXT_RUNTIME_PACKAGES,
		workspaceRoot,
	});

	const installResult = manifestStatus.valid
		? {
				ok: true,
					detail: `Skipped dependency install (target build manifest valid at ${manifestStatus.manifestPath}).`,
			}
		: await ensureDependenciesInstalled({
				cwd: selected.validation.root,
				logs,
				timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
				requiredPackages: REQUIRED_NEXT_RUNTIME_PACKAGES,
			});
	if (!installResult.ok) {
		const probeUrl = "http://127.0.0.1:0";
		const build = createSkippedStep(
			getNominalCommand("build"),
			`Skipped because dependency install failed: ${installResult.detail}`,
		);
		const start = createSkippedStart(
			getNominalCommand("start"),
			`Skipped because build did not run: ${build.detail}`,
		);
		const probe = createSkippedProbe(
			probeUrl,
			"Skipped because start phase did not run.",
		);
		logs.append("prepare", installResult.detail);

			return {
				passed: false,
				usedTargetRoot,
				build,
				start,
			probe,
			logsTail: logs.snapshot(),
			durationMs: Date.now() - startedAt,
		};
	}
	logs.append("prepare", installResult.detail);

	const build = manifestStatus.valid
		? {
				ok: true,
				command: buildCommand.command,
				exitCode: 0,
				timedOut: false,
				durationMs: 0,
					detail: `Skipped build (target build manifest valid: ${manifestStatus.manifestPath}).`,
			}
		: await (async () => {
				const buildOutputDir = await resolveNextBuildDir(
					selected.validation.root,
				);
				await fs.rm(buildOutputDir, {
					recursive: true,
					force: true,
				});
				logs.append(
					"prepare",
					`Cleared stale build output before rebuild: ${buildOutputDir}`,
				);
				return runBuildStep({
					cwd: selected.validation.root,
					timeoutMs: buildTimeoutMs,
					logs,
					command: buildCommand,
				});
			})();

	if (build.ok && !manifestStatus.valid) {
		const manifestPath = await writeTargetBuildManifest({
			root: selected.validation.root,
			requiredPackages: REQUIRED_NEXT_RUNTIME_PACKAGES,
			workspaceRoot,
		});
		if (manifestPath) {
			logs.append(
				"prepare",
				`Target build manifest refreshed after prepare steps: ${manifestPath}`,
			);
		}
	}

	if (!build.ok) {
		const probeUrl = "http://127.0.0.1:0";
		const start = createSkippedStart(
			getNominalCommand("start"),
			`Skipped because build failed: ${build.detail}`,
		);
		const probe = createSkippedProbe(
			probeUrl,
			"Skipped because start phase did not run.",
		);
			return {
				passed: false,
				usedTargetRoot,
				build,
				start,
			probe,
			logsTail: logs.snapshot(),
			durationMs: Date.now() - startedAt,
		};
	}

	const port = await findOpenPort();
	const probeUrl = `http://127.0.0.1:${port}${probePath}`;

	const startResponse = await startServerStep({
		cwd: selected.validation.root,
		startupGraceMs: input.startupGraceMs ?? DEFAULT_STARTUP_GRACE_MS,
		port,
		logs,
		command: startCommand,
	});

	if (!startResponse.step.ok || !startResponse.child) {
		const probe = createSkippedProbe(
			probeUrl,
			`Skipped because start failed: ${startResponse.step.detail}`,
		);

			return {
				passed: false,
				usedTargetRoot,
				build,
				start: startResponse.step,
			probe,
			logsTail: logs.snapshot(),
			durationMs: Date.now() - startedAt,
		};
	}

	const probe = await probeServer({
		url: probeUrl,
		timeoutMs: input.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
		intervalMs: input.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS,
		child: startResponse.child,
		logs,
	});

	const cleanupResult = await terminateChildProcess(startResponse.child);
	const start: NextSmokeStartResult = {
		...startResponse.step,
		ok: startResponse.step.ok && cleanupResult.ok,
		cleanup: cleanupResult.cleanup,
		detail: `${startResponse.step.detail} Cleanup: ${cleanupResult.detail}`,
	};

		return {
			passed: build.ok && start.ok && probe.ok,
			usedTargetRoot,
			build,
			start,
		probe,
		logsTail: logs.snapshot(),
		durationMs: Date.now() - startedAt,
	};
}
