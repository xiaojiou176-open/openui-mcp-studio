#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = process.cwd();
const DOCS_ASSETS_DIR = path.resolve(ROOT, "docs/assets");
const TMP_DIR = path.resolve(ROOT, ".runtime-cache/tmp/public-assets");
const GOLDEN_WORKBENCH = path.resolve(
	ROOT,
	"tests/visual-golden/apps-web-home.png",
);

const COPY_TARGETS = [];

const STATIC_PAGES = [
	{
		input: "docs/assets/openui-mcp-studio-workbench-source.html",
		output: "docs/assets/openui-mcp-studio-workbench.png",
		viewport: { width: 1280, height: 720 },
	},
	{
		input: "docs/assets/openui-mcp-studio-social-preview-source.html",
		output: "docs/assets/openui-mcp-studio-social-preview.png",
		viewport: { width: 1280, height: 640 },
	},
	{
		input: "docs/assets/openui-mcp-studio-workflow-overview-source.html",
		output: "docs/assets/openui-mcp-studio-workflow-overview.png",
		viewport: { width: 1440, height: 760 },
	},
	{
		input: "docs/assets/openui-mcp-studio-comparison-source.html",
		output: "docs/assets/openui-mcp-studio-comparison.png",
		viewport: { width: 1440, height: 1300 },
	},
	{
		input: "docs/assets/openui-mcp-studio-trust-stack-source.html",
		output: "docs/assets/openui-mcp-studio-trust-stack.png",
		viewport: { width: 1440, height: 900 },
	},
	{
		input: "docs/assets/openui-mcp-studio-use-cases-source.html",
		output: "docs/assets/openui-mcp-studio-use-cases.png",
		viewport: { width: 1440, height: 840 },
	},
	{
		input: "docs/assets/openui-mcp-studio-visitor-paths-source.html",
		output: "docs/assets/openui-mcp-studio-visitor-paths.png",
		viewport: { width: 1440, height: 820 },
	},
];

const DEMO_FRAMES = [
	{
		input: "docs/assets/openui-mcp-studio-demo-source-brief.html",
		output: ".runtime-cache/tmp/public-assets/frame-1.png",
		publicOutput: "docs/assets/openui-mcp-studio-demo-brief.png",
		viewport: { width: 1280, height: 720 },
	},
	{
		input: "docs/assets/openui-mcp-studio-demo-source-review.html",
		output: ".runtime-cache/tmp/public-assets/frame-2.png",
		publicOutput: "docs/assets/openui-mcp-studio-demo-review.png",
		viewport: { width: 1280, height: 720 },
	},
	{
		input: "docs/assets/openui-mcp-studio-demo-source-ship.html",
		output: ".runtime-cache/tmp/public-assets/frame-3.png",
		publicOutput: "docs/assets/openui-mcp-studio-demo-ship.png",
		viewport: { width: 1280, height: 720 },
	},
];

const GIF_OUTPUT = path.resolve(DOCS_ASSETS_DIR, "openui-mcp-studio-demo.gif");
const RELEASE_ASSET_NAMES = [
	"openui-mcp-studio-demo.gif",
	"openui-mcp-studio-social-preview.png",
	"openui-mcp-studio-workbench.png",
	"openui-mcp-studio-workflow-overview.png",
	"openui-mcp-studio-comparison.png",
	"openui-mcp-studio-trust-stack.png",
	"openui-mcp-studio-use-cases.png",
	"openui-mcp-studio-visitor-paths.png",
];

function parseArgs(argv) {
	return {
		check: argv.includes("--check"),
	};
}

async function pathExists(targetPath) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function ensureDir(targetPath) {
	await fs.mkdir(targetPath, { recursive: true });
}

async function getMtimeMs(targetPath) {
	const stats = await fs.stat(targetPath);
	return stats.mtimeMs;
}

async function copyWorkbenchAsset() {
	for (const target of COPY_TARGETS) {
		await fs.copyFile(target.source, target.output);
	}
}

async function copyDemoFramesToPublicAssets() {
	for (const frame of DEMO_FRAMES) {
		if (!frame.publicOutput) {
			continue;
		}
		await fs.copyFile(
			path.resolve(ROOT, frame.output),
			path.resolve(ROOT, frame.publicOutput),
		);
	}
}

async function renderPages(pageSpecs) {
	const browser = await chromium.launch({ headless: true });
	try {
		for (const spec of pageSpecs) {
			const page = await browser.newPage({
				viewport: spec.viewport,
				deviceScaleFactor: 1,
			});
			const inputPath = path.resolve(ROOT, spec.input);
			const outputPath = path.resolve(ROOT, spec.output);
			await page.goto(pathToFileURL(inputPath).toString());
			await page.screenshot({ path: outputPath });
			await page.close();
		}
	} finally {
		await browser.close();
	}
}

function runCommand(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "inherit", "inherit"],
			env: process.env,
		});
		child.once("error", reject);
		child.once("close", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} terminated by signal ${signal}`));
				return;
			}
			if ((code ?? 1) !== 0) {
				reject(new Error(`${command} exited with code ${code ?? 1}`));
				return;
			}
			resolve();
		});
	});
}

async function renderGif() {
	const inputPattern = path.resolve(TMP_DIR, "frame-%d.png");
	await runCommand("ffmpeg", [
		"-y",
		"-framerate",
		"1/2",
		"-start_number",
		"1",
		"-i",
		inputPattern,
		"-vf",
		"fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
		GIF_OUTPUT,
	]);
}

async function collectCheckErrors() {
	const errors = [];
	const inputs = [
		GOLDEN_WORKBENCH,
		...STATIC_PAGES.map((spec) => path.resolve(ROOT, spec.input)),
		...DEMO_FRAMES.map((spec) => path.resolve(ROOT, spec.input)),
	];
	for (const inputPath of inputs) {
		if (!(await pathExists(inputPath))) {
			errors.push(`missing required input: ${path.relative(ROOT, inputPath)}`);
		}
	}

	const outputs = [
		...COPY_TARGETS.map((target) => target.output),
		...STATIC_PAGES.map((spec) => path.resolve(ROOT, spec.output)),
		...DEMO_FRAMES.filter((spec) => Boolean(spec.publicOutput)).map((spec) =>
			path.resolve(ROOT, spec.publicOutput),
		),
		GIF_OUTPUT,
	];
	for (const outputPath of outputs) {
		if (!(await pathExists(outputPath))) {
			errors.push(`missing generated asset: ${path.relative(ROOT, outputPath)}`);
		}
	}

	const freshnessPairs = [
		...COPY_TARGETS.map((target) => ({
			inputs: [target.source],
			output: target.output,
		})),
		...STATIC_PAGES.map((spec) => ({
			inputs: [
				path.resolve(ROOT, spec.input),
				GOLDEN_WORKBENCH,
			],
			output: path.resolve(ROOT, spec.output),
		})),
		...DEMO_FRAMES.filter((spec) => Boolean(spec.publicOutput)).map((spec) => ({
			inputs: [
				path.resolve(ROOT, spec.input),
				GOLDEN_WORKBENCH,
			],
			output: path.resolve(ROOT, spec.publicOutput),
		})),
		{
			inputs: [
				...DEMO_FRAMES.map((spec) => path.resolve(ROOT, spec.input)),
				GOLDEN_WORKBENCH,
			],
			output: GIF_OUTPUT,
		},
	];

	for (const pair of freshnessPairs) {
		if (!(await pathExists(pair.output))) {
			continue;
		}
		const outputMtime = await getMtimeMs(pair.output);
		for (const inputPath of pair.inputs) {
			const inputMtime = await getMtimeMs(inputPath);
			if (inputMtime > outputMtime) {
				errors.push(
					`stale asset: ${path.relative(ROOT, pair.output)} is older than ${path.relative(ROOT, inputPath)}`,
				);
			}
		}
	}

	return errors;
}

async function main() {
	const { check } = parseArgs(process.argv.slice(2));
	await ensureDir(DOCS_ASSETS_DIR);
	await ensureDir(TMP_DIR);

	if (check) {
		const errors = await collectCheckErrors();
		if (errors.length > 0) {
			console.error("[public-assets] FAILED");
			for (const error of errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log(
			`[public-assets] OK (${RELEASE_ASSET_NAMES.length} tracked public assets checked)`,
		);
		return;
	}

	await copyWorkbenchAsset();
	await renderPages(STATIC_PAGES);
	await renderPages(DEMO_FRAMES);
	await copyDemoFramesToPublicAssets();
	await renderGif();
	console.log(
		`[public-assets] rendered ${RELEASE_ASSET_NAMES.length} tracked public assets`,
	);
}

main().catch((error) => {
	console.error(
		`[public-assets] ERROR: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
