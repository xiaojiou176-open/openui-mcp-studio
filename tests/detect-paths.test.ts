import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectShadcnPaths } from "../services/mcp-server/src/path-detection.js";

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

describe("detectShadcnPaths", () => {
	it("prioritizes components.json aliases.ui over folder scan", async () => {
		const root = await mkTempDir("openui-detect-");

		await fs.writeFile(
			path.join(root, "components.json"),
			JSON.stringify(
				{
					aliases: {
						ui: "@/src/components/ui",
						components: "@/src/components",
					},
				},
				null,
				2,
			),
		);

		await fs.writeFile(
			path.join(root, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"@/*": ["./*"],
						},
					},
				},
				null,
				2,
			),
		);

		await fs.mkdir(path.join(root, "src/components/ui"), { recursive: true });

		const result = await detectShadcnPaths(root);
		expect(result.source).toBe("components.json");
		expect(result.uiImportBase).toBe("@/src/components/ui");
		expect(result.uiDir).toBe("src/components/ui");
		expect(result.componentsDir).toBe("src/components");
	});

	it("infers scan alias with baseUrl=. and @/* -> ./*", async () => {
		const root = await mkTempDir("openui-detect-scan-dot-");

		await fs.writeFile(
			path.join(root, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"@/*": ["./*"],
						},
					},
				},
				null,
				2,
			),
		);

		await fs.mkdir(path.join(root, "src/components/ui"), { recursive: true });

		const result = await detectShadcnPaths(root);
		expect(result.source).toBe("scan");
		expect(result.uiDir).toBe("src/components/ui");
		expect(result.uiImportBase).toBe("@/src/components/ui");
		expect(result.componentsImportBase).toBe("@/src/components");
	});

	it("infers scan alias with baseUrl=src and @/* -> *", async () => {
		const root = await mkTempDir("openui-detect-scan-src-");

		await fs.writeFile(
			path.join(root, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						baseUrl: "src",
						paths: {
							"@/*": ["*"],
						},
					},
				},
				null,
				2,
			),
		);

		await fs.mkdir(path.join(root, "src/components/ui"), { recursive: true });

		const result = await detectShadcnPaths(root);
		expect(result.source).toBe("scan");
		expect(result.uiDir).toBe("src/components/ui");
		expect(result.uiImportBase).toBe("@/components/ui");
		expect(result.componentsImportBase).toBe("@/components");
	});

	it("falls back to default when no config and no scan candidate", async () => {
		const root = await mkTempDir("openui-detect-default-");

		const result = await detectShadcnPaths(root);
		expect(result.source).toBe("default");
		expect(result.uiImportBase).toBe("@/components/ui");
		expect(result.uiDir).toBe("components/ui");
	});

	it("ignores scan candidates that resolve outside workspace through symlink", async () => {
		const root = await mkTempDir("openui-detect-symlink-");
		const outsideDir = await mkTempDir("openui-detect-symlink-outside-");
		await fs.mkdir(path.join(outsideDir, "ui"), { recursive: true });
		await fs.mkdir(path.join(root, "components"), { recursive: true });
		await fs.symlink(
			path.join(outsideDir, "ui"),
			path.join(root, "components/ui"),
		);

		const result = await detectShadcnPaths(root);
		expect(result.source).toBe("default");
		expect(result.uiDir).toBe("components/ui");
	});
});
