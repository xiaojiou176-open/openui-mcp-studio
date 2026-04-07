import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	isPreparedBuildReusable,
	shouldRetryPrepareBuild,
} from "../tooling/prepare-next-app.ts";

const tempDirs: string[] = [];

async function createTempBuildDir(): Promise<string> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-prepare-next-app-"),
	);
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

describe("prepare-next-app retry classifier", () => {
	it("retries on the observed build-finalization flake family", () => {
		expect(
			shouldRetryPrepareBuild(
				new Error(
					"next build failed with code 1.\nError: ENOENT: no such file or directory, open '/tmp/app/.next/server/pages-manifest.json'",
				),
			),
		).toBe(true);
		expect(
			shouldRetryPrepareBuild(
				new Error(
					"next build failed with code 143.\nError: ENOENT: no such file or directory, open '/tmp/app/.next/routes-manifest.json'",
				),
			),
		).toBe(true);
		expect(
			shouldRetryPrepareBuild(
				new Error(
					"next build failed with code 1.\nError: ENOENT: no such file or directory, open '/tmp/app/.next/prerender-manifest.json'",
				),
			),
		).toBe(true);
	});

	it("does not retry ordinary build failures", () => {
		expect(
			shouldRetryPrepareBuild(
				new Error("Module not found: Can't resolve './missing-component'"),
			),
		).toBe(false);
		expect(
			shouldRetryPrepareBuild(new Error("Type error in app/page.tsx")),
		).toBe(false);
	});

	it("forces a rebuild when runtime-only Next artifacts are missing", async () => {
		const buildDir = await createTempBuildDir();
		await fs.writeFile(path.join(buildDir, "BUILD_ID"), "build-1", "utf8");
		await fs.writeFile(
			path.join(buildDir, "required-server-files.json"),
			"{}",
			"utf8",
		);
		await fs.writeFile(
			path.join(buildDir, "routes-manifest.json"),
			"{}",
			"utf8",
		);

		await expect(
			isPreparedBuildReusable({
				buildDir,
				latestSourceMtimeMs: Date.now() - 5_000,
			}),
		).resolves.toBe(false);
	});

	it("reuses the build when runtime artifacts are complete and fresh", async () => {
		const buildDir = await createTempBuildDir();
		await fs.writeFile(path.join(buildDir, "BUILD_ID"), "build-1", "utf8");
		await fs.writeFile(
			path.join(buildDir, "required-server-files.json"),
			"{}",
			"utf8",
		);
		await fs.writeFile(
			path.join(buildDir, "routes-manifest.json"),
			"{}",
			"utf8",
		);
		await fs.writeFile(
			path.join(buildDir, "prerender-manifest.json"),
			JSON.stringify({ version: 1, routes: {} }),
			"utf8",
		);

		const buildStat = await fs.stat(path.join(buildDir, "BUILD_ID"));
		await expect(
			isPreparedBuildReusable({
				buildDir,
				latestSourceMtimeMs: buildStat.mtimeMs - 1_000,
			}),
		).resolves.toBe(true);
	});
});
