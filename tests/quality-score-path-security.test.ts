import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeQualityScoreFile } from "../tooling/quality-score.mjs";

describe("quality-score output path security", () => {
	it("rejects output paths outside .runtime-cache/runs", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-quality-score-path-"),
		);
		try {
			await expect(
				writeQualityScoreFile(
					"../escape.json",
					{ ok: true },
					{ workspaceRoot },
				),
			).rejects.toThrow(/must target/i);
		} finally {
			await fs.rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	it("rejects output root symlink that resolves outside workspace", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-quality-score-root-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-quality-score-outside-"),
		);
		try {
			await fs.mkdir(path.join(workspaceRoot, ".runtime-cache"), {
				recursive: true,
			});
			await fs.symlink(
				outsideRoot,
				path.join(workspaceRoot, ".runtime-cache", "runs"),
				"dir",
			);

			await expect(
				writeQualityScoreFile(
					".runtime-cache/runs/test-run/quality-score.json",
					{
						ok: true,
					},
					{ workspaceRoot },
				),
			).rejects.toThrow(/resolves outside workspace via symlink/i);
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("rejects symlink output target that points outside runtime root", async () => {
		const workspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-quality-score-target-"),
		);
		const outsideRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-quality-score-target-outside-"),
		);
		const targetPath = path.join(
			workspaceRoot,
			".runtime-cache",
			"runs",
			"test-run",
			"quality-score.json",
		);
		const outsideFile = path.join(outsideRoot, "outside.json");

		try {
			await fs.mkdir(path.dirname(targetPath), { recursive: true });
			await fs.writeFile(outsideFile, '{"outside":true}\n', "utf8");
			await fs.symlink(outsideFile, targetPath);

			await expect(
				writeQualityScoreFile(
					".runtime-cache/runs/test-run/quality-score.json",
					{
						ok: true,
					},
					{ workspaceRoot },
				),
			).rejects.toThrow(/must not be a symlink/i);
			await expect(fs.readFile(outsideFile, "utf8")).resolves.toContain(
				'"outside":true',
			);
		} finally {
			await Promise.all([
				fs.rm(workspaceRoot, { recursive: true, force: true }),
				fs.rm(outsideRoot, { recursive: true, force: true }),
			]);
		}
	});
});
