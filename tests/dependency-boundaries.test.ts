import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDependencyBoundaryCheck } from "../tooling/check-dependency-boundaries.mjs";

async function writeFile(filePath: string, content: string) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, content, "utf8");
}

async function writeJson(filePath: string, value: unknown) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("dependency boundary governance", () => {
	it("fails when shared code back-references business layers", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-boundaries-"),
		);
		try {
			await writeJson(
				path.join(
					rootDir,
					"contracts",
					"governance",
					"dependency-boundaries.json",
				),
				{
					version: 1,
					includeRoots: ["packages/shared-runtime/src", "services/mcp-server/src"],
					excludePatterns: [],
					rules: [
						{
							id: "shared-no-business",
							from: ["packages/shared-runtime/src/**"],
							disallow: ["services/mcp-server/src/tools/**"],
						},
					],
				},
			);
			await writeFile(
				path.join(
					rootDir,
					"packages",
					"shared-runtime",
					"src",
					"safe.ts",
				),
				'export const safe = true;\n',
			);
			await writeFile(
				path.join(
					rootDir,
					"services",
					"mcp-server",
					"src",
					"tools",
					"unsafe.ts",
				),
				'import { safe } from "../../../../packages/shared-runtime/src/safe.js";\nexport const tool = safe;\n',
			);
			await writeFile(
				path.join(
					rootDir,
					"packages",
					"shared-runtime",
					"src",
					"broken.ts",
				),
				'import { tool } from "../../../services/mcp-server/src/tools/unsafe.js";\nexport const broken = tool;\n',
			);

			const result = await runDependencyBoundaryCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.violations[0]).toMatchObject({
				ruleId: "shared-no-business",
				file: "packages/shared-runtime/src/broken.ts",
				resolvedImport: "services/mcp-server/src/tools/unsafe.ts",
			});
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});

	it("fails when tooling imports a private service path instead of the public surface", async () => {
		const rootDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-boundaries-tooling-"),
		);
		try {
			await writeJson(
				path.join(
					rootDir,
					"contracts",
					"governance",
					"dependency-boundaries.json",
				),
				{
					version: 1,
					includeRoots: ["tooling", "services/mcp-server/src"],
					excludePatterns: [],
					rules: [
						{
							id: "tooling-public-surface-only",
							from: ["tooling/**/*.ts"],
							disallow: ["services/mcp-server/src/providers/**"],
							allow: ["services/mcp-server/src/public/**"],
						},
					],
				},
			);
			await writeFile(
				path.join(
					rootDir,
					"services",
					"mcp-server",
					"src",
					"providers",
					"gemini-provider.ts",
				),
				'export const resetGeminiProviderForTests = () => {};\n',
			);
			await writeFile(
				path.join(
					rootDir,
					"services",
					"mcp-server",
					"src",
					"public",
					"provider-testing.ts",
				),
				'export { resetGeminiProviderForTests } from "../providers/gemini-provider.js";\n',
			);
			await writeFile(
				path.join(rootDir, "tooling", "checks", "bad.ts"),
				'import { resetGeminiProviderForTests } from "../../services/mcp-server/src/providers/gemini-provider.js";\nexport const x = resetGeminiProviderForTests;\n',
			);

			const result = await runDependencyBoundaryCheck({ rootDir });

			expect(result.ok).toBe(false);
			expect(result.violations).toContainEqual(
				expect.objectContaining({
					ruleId: "tooling-public-surface-only",
					file: "tooling/checks/bad.ts",
					resolvedImport: "services/mcp-server/src/providers/gemini-provider.ts",
				}),
			);
		} finally {
			await fs.rm(rootDir, { recursive: true, force: true });
		}
	});
});
