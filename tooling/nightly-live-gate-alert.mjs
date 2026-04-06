#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_OUTPUT_DIR = path.join(".runtime-cache", "nightly-live-gate");
const DEFAULT_ALERT_OWNER = "platform-oncall";
const DEFAULT_SLA_HOURS = 24;
const DEFAULT_SEVERITY = "high";

function parseCliArgs(argv) {
	const options = {};
	for (const arg of argv) {
		if (!arg.startsWith("--")) {
			throw new Error(`Unknown argument: ${arg}`);
		}
		const [flag, value = ""] = arg.slice(2).split("=");
		if (!value) {
			throw new Error(`Missing value for --${flag}`);
		}

		if (flag === "output-dir") {
			options.outputDir = value;
			continue;
		}
		if (flag === "owner") {
			options.owner = value;
			continue;
		}
		if (flag === "sla-hours") {
			options.slaHours = Number(value);
			continue;
		}
		if (flag === "severity") {
			options.severity = value;
			continue;
		}

		throw new Error(`Unknown argument: --${flag}`);
	}
	return options;
}

function resolveRunUrl({ githubServerUrl, githubRepository, githubRunId }) {
	if (!githubServerUrl || !githubRepository || !githubRunId) {
		return null;
	}
	return `${githubServerUrl}/${githubRepository}/actions/runs/${githubRunId}`;
}

function toSlaDue(createdAtIso, slaHours) {
	const createdAt = new Date(createdAtIso);
	const dueAt = new Date(createdAt.getTime() + slaHours * 60 * 60 * 1000);
	return dueAt.toISOString();
}

function buildMissingKeyAlert({
	createdAt,
	owner,
	slaHours,
	severity,
	action,
	context,
}) {
	return {
		event: "nightly_missing_gemini_api_key",
		status: "warning",
		created_at: createdAt,
		owner,
		sla_due: toSlaDue(createdAt, slaHours),
		severity,
		action,
		context,
	};
}

function buildMarkdownAlert(alert) {
	const lines = [
		"# Nightly Gemini Key Alert",
		"",
		"- status: warning",
		`- created_at: ${alert.created_at}`,
		`- owner: ${alert.owner}`,
		`- sla_due: ${alert.sla_due}`,
		`- severity: ${alert.severity}`,
		`- action: ${alert.action}`,
		`- workflow: ${alert.context.workflow || "unknown"}`,
		`- run_id: ${alert.context.run_id || "unknown"}`,
		`- run_attempt: ${alert.context.run_attempt || "unknown"}`,
		`- actor: ${alert.context.actor || "unknown"}`,
		"",
		"## Next Step",
		"",
		"- Add repository secret `GEMINI_API_KEY` and re-run the nightly workflow.",
	];

	if (alert.context.run_url) {
		lines.push(`- Run URL: ${alert.context.run_url}`);
	}

	return `${lines.join("\n")}\n`;
}

async function generateNightlyLiveGateAlert(options = {}) {
	const now = options.now instanceof Date ? options.now : new Date();
	const createdAt = now.toISOString();
	const outputDir = path.resolve(
		options.rootDir ?? process.cwd(),
		options.outputDir ?? DEFAULT_OUTPUT_DIR,
	);
	const owner =
		options.owner || process.env.NIGHTLY_ALERT_OWNER || DEFAULT_ALERT_OWNER;
	const severity =
		options.severity || process.env.NIGHTLY_ALERT_SEVERITY || DEFAULT_SEVERITY;
	const parsedSlaHours =
		typeof options.slaHours === "number"
			? options.slaHours
			: Number(process.env.NIGHTLY_ALERT_SLA_HOURS || DEFAULT_SLA_HOURS);
	const slaHours = Number.isFinite(parsedSlaHours)
		? parsedSlaHours
		: DEFAULT_SLA_HOURS;
	const context = {
		workflow: process.env.GITHUB_WORKFLOW || "",
		repository: process.env.GITHUB_REPOSITORY || "",
		run_id: process.env.GITHUB_RUN_ID || "",
		run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
		run_number: process.env.GITHUB_RUN_NUMBER || "",
		actor: process.env.GITHUB_ACTOR || "",
		ref: process.env.GITHUB_REF || "",
		event_name: process.env.GITHUB_EVENT_NAME || "",
		run_url: resolveRunUrl({
			githubServerUrl: process.env.GITHUB_SERVER_URL || "",
			githubRepository: process.env.GITHUB_REPOSITORY || "",
			githubRunId: process.env.GITHUB_RUN_ID || "",
		}),
	};
	const action =
		"Configure GEMINI_API_KEY in repository secrets and rerun nightly coverage gate.";
	const alert = buildMissingKeyAlert({
		createdAt,
		owner,
		slaHours,
		severity,
		action,
		context,
	});

	await fs.mkdir(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, "missing-gemini-key-alert.json");
	const markdownPath = path.join(outputDir, "missing-gemini-key-alert.md");
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(alert, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, buildMarkdownAlert(alert), "utf8"),
	]);
	return { outputDir, jsonPath, markdownPath, alert };
}

async function runNightlyLiveGateAlertCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	try {
		const parsed =
			options.parsedArgs ?? parseCliArgs(options.argv ?? process.argv.slice(2));
		const result = await generateNightlyLiveGateAlert({
			...parsed,
			...options.generateOptions,
		});
		stdout.write(
			`Nightly live gate alert generated: ${path.relative(process.cwd(), result.jsonPath)} and ${path.relative(process.cwd(), result.markdownPath)}\n`,
		);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`Failed to generate nightly live gate alert: ${message}\n`);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runNightlyLiveGateAlertCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	buildMissingKeyAlert,
	buildMarkdownAlert,
	generateNightlyLiveGateAlert,
	parseCliArgs,
	runNightlyLiveGateAlertCli,
};
