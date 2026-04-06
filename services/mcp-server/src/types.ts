export type GeneratedFile = {
	path: string;
	content: string;
};

export type MultiFileOutput = {
	files: GeneratedFile[];
	notes?: string[];
};

export type QualityIssue = {
	severity: "error" | "warn";
	rule: string;
	path: string;
	message: string;
};

export type CommandCheckResult = {
	name: string;
	command: string;
	status: "passed" | "failed" | "skipped";
	exitCode: number | null;
	stdout: string;
	stderr: string;
	durationMs: number;
	reason?: string;
};
