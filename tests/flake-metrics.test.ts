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

describe("flake-metrics script", () => {
	it("generates flake-rate output with retry stats and threshold decision", async () => {
		const root = await mkTempDir("openui-flake-metrics-");
		const summaryPath = path.join(root, "summary.json");
		const outputPath = path.join(root, "flake-rate.json");
		const compatPath = path.join(root, "flake-metrics.json");
		const historyPath = path.join(root, "flake-history.json");

		const chromiumDir = path.join(root, "playwright", "chromium");
		const firefoxDir = path.join(root, "playwright", "firefox");
		await fs.mkdir(chromiumDir, { recursive: true });
		await fs.mkdir(firefoxDir, { recursive: true });

		await fs.writeFile(
			path.join(chromiumDir, ".last-run.json"),
			JSON.stringify({ status: "passed", failedTests: [] }, null, 2),
			"utf8",
		);
		await fs.writeFile(
			path.join(firefoxDir, ".last-run.json"),
			JSON.stringify({ status: "passed", failedTests: [] }, null, 2),
			"utf8",
		);

		await fs.writeFile(
			summaryPath,
			JSON.stringify(
				{
					ok: true,
					startedAt: "2026-02-27T09:00:00.000Z",
					finishedAt: "2026-02-27T09:05:00.000Z",
					stages: [
						{
							id: "stage2",
							tasks: [
								{
									id: "testE2E",
									command: "npx playwright test --project=chromium --retries=2",
									stdout: "Retry #1",
									stderr: "",
								},
								{
									id: "testE2EFirefox",
									command: "npx playwright test --project=firefox --retries=2",
									stdout: "",
									stderr: "",
								},
							],
						},
					],
				},
				null,
				2,
			),
			"utf8",
		);

		const scriptPath = path.resolve(process.cwd(), "tooling/flake-metrics.mjs");
		const run = spawnSync(
			process.execPath,
			[
				scriptPath,
				`--from-summary=${summaryPath}`,
				`--output=${outputPath}`,
				`--compat-output=${compatPath}`,
				`--history-file=${historyPath}`,
				`--playwright-dir=${chromiumDir}`,
				`--playwright-dir=${firefoxDir}`,
				"--window-size=10",
				"--threshold=0.5",
			],
			{
				encoding: "utf8",
			},
		);

		expect(run.status).toBe(0);

		const output = JSON.parse(await fs.readFile(outputPath, "utf8")) as {
			window?: { sampleCount?: number };
			samples?: { totalInHistory?: number };
			retryStats?: {
				currentRun?: {
					retryEvents?: number;
					flakyTasks?: number;
					tasksWithObservedRetries?: number;
				};
			};
			flakeRate?: number;
			threshold?: { breached?: boolean };
		};

		expect(output.window?.sampleCount).toBe(1);
		expect(output.samples?.totalInHistory).toBe(1);
		expect(output.retryStats?.currentRun?.retryEvents).toBeGreaterThan(0);
		expect(output.retryStats?.currentRun?.tasksWithObservedRetries).toBe(1);
		expect(output.retryStats?.currentRun?.flakyTasks).toBe(1);
		expect(output.flakeRate).toBe(100);
		expect(output.threshold?.breached).toBe(true);

		const compat = JSON.parse(await fs.readFile(compatPath, "utf8")) as {
			flakeRate?: number;
		};
		expect(compat.flakeRate).toBe(100);
	});
});
