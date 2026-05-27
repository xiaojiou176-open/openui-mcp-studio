import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTATIONS = [
	{
		file: "README.md",
		required: [
			"english is the canonical source of truth",
			"services/mcp-server",
			"apps/web",
			"contracts/*",
			"tooling/*",
		],
	},
	{
		file: "docs/architecture.md",
		required: [
			"services/mcp-server/src/main.ts",
			"services/mcp-server/src/index.ts",
			"apps/web",
			"mcp server remains the system protocol entrypoint",
			"long-lived productized fork",
			"selective port",
		],
	},
];

async function runIdentityAlignmentCheck(rootDir = process.cwd()) {
	const absoluteRoot = path.resolve(rootDir);
	const errors = [];

	for (const expectation of EXPECTATIONS) {
		const content = await fs.readFile(path.resolve(absoluteRoot, expectation.file), "utf8");
		const lower = content.toLowerCase();
		for (const required of expectation.required) {
			if (!lower.includes(required.toLowerCase())) {
				errors.push(`${expectation.file} must include "${required}"`);
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
		const result = await runIdentityAlignmentCheck();
		if (!result.ok) {
			console.error("[identity-alignment] FAILED");
			for (const error of result.errors) {
				console.error(`- ${error}`);
			}
			process.exit(1);
		}
		console.log("[identity-alignment] OK");
	} catch (error) {
		console.error(
			`[identity-alignment] ERROR: ${error instanceof Error ? error.message : String(error)}`,
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

export { runIdentityAlignmentCheck };
