import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("run-ci-flake-metrics", () => {
	it("skips cleanly when no ci-gate summary exists", async () => {
		const root = await mkTempDir("openui-run-ci-flake-metrics-empty-");
		const scriptPath = path.resolve(
			process.cwd(),
			"tooling/run-ci-flake-metrics.mjs",
		);
		const run = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(run.status).toBe(0);
		expect(run.stdout).toContain("[flake-metrics] skipped: no ci-gate summary");
	});

	it("finds the latest summary and generates flake metrics outputs", async () => {
		const root = await mkTempDir("openui-run-ci-flake-metrics-full-");
		const olderRunDir = path.join(root, ".runtime-cache", "runs", "run-older");
		const latestRunDir = path.join(
			root,
			".runtime-cache",
			"runs",
			"run-latest",
		);
		await fs.mkdir(olderRunDir, { recursive: true });
		await fs.mkdir(latestRunDir, { recursive: true });

		const olderSummaryPath = path.join(olderRunDir, "summary.json");
		const latestSummaryPath = path.join(latestRunDir, "summary.json");
		const summaryPayload = {
			ok: true,
			startedAt: "2026-03-26T11:00:00.000Z",
			finishedAt: "2026-03-26T11:05:00.000Z",
			stages: [
				{
					id: "stage2",
					tasks: [
						{
							id: "testE2E",
							command: "npx playwright test --project=chromium --retries=2",
							stdout: "",
							stderr: "",
						},
					],
				},
			],
		};
		await fs.writeFile(
			olderSummaryPath,
			JSON.stringify(summaryPayload, null, 2),
			"utf8",
		);
		await fs.writeFile(
			latestSummaryPath,
			JSON.stringify(summaryPayload, null, 2),
			"utf8",
		);

		const olderTime = new Date("2026-03-26T10:00:00.000Z");
		const latestTime = new Date("2026-03-26T11:00:00.000Z");
		await fs.utimes(olderSummaryPath, olderTime, olderTime);
		await fs.utimes(latestSummaryPath, latestTime, latestTime);

		const scriptPath = path.resolve(
			process.cwd(),
			"tooling/run-ci-flake-metrics.mjs",
		);
		const run = spawnSync(process.execPath, [scriptPath], {
			cwd: root,
			encoding: "utf8",
		});

		expect(run.status).toBe(0);
		const latestSummaryRealPath = await fs.realpath(latestSummaryPath);
		const flakeRatePath = path.join(latestRunDir, "flake-rate.json");
		const compatPath = path.join(latestRunDir, "flake-metrics.json");
		expect(JSON.parse(await fs.readFile(flakeRatePath, "utf8"))).toMatchObject({
			sources: {
				summary: {
					path: latestSummaryRealPath,
					status: "available",
				},
			},
		});
		expect(JSON.parse(await fs.readFile(compatPath, "utf8"))).toMatchObject({
			sources: {
				summary: {
					path: latestSummaryRealPath,
					status: "available",
				},
			},
		});
	});
});
