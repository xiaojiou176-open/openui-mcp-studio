import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDocsCompletenessCheck } from "../tooling/check-doc-completeness.mjs";

const tempRoots: string[] = [];

async function mkTempRoot(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempRoots.push(dir);
	return dir;
}

async function writeToolFile(
	rootDir: string,
	fileName: string,
	toolName: string,
): Promise<void> {
	const toolsDir = path.join(rootDir, "services", "mcp-server", "src", "tools");
	await fs.mkdir(toolsDir, { recursive: true });
	await fs.writeFile(
		path.join(toolsDir, fileName),
		`export function registerTool(server) { server.registerTool("${toolName}", {}, async () => ({ content: [{ type: "text", text: "ok" }] })); }\n`,
		"utf8",
	);
}

async function writeContract(
	rootDir: string,
	payload: unknown,
): Promise<string> {
	const contractPath = path.join(
		rootDir,
		"scripts",
		"contracts",
		"docs-completeness.contract.json",
	);
	await fs.mkdir(path.dirname(contractPath), { recursive: true });
	await fs.writeFile(contractPath, JSON.stringify(payload, null, 2), "utf8");
	return contractPath;
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("docs completeness gate", () => {
	it("passes when every discovered tool has minimumRequest/success/failure and default/advanced scenario layers", async () => {
		const root = await mkTempRoot("openui-doc-gate-pass-");
		await writeToolFile(root, "generate.ts", "openui_generate_ui");
		await writeToolFile(root, "ship.ts", "openui_ship_react_page");

		const contractPath = await writeContract(root, {
			version: 1,
			tools: {
				openui_generate_ui: {
					minimumRequest: "prompt",
					success: "returns html",
					failure: "fails on provider errors",
				},
				openui_ship_react_page: {
					minimumRequest: "prompt",
					success: "returns files",
					failure: "fails on stage errors",
				},
			},
			scenarioMatrix: {
				default: [
					{
						name: "prompt to html",
						tools: ["openui_generate_ui"],
						expected: "html",
					},
				],
				advanced: [
					{
						name: "ship pipeline",
						tools: ["openui_ship_react_page"],
						expected: "stage gate",
					},
				],
			},
		});

		const result = await runDocsCompletenessCheck({
			rootDir: root,
			contractPath,
		});

		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("fails when a tool contract misses required minimum fields", async () => {
		const root = await mkTempRoot("openui-doc-gate-missing-tool-fields-");
		await writeToolFile(root, "generate.ts", "openui_generate_ui");

		const contractPath = await writeContract(root, {
			version: 1,
			tools: {
				openui_generate_ui: {
					minimumRequest: "",
					success: "returns html",
				},
			},
			scenarioMatrix: {
				default: [
					{
						name: "prompt to html",
						tools: ["openui_generate_ui"],
						expected: "html",
					},
				],
				advanced: [
					{
						name: "advanced",
						tools: ["openui_generate_ui"],
						expected: "contract",
					},
				],
			},
		});

		const result = await runDocsCompletenessCheck({
			rootDir: root,
			contractPath,
		});

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((error) => error.includes("minimumRequest")),
		).toBe(true);
		expect(result.errors.some((error) => error.includes("failure"))).toBe(true);
	});

	it("fails when scenario matrix does not provide default and advanced layers", async () => {
		const root = await mkTempRoot("openui-doc-gate-missing-layer-");
		await writeToolFile(root, "generate.ts", "openui_generate_ui");

		const contractPath = await writeContract(root, {
			version: 1,
			tools: {
				openui_generate_ui: {
					minimumRequest: "prompt",
					success: "returns html",
					failure: "fails on provider errors",
				},
			},
			scenarioMatrix: {
				default: [
					{
						name: "prompt to html",
						tools: ["openui_generate_ui"],
						expected: "html",
					},
				],
			},
		});

		const result = await runDocsCompletenessCheck({
			rootDir: root,
			contractPath,
		});

		expect(result.ok).toBe(false);
		expect(
			result.errors.some((error) => error.includes("scenarioMatrix.advanced")),
		).toBe(true);
	});
});
