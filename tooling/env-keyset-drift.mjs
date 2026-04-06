#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseEnvExample } from "./env-contract/parse.mjs";
const DEFAULT_OUTPUT_DIR = path.join(".runtime-cache", "env-keyset-drift");
const BASELINE_FILE = ".env.example";
const PROFILE_EXAMPLES = [
	".env.development.example",
	".env.staging.example",
	".env.production.example",
];

function toSortedUnique(values) {
	return Array.from(new Set(values)).sort((left, right) =>
		left.localeCompare(right),
	);
}

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

		if (flag === "root") {
			options.rootDir = value;
			continue;
		}

		if (flag === "output-dir") {
			options.outputDir = value;
			continue;
		}

		throw new Error(`Unknown argument: --${flag}`);
	}

	return options;
}

function compareKeys(baselineKeys, targetKeys) {
	const baselineSet = new Set(baselineKeys);
	const targetSet = new Set(targetKeys);

	const missing = baselineKeys.filter((key) => !targetSet.has(key));
	const extra = targetKeys.filter((key) => !baselineSet.has(key));

	return {
		ok: missing.length === 0 && extra.length === 0,
		missing,
		extra,
	};
}

function toReportEntry({ file, baselineKeys, targetKeys }) {
	const diff = compareKeys(baselineKeys, targetKeys);
	return {
		file,
		baselineCount: baselineKeys.length,
		targetCount: targetKeys.length,
		...diff,
	};
}

function formatMarkdownReport(report) {
	const lines = [
		"# Env Keyset Drift Report",
		"",
		`- Generated at: ${report.generatedAt}`,
		`- Baseline: ${report.baseline.file}`,
		`- Baseline key count: ${report.baseline.keyCount}`,
		"",
		"## Summary",
		"",
		`- Checked targets: ${report.counts.targets}`,
		`- Drift targets: ${report.counts.driftTargets}`,
		`- Status: ${report.ok ? "PASS" : "FAIL"}`,
		"",
		"## Target Results",
		"",
	];

	for (const target of report.targets) {
		lines.push(`### ${target.file}`);
		lines.push("");
		lines.push(`- Status: ${target.ok ? "PASS" : "FAIL"}`);
		lines.push(`- Missing keys: ${target.missing.length}`);
		lines.push(`- Extra keys: ${target.extra.length}`);
		lines.push("");

		lines.push("Missing:");
		if (target.missing.length === 0) {
			lines.push("- none");
		} else {
			lines.push(...target.missing.map((key) => `- ${key}`));
		}
		lines.push("");

		lines.push("Extra:");
		if (target.extra.length === 0) {
			lines.push("- none");
		} else {
			lines.push(...target.extra.map((key) => `- ${key}`));
		}
		lines.push("");
	}

	if (!report.ok) {
		lines.push("## Remediation");
		lines.push("");
		lines.push("- Sync profile examples with `.env.example` keyset.");
			lines.push(
				"- Re-run `node tooling/env-keyset-drift.mjs` to confirm drift is resolved.",
			);
		lines.push("");
	}

	return lines.join("\n");
}

async function readEnvExampleKeys(rootDir, fileName) {
	const filePath = path.join(rootDir, fileName);
	const raw = await fs.readFile(filePath, "utf8");
	const parsed = parseEnvExample(raw);
	return {
		file: fileName,
		keys: toSortedUnique(parsed.keys),
		raw,
	};
}

async function buildKeysetDriftReport(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const outputDir = path.resolve(
		rootDir,
		options.outputDir ?? DEFAULT_OUTPUT_DIR,
	);

	const baseline = await readEnvExampleKeys(rootDir, BASELINE_FILE);

	const targets = [];
	for (const fileName of PROFILE_EXAMPLES) {
		const profile = await readEnvExampleKeys(rootDir, fileName);
		targets.push(
			toReportEntry({
				file: profile.file,
				baselineKeys: baseline.keys,
				targetKeys: profile.keys,
			}),
		);
	}

	const driftTargets = targets.filter((target) => !target.ok);
	const report = {
		generatedAt: new Date().toISOString(),
		ok: driftTargets.length === 0,
		baseline: {
			file: BASELINE_FILE,
			keyCount: baseline.keys.length,
			keys: baseline.keys,
		},
		counts: {
			targets: targets.length,
			driftTargets: driftTargets.length,
		},
		targets,
	};

	await fs.mkdir(outputDir, { recursive: true });
	const jsonPath = path.join(outputDir, "report.json");
	const markdownPath = path.join(outputDir, "report.md");
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${formatMarkdownReport(report)}\n`, "utf8"),
	]);

	return {
		report,
		outputDir,
		jsonPath,
		markdownPath,
	};
}

async function runEnvKeysetDriftCli(options = {}) {
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;

	try {
		const parsed =
			options.parsedArgs ?? parseCliArgs(options.argv ?? process.argv.slice(2));
		const result = await buildKeysetDriftReport({
			...parsed,
			...options.buildOptions,
		});

		stdout.write(
			`ENV keyset drift report generated: ${path.relative(process.cwd(), result.jsonPath)} and ${path.relative(process.cwd(), result.markdownPath)}\n`,
		);

		if (!result.report.ok) {
			stderr.write("ENV keyset drift detected.\n");
			stderr.write("Remediation:\n");
			stderr.write(
				"- Sync .env.development.example/.env.staging.example/.env.production.example with .env.example keyset.\n",
			);
			stderr.write(
				"- Re-run node tooling/env-keyset-drift.mjs and ensure report status is PASS.\n",
			);
			return 1;
		}

		stdout.write("ENV keyset drift check passed.\n");
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		stderr.write(`ENV keyset drift check failed: ${message}\n`);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runEnvKeysetDriftCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export { buildKeysetDriftReport, parseCliArgs, runEnvKeysetDriftCli };
