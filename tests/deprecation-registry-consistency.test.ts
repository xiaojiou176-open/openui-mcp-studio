import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("deprecation registry consistency", () => {
	const bannedLegacyKeys = [
		["GOOGLE", "API", "KEY"].join("_"),
		["LIVE", "TEST", "MAX", "ATTEMPTS"].join("_"),
		["OPENUI", "MODEL"].join("_"),
		["OPENUI", "MODEL", "FAST"].join("_"),
		["OPENUI", "MODEL", "STRONG"].join("_"),
	];

	function toExactEnvKeyPattern(key: string) {
		return new RegExp(`(^|[^A-Z0-9_])${key}([^A-Z0-9_]|$)`, "u");
	}

	it("does not register deprecated keys", async () => {
		const rootDir = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
		);
		const registryPath = path.join(
			rootDir,
			"tooling",
			"env-contract",
			"deprecation-registry.json",
		);
		const raw = await fs.readFile(registryPath, "utf8");
		const parsed = JSON.parse(raw) as {
			deprecatedKeys?: Array<{ key: string }>;
		};
		const deprecatedKeys = parsed.deprecatedKeys ?? [];

		expect(deprecatedKeys).toEqual([]);
	});

	it("removes legacy key reads in runtime codepaths", async () => {
		const rootDir = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
		);
		const sidecarSource = await fs.readFile(
			path.join(rootDir, "services", "gemini-sidecar", "server.py"),
			"utf8",
		);
		const liveTestSource = await fs.readFile(
			path.join(rootDir, "tooling", "run-live-tests.mjs"),
			"utf8",
		);

		for (const key of bannedLegacyKeys) {
			expect(sidecarSource).not.toMatch(toExactEnvKeyPattern(key));
			expect(liveTestSource).not.toMatch(toExactEnvKeyPattern(key));
		}
	});

	it("keeps legacy key strings out of all docs, including history ledger", async () => {
		const rootDir = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			"..",
		);
		const docsDir = path.join(rootDir, "docs");
		const files = await fs.readdir(docsDir, { withFileTypes: true });
		const docsFiles = files
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => entry.name);

		for (const fileName of docsFiles) {
			const content = await fs.readFile(path.join(docsDir, fileName), "utf8");
			for (const key of bannedLegacyKeys) {
				expect(content).not.toMatch(toExactEnvKeyPattern(key));
			}
		}
	});
});
