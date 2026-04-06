import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_MARKERS = [
	{
		file: "README.md",
		required: ["long-lived productized fork", "selective port"],
		forbidden: ["default merge upstream/main"],
	},
	{
		file: "docs/upstream-sync-sop.md",
		required: ["selective port", "whole-repo merge", "exceptional"],
		forbidden: ["default route: merge upstream/main", "default merge upstream/main"],
	},
];

async function runUpstreamPolicyAlignmentCheck(rootDir = process.cwd()) {
	const absoluteRoot = path.resolve(rootDir);
	const errors = [];

	for (const marker of REQUIRED_MARKERS) {
		const content = await fs.readFile(path.resolve(absoluteRoot, marker.file), "utf8");
		const lower = content.toLowerCase();
		for (const required of marker.required) {
			if (!lower.includes(required.toLowerCase())) {
				errors.push(`${marker.file} must include "${required}"`);
			}
		}
		for (const forbidden of marker.forbidden) {
			if (lower.includes(forbidden.toLowerCase())) {
				errors.push(`${marker.file} must not include "${forbidden}"`);
			}
		}
	}

	return {
		ok: errors.length === 0,
		errors,
	};
}

async function main() {
	try {
		const result = await runUpstreamPolicyAlignmentCheck();
		if (!result.ok) {
			console.error("[upstream-policy-alignment] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[upstream-policy-alignment] OK");
	} catch (error) {
		console.error(
			`[upstream-policy-alignment] ERROR: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
	main();
}

export { runUpstreamPolicyAlignmentCheck };
