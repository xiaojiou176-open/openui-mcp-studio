#!/usr/bin/env node
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { URL, pathToFileURL } from "node:url";
import process from "node:process";
import { runHistoryHygieneCheck } from "../check-history-hygiene.mjs";

const DOCTOR_CHECKS = [
	{ id: "identityAlignment", command: ["npm", "run", "-s", "governance:identity-alignment:check"] },
	{ id: "languageBoundary", command: ["npm", "run", "-s", "governance:language-boundary:check"] },
	{ id: "trackedSurfaceHygiene", command: ["npm", "run", "-s", "governance:tracked-surface:check"] },
	{ id: "openSourceSurface", command: ["npm", "run", "-s", "governance:open-source-surface:check"] },
	{ id: "remoteGovernanceEvidence", command: ["npm", "run", "-s", "governance:remote-evidence:check"] },
	{ id: "ssot", command: ["npm", "run", "-s", "governance:ssot:check"] },
	{ id: "moduleReadme", command: ["npm", "run", "-s", "governance:module-readme:check"] },
	{ id: "topology", command: ["npm", "run", "-s", "governance:topology:check"] },
	{ id: "root", command: ["npm", "run", "-s", "governance:root:check"] },
	{ id: "rootPristine", command: ["npm", "run", "-s", "governance:root-pristine:check"] },
	{ id: "historyHygiene", command: ["npm", "run", "-s", "governance:history-hygiene:check"] },
	{ id: "runtime", command: ["npm", "run", "-s", "governance:runtime:check"] },
	{ id: "runtimeLayout", command: ["npm", "run", "-s", "governance:runtime-layout:check"] },
	{ id: "cacheLifecycle", command: ["npm", "run", "-s", "governance:cache-lifecycle:check"] },
	{ id: "spaceGovernance", command: ["npm", "run", "-s", "governance:space:check"] },
	{ id: "logSchema", command: ["npm", "run", "-s", "governance:log-schema:check"] },
	{ id: "evidence", command: ["npm", "run", "-s", "governance:evidence:check"] },
	{ id: "runCorrelation", command: ["npm", "run", "-s", "governance:run-correlation:check"] },
	{ id: "upstreamPolicy", command: ["npm", "run", "-s", "governance:upstream-policy:check"] },
	{ id: "pinnedSource", command: ["npm", "run", "-s", "governance:pinned-source:check"] },
	{ id: "releaseReadiness", command: ["npm", "run", "-s", "release:readiness:check"] },
];

const HISTORY_AUDIT_REPORT = ".runtime-cache/reports/history-audit/gitleaks-history.json";

function defaultRunner(cmd, args, options) {
	return spawnSync(cmd, args, options);
}

function buildDoctorPayload(
	results,
	checkedAt = new Date().toISOString(),
	extraReadinessAdvisories = [],
) {
	const readinessAdvisories = [];
	if (
		results.some(
			(entry) =>
				entry.id === "evidence" &&
				entry.ok &&
				entry.stdout.includes("no authoritative runs present"),
		) ||
		results.some(
			(entry) =>
				entry.id === "runCorrelation" &&
				entry.ok &&
				entry.stdout.includes("no authoritative runs present"),
		)
	) {
		readinessAdvisories.push(
			"Repo health checks passed without authoritative run evidence. Use strict readiness checks before claiming release/public proof closure.",
		);
	}
	for (const advisory of extraReadinessAdvisories) {
		if (typeof advisory === "string" && advisory.trim()) {
			readinessAdvisories.push(advisory.trim());
		}
	}
	return {
		ok: results.every((entry) => entry.ok),
		checkedAt,
		summary: {
			total: results.length,
			passed: results.filter((entry) => entry.ok).length,
			failed: results.filter((entry) => !entry.ok).map((entry) => entry.id),
		},
		readinessAdvisories,
		results,
	};
}

async function collectDoctorReadinessAdvisories(cwd = process.cwd()) {
	const advisories = [];
	const reportPath = new URL(HISTORY_AUDIT_REPORT, pathToFileURL(`${cwd}/`));
	const historyHygiene = await runHistoryHygieneCheck({ rootDir: cwd });

	try {
		const raw = await fs.readFile(reportPath, "utf8");
		const findings = JSON.parse(raw);
		if (Array.isArray(findings) && findings.length > 0 && !historyHygiene.ok) {
			advisories.push(
				`History audit report contains ${findings.length} findings. Do not claim public-safe release closure until they are classified or remediated.`,
			);
		}
		if (Array.isArray(findings) && findings.length > 0 && historyHygiene.ok) {
			advisories.push(
				`History hygiene is classified in ${historyHygiene.contractPath}. Do not describe the repository as zero-history-findings clean unless the historical accepted-risk families are rewritten.`,
			);
		}
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			advisories.push(
				"No history audit report is present. Run `npm run security:history:audit` before claiming public-safe release closure.",
			);
			return advisories;
		}
		advisories.push(
			"History audit report could not be parsed. Re-run `npm run security:history:audit` before claiming public-safe release closure.",
		);
	}

	return advisories;
}

async function runRepoDoctorCli({
	checks = DOCTOR_CHECKS,
	runner = defaultRunner,
	advisoryProvider = collectDoctorReadinessAdvisories,
	cwd = process.cwd(),
	env = process.env,
	stdout = process.stdout,
	now = () => new Date().toISOString(),
} = {}) {
	const results = checks.map((check) => {
		const [cmd, ...args] = check.command;
		const result = runner(cmd, args, {
			cwd,
			env,
			encoding: "utf8",
		});
		return {
			id: check.id,
			ok: result.status === 0,
			exitCode: result.status ?? 1,
			stdout: (result.stdout ?? "").trim(),
			stderr: (result.stderr ?? "").trim(),
		};
	});

	const extraAdvisories = await advisoryProvider(cwd);
	const payload = buildDoctorPayload(results, now(), extraAdvisories);
	stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
	return payload.ok ? 0 : 1;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runRepoDoctorCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}

export {
	DOCTOR_CHECKS,
	buildDoctorPayload,
	collectDoctorReadinessAdvisories,
	runRepoDoctorCli,
};
