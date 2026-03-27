import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkPythonSidecarLock } from "../tooling/check-python-sidecar-lock.mjs";

describe("python sidecar dependency lock", () => {
	it("passes for the repository sidecar requirements and constraints pair", async () => {
		const result = await checkPythonSidecarLock({
			rootDir: process.cwd(),
		});

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.directRequirements.length).toBeGreaterThan(0);
		expect(result.constraints.length).toBeGreaterThan(
			result.directRequirements.length,
		);
	});

	it("fails when a direct requirement is missing from the constraints file", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-python-sidecar-lock-"),
		);

		try {
			const requirementsPath = path.join(tempRoot, "requirements.txt");
			const constraintsPath = path.join(tempRoot, "constraints.txt");

			await fs.writeFile(
				requirementsPath,
				["-c constraints.txt", "", "google-genai>=1.60.0,<2.0.0", "ruff>=0.12.0,<1.0.0", ""].join(
					"\n",
				),
				"utf8",
			);
			await fs.writeFile(
				constraintsPath,
				["google-genai==1.68.0", ""].join("\n"),
				"utf8",
			);

			const result = await checkPythonSidecarLock({
				rootDir: tempRoot,
				requirementsPath: "requirements.txt",
				constraintsPath: "constraints.txt",
			});

			expect(result.ok).toBe(false);
			expect(result.errors).toContain(
				'direct requirement "ruff" is missing from constraints.txt.',
			);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("fails when the pinned version is outside the allowed requirement range", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-python-sidecar-lock-"),
		);

		try {
			const requirementsPath = path.join(tempRoot, "requirements.txt");
			const constraintsPath = path.join(tempRoot, "constraints.txt");

			await fs.writeFile(
				requirementsPath,
				["-c constraints.txt", "", "google-genai>=1.60.0,<2.0.0", ""].join(
					"\n",
				),
				"utf8",
			);
			await fs.writeFile(
				constraintsPath,
				["google-genai==2.1.0", ""].join("\n"),
				"utf8",
			);

			const result = await checkPythonSidecarLock({
				rootDir: tempRoot,
				requirementsPath: "requirements.txt",
				constraintsPath: "constraints.txt",
			});

			expect(result.ok).toBe(false);
			expect(result.errors).toContain(
				'direct requirement "google-genai" allows ">=1.60.0,<2.0.0" but constraints.txt pins "2.1.0".',
			);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});
