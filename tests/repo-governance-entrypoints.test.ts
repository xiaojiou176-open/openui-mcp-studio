import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import {
	buildDoctorPayload,
	DOCTOR_CHECKS,
	runRepoDoctorCli,
} from "../tooling/cli/repo-doctor.mjs";
import {
	runRepoVerifyFastCli,
	VERIFY_FAST_STEPS,
} from "../tooling/cli/repo-verify-fast.mjs";

function createBufferWriter() {
	let value = "";
	return {
		stream: {
			write(chunk: string | Uint8Array) {
				value += String(chunk);
				return true;
			},
		},
		read() {
			return value;
		},
	};
}

describe("repo governance entrypoints", () => {
	it("keeps repo:verify:fast aligned with the expanded structural governance sweep", async () => {
		expect(VERIFY_FAST_STEPS).toEqual([
			["npm", "run", "-s", "governance:identity-alignment:check"],
			["npm", "run", "-s", "governance:language-boundary:check"],
			["npm", "run", "-s", "governance:tracked-surface:check"],
			["npm", "run", "-s", "governance:open-source-surface:check"],
			["npm", "run", "-s", "governance:remote-evidence:check"],
			["npm", "run", "-s", "governance:ssot:check"],
			["npm", "run", "-s", "governance:module-readme:check"],
			["npm", "run", "-s", "governance:topology:check"],
			["npm", "run", "-s", "governance:root:check"],
			["npm", "run", "-s", "governance:root-pristine:check"],
			["npm", "run", "-s", "governance:runtime:check"],
			["npm", "run", "-s", "governance:runtime-layout:check"],
			["npm", "run", "-s", "governance:cache-lifecycle:check"],
			["npm", "run", "-s", "governance:space:check"],
			["npm", "run", "-s", "governance:deps:check"],
			["npm", "run", "-s", "governance:history-hygiene:check"],
			["npm", "run", "-s", "governance:log-schema:check"],
			["npm", "run", "-s", "governance:evidence:check"],
			["npm", "run", "-s", "governance:run-correlation:check"],
		]);

		const executed = [];
		const exitCode = await runRepoVerifyFastCli({
			runner: (cmd, args) => {
				executed.push([cmd, ...args]);
				return { status: 0 };
			},
		});

		expect(exitCode).toBe(0);
		expect(executed).toEqual(VERIFY_FAST_STEPS);
	});

	it("stops repo:verify:fast at the first failing gate", async () => {
		const executed = [];
		const exitCode = await runRepoVerifyFastCli({
			steps: [
				["npm", "run", "-s", "first"],
				["npm", "run", "-s", "second"],
				["npm", "run", "-s", "third"],
			],
			runner: (cmd, args) => {
				executed.push([cmd, ...args]);
				if (args.at(-1) === "second") {
					return { status: 7 };
				}
				return { status: 0 };
			},
		});

		expect(exitCode).toBe(7);
		expect(executed).toEqual([
			["npm", "run", "-s", "first"],
			["npm", "run", "-s", "second"],
		]);
	});

	it("keeps repo:doctor aligned with the expanded governance front-desk summary", async () => {
		expect(DOCTOR_CHECKS.map((check) => check.id)).toEqual([
			"identityAlignment",
			"languageBoundary",
			"trackedSurfaceHygiene",
			"openSourceSurface",
			"remoteGovernanceEvidence",
			"ssot",
			"moduleReadme",
			"topology",
			"root",
			"rootPristine",
			"historyHygiene",
			"runtime",
			"runtimeLayout",
			"cacheLifecycle",
			"spaceGovernance",
			"logSchema",
			"evidence",
			"runCorrelation",
			"upstreamPolicy",
			"pinnedSource",
			"releaseReadiness",
		]);
	});

	it("keeps package front-door scripts aligned with space-governance gates", () => {
		expect(packageJson.scripts["governance:space:check"]).toBe(
			"node tooling/check-space-governance.mjs && node tooling/check-space-path-sources.mjs",
		);
		expect(packageJson.scripts["repo:space:check"]).toBe(
			"npm run -s governance:space:check",
		);
		expect(packageJson.scripts["repo:space:verify"]).toBe(
			"node tooling/space-verify-candidates.mjs",
		);
		expect(packageJson.scripts["repo:space:clean"]).toBe(
			"node tooling/space-clean.mjs",
		);
		expect(packageJson.scripts["repo:space:maintain"]).toBe(
			"node tooling/space-maintain.mjs --apply",
		);
		expect(packageJson.scripts["repo:space:maintain:dry-run"]).toBe(
			"node tooling/space-maintain.mjs",
		);
		expect(packageJson.scripts["security:evidence:final"]).toBe(
			"node tooling/security-final-evidence.mjs",
		);
		expect(packageJson.scripts["governance:remote:review"]).toBe(
			"node tooling/remote-canonical-review.mjs",
		);
		expect(packageJson.scripts["governance:final:check"]).toContain(
			"governance:space:check",
		);
	});

	it("builds doctor summary counts from mixed pass/fail results", () => {
		const payload = buildDoctorPayload(
			[
				{ id: "root", ok: true, exitCode: 0, stdout: "ok", stderr: "" },
				{
					id: "pinnedSource",
					ok: false,
					exitCode: 1,
					stdout: "",
					stderr: "missing digest",
				},
				{
					id: "releaseReadiness",
					ok: false,
					exitCode: 1,
					stdout: "",
					stderr: "blocked",
				},
			],
			"2026-03-20T12:29:10.680Z",
		);

		expect(payload.ok).toBe(false);
		expect(payload.checkedAt).toBe("2026-03-20T12:29:10.680Z");
		expect(payload.summary).toEqual({
			total: 3,
			passed: 1,
			failed: ["pinnedSource", "releaseReadiness"],
		});
		expect(payload.readinessAdvisories).toEqual([]);
	});

	it("runs all doctor checks and emits a JSON summary payload", async () => {
		const writer = createBufferWriter();
		const exitCode = await runRepoDoctorCli({
			checks: [
				{ id: "identityAlignment", command: ["npm", "run", "-s", "identity"] },
				{ id: "pinnedSource", command: ["npm", "run", "-s", "pinned"] },
			],
			runner: (_cmd, args) => {
				if (args.at(-1) === "pinned") {
					return { status: 1, stdout: "", stderr: "missing digest" };
				}
				return { status: 0, stdout: "ok", stderr: "" };
			},
			stdout: writer.stream,
			advisoryProvider: async () => [],
			now: () => "2026-03-20T12:29:10.680Z",
		});

		expect(exitCode).toBe(1);
		expect(JSON.parse(writer.read())).toEqual({
			ok: false,
			checkedAt: "2026-03-20T12:29:10.680Z",
			summary: {
				total: 2,
				passed: 1,
				failed: ["pinnedSource"],
			},
			readinessAdvisories: [],
			results: [
				{
					id: "identityAlignment",
					ok: true,
					exitCode: 0,
					stdout: "ok",
					stderr: "",
				},
				{
					id: "pinnedSource",
					ok: false,
					exitCode: 1,
					stdout: "",
					stderr: "missing digest",
				},
			],
		});
	});

	it("adds a readiness advisory when evidence health passes without authoritative runs", () => {
		const payload = buildDoctorPayload(
			[
				{
					id: "evidence",
					ok: true,
					exitCode: 0,
					stdout: "[evidence-governance] OK (no authoritative runs present)",
					stderr: "",
				},
				{
					id: "runCorrelation",
					ok: true,
					exitCode: 0,
					stdout: "[run-correlation] OK (no authoritative runs present)",
					stderr: "",
				},
			],
			"2026-03-22T20:00:00.000Z",
		);

		expect(payload.ok).toBe(true);
		expect(payload.readinessAdvisories).toEqual([
			"Repo health checks passed without authoritative run evidence. Use strict readiness checks before claiming release/public proof closure.",
		]);
	});

	it("includes extra readiness advisories supplied by the doctor runtime", async () => {
		const writer = createBufferWriter();
		const exitCode = await runRepoDoctorCli({
			checks: [
				{ id: "identityAlignment", command: ["npm", "run", "-s", "identity"] },
			],
			runner: () => ({ status: 0, stdout: "ok", stderr: "" }),
			advisoryProvider: async () => [
				"History audit report contains 115 findings. Do not claim public-safe release closure until they are classified or remediated.",
			],
			stdout: writer.stream,
			now: () => "2026-03-24T22:20:00.000Z",
		});

		expect(exitCode).toBe(0);
		expect(JSON.parse(writer.read()).readinessAdvisories).toEqual([
			"History audit report contains 115 findings. Do not claim public-safe release closure until they are classified or remediated.",
		]);
	});

	it("keeps a nuanced advisory when historical findings are classified but not rewritten", () => {
		const payload = buildDoctorPayload(
			[
				{
					id: "historyHygiene",
					ok: true,
					exitCode: 0,
					stdout: "[history-hygiene] OK",
					stderr: "",
				},
			],
			"2026-03-24T22:30:00.000Z",
			[
				"History hygiene is classified in tooling/contracts/history-hygiene.contract.json. Do not describe the repository as zero-history-findings clean unless the historical accepted-risk families are rewritten.",
			],
		);

		expect(payload.ok).toBe(true);
		expect(payload.readinessAdvisories).toEqual([
			"History hygiene is classified in tooling/contracts/history-hygiene.contract.json. Do not describe the repository as zero-history-findings clean unless the historical accepted-risk families are rewritten.",
		]);
	});
});
