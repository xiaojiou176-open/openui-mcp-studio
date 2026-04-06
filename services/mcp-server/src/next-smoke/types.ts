export const DEFAULT_BUILD_TIMEOUT_MS = 180_000;
export const DEFAULT_STARTUP_GRACE_MS = 1_000;
export const DEFAULT_PROBE_TIMEOUT_MS = 12_000;
export const DEFAULT_PROBE_INTERVAL_MS = 200;
export const DEFAULT_LOG_TAIL_LINES = 80;
export const DEFAULT_PROBE_PATH = "/";
export const DEFAULT_INSTALL_TIMEOUT_MS = 180_000;
export const REQUIRED_NEXT_RUNTIME_PACKAGES = [
	"next",
	"react",
	"react-dom",
	"typescript",
	"@types/react",
	"@types/react-dom",
] as const;

export type PackageJson = {
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

export type RootValidation =
	| {
			ok: true;
			root: string;
			packageJson: PackageJson;
	  }
	| {
			ok: false;
			root: string;
			reason: string;
	  };

export type NextSmokeStepResult = {
	ok: boolean;
	command: string;
	exitCode: number | null;
	timedOut: boolean;
	durationMs: number;
	detail: string;
};

export type NextSmokeStartResult = NextSmokeStepResult & {
	pid: number | null;
	cleanup: "not-needed" | "already-exited" | "sigterm" | "sigkill" | "failed";
};

export type NextSmokeProbeResult = {
	ok: boolean;
	url: string;
	statusCode: number | null;
	durationMs: number;
	detail: string;
};

export type NextSmokeResult = {
	passed: boolean;
	usedTargetRoot: string;
	build: NextSmokeStepResult;
	start: NextSmokeStartResult;
	probe: NextSmokeProbeResult;
	logsTail: string[];
	durationMs: number;
};

export type RunNextSmokeInput = {
	targetRoot?: string;
	buildTimeoutMs?: number;
	startupGraceMs?: number;
	probeTimeoutMs?: number;
	probeIntervalMs?: number;
	probePath?: string;
};

export type NextSmokeCommand = {
	executable: string;
	command: string;
	args: string[];
};
