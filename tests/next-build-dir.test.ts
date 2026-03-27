import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	resolveNextBuildDir,
	resolveSafeBuildOutputDir,
} from "../packages/shared-runtime/src/next-build-dir.js";

const tempDirs: string[] = [];

async function createSandbox(): Promise<string> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-next-build-dir-"),
	);
	tempDirs.push(dir);
	return dir;
}

async function createRoot(): Promise<string> {
	const sandbox = await createSandbox();
	const root = path.resolve(sandbox, "fixture");
	await fs.mkdir(root, { recursive: true });
	await fs.writeFile(
		path.resolve(root, "package.json"),
		JSON.stringify({ name: "fixture", private: true }, null, 2),
		"utf8",
	);
	return root;
}

async function installFakeNextConfigLoader(root: string): Promise<void> {
	const constantsPath = path.resolve(
		root,
		"node_modules",
		"next",
		"constants.js",
	);
	const loaderPath = path.resolve(
		root,
		"node_modules",
		"next",
		"dist",
		"server",
		"config.js",
	);
	await fs.mkdir(path.dirname(constantsPath), { recursive: true });
	await fs.mkdir(path.dirname(loaderPath), { recursive: true });
	await fs.writeFile(
		constantsPath,
		"module.exports = { PHASE_PRODUCTION_BUILD: 'phase-production-build' };",
		"utf8",
	);
	await fs.writeFile(
		loaderPath,
		[
			"const path = require('node:path');",
			"module.exports = async function loadConfig(phase, dir) {",
			"  const configPath = path.resolve(dir, 'next.config.js');",
			"  const loaded = require(configPath);",
			"  return typeof loaded === 'function' ? await loaded(phase, {}) : loaded;",
			"};",
		].join("\n"),
		"utf8",
	);
}

async function installCustomNextModules(input: {
	root: string;
	constantsSource: string;
	loaderSource: string;
}): Promise<void> {
	const constantsPath = path.resolve(
		input.root,
		"node_modules",
		"next",
		"constants.js",
	);
	const loaderPath = path.resolve(
		input.root,
		"node_modules",
		"next",
		"dist",
		"server",
		"config.js",
	);
	await fs.mkdir(path.dirname(constantsPath), { recursive: true });
	await fs.mkdir(path.dirname(loaderPath), { recursive: true });
	await fs.writeFile(constantsPath, input.constantsSource, "utf8");
	await fs.writeFile(loaderPath, input.loaderSource, "utf8");
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("next build dir resolution", () => {
	it("loads distDir via the Next config loader for function configs", async () => {
		const root = await createRoot();
		await installFakeNextConfigLoader(root);
		await fs.writeFile(
			path.resolve(root, "next.config.js"),
			[
				"module.exports = (phase) => {",
				"  const distDir = phase === 'phase-production-build' ? 'build-output' : 'dev-output';",
				"  return { distDir };",
				"};",
			].join("\n"),
			"utf8",
		);

		await expect(resolveNextBuildDir(root)).resolves.toBe(
			path.resolve(root, "build-output"),
		);
	});

	it("falls back to .next when distDir escapes the project root", async () => {
		const root = await createRoot();
		await fs.writeFile(
			path.resolve(root, "next.config.js"),
			"module.exports = { distDir: '../escape-root' };",
			"utf8",
		);

		await expect(resolveNextBuildDir(root)).resolves.toBe(
			path.resolve(root, ".next"),
		);
	});

	it("falls back to regex parsing when Next loader exports invalid shape", async () => {
		const root = await createRoot();
		await installCustomNextModules({
			root,
			constantsSource:
				"module.exports = { PHASE_PRODUCTION_BUILD: 'phase-production-build' };",
			loaderSource: "module.exports = { unexpected: true };",
		});
		await fs.writeFile(
			path.resolve(root, "next.config.mjs"),
			"export default { distDir: 'fallback-mjs-output' };",
			"utf8",
		);

		await expect(resolveNextBuildDir(root)).resolves.toBe(
			path.resolve(root, "fallback-mjs-output"),
		);
	});

	it("falls back to assignment regex when loader returns a non-object config", async () => {
		const root = await createRoot();
		await installCustomNextModules({
			root,
			constantsSource:
				"module.exports = { PHASE_PRODUCTION_BUILD: 'phase-production-build' };",
			loaderSource: "module.exports = async () => 'not-an-object';",
		});
		await fs.writeFile(
			path.resolve(root, "next.config.cjs"),
			"module.exports.distDir = 'fallback-cjs-output';",
			"utf8",
		);

		await expect(resolveNextBuildDir(root)).resolves.toBe(
			path.resolve(root, "fallback-cjs-output"),
		);
	});

	it("falls back to .next when distDir resolves to the project root itself", () => {
		const root = path.resolve("/tmp", "openui-next-root");

		expect(resolveSafeBuildOutputDir(root, ".")).toBe(
			path.resolve(root, ".next"),
		);
	});

	it("accepts the production phase from an ESM default-exported constants module", async () => {
		const root = await createRoot();
		const nextRoot = path.resolve(root, "node_modules", "next");
		await fs.mkdir(path.resolve(nextRoot, "dist", "server"), {
			recursive: true,
		});
		await fs.writeFile(
			path.resolve(nextRoot, "package.json"),
			JSON.stringify({ type: "module" }, null, 2),
			"utf8",
		);
		await fs.writeFile(
			path.resolve(nextRoot, "constants.js"),
			"export default { PHASE_PRODUCTION_BUILD: 'phase-production-build' };\n",
			"utf8",
		);
		await fs.writeFile(
			path.resolve(nextRoot, "dist", "server", "config.js"),
			[
				"export default async function loadConfig(phase) {",
				"  return { distDir: phase === 'phase-production-build' ? 'esm-default-output' : 'unexpected-output' };",
				"}",
			].join("\n"),
			"utf8",
		);

		await expect(resolveNextBuildDir(root)).resolves.toBe(
			path.resolve(root, "esm-default-output"),
		);
	});
});
