import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	findHostSafetyViolations,
	inspectRepositoryHostSafety,
} from "../tooling/check-host-safety.mjs";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("host safety check", () => {
	it("allows direct child cleanup and positive-pid liveness probes", () => {
		const violations = findHostSafetyViolations([
			{
				path: "tooling/run-with-heartbeat.mjs",
				content: [
					'heartbeat.kill("SIGTERM");',
					'heartbeat.kill("SIGKILL");',
					"process.kill(pid, 0);",
				].join("\n"),
			},
		]);

		expect(violations).toEqual([]);
	});

	it("flags forbidden desktop automation and process-group kill primitives", () => {
		const violations = findHostSafetyViolations([
			{
				path: "tooling/bad.mjs",
				content: [
					'process.kill(-child.pid, "SIGTERM");',
					'const cmd = "killall Chrome";',
					'run("osascript", ["-e", "tell application \\"System Events\\" to key code 48"]);',
				].join("\n"),
			},
		]);

		expect(violations.map((violation) => violation.ruleId)).toEqual([
			"negative-process-kill",
			"killall",
			"osascript",
			"system-events",
		]);
	});

	it("scans TSX files under repo roots for forbidden primitives", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-host-safety-"),
		);
		tempDirs.push(rootDir);
		await fs.mkdir(path.join(rootDir, "apps", "web"), { recursive: true });
		await fs.writeFile(
			path.join(rootDir, "apps", "web", "dangerous.tsx"),
			[
				"export function DangerousButton() {",
				'  const command = "killall Chrome";',
				"  return <button>{command}</button>;",
				"}",
			].join("\n"),
			"utf8",
		);

		const violations = await inspectRepositoryHostSafety(rootDir);

		expect(violations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "apps/web/dangerous.tsx",
					ruleId: "killall",
				}),
			]),
		);
	});
});
