#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST_PATH = path.resolve(
	process.cwd(),
	"tooling/contracts/docs-manual-boundary.contract.json",
);

async function main() {
	const manifestRaw = await readFile(MANIFEST_PATH, "utf8");
	const manifest = JSON.parse(manifestRaw);
	const rules = Array.isArray(manifest.rules)
		? manifest.rules
		: [];
	const errors = [];

	for (const rule of rules) {
		const relativePath = String(rule?.path ?? "").trim();
		if (!relativePath) {
			errors.push("manual boundary rule contains empty path.");
			continue;
		}
		const content = await readFile(path.resolve(process.cwd(), relativePath), "utf8");
		for (const pattern of Array.isArray(rule?.bannedPatterns)
			? rule.bannedPatterns
			: []) {
			const needle = String(pattern ?? "").trim();
			if (needle && content.includes(needle)) {
				errors.push(
					`${relativePath} contains banned high-drift fact marker: ${needle}`,
				);
			}
		}
	}

	if (errors.length > 0) {
		console.error("[docs-manual-boundary] FAILED");
		for (const error of errors) {
			console.error(`- ${error}`);
		}
		process.exit(1);
	}

	console.log(`[docs-manual-boundary] OK (${rules.length} manual docs checked)`);
}

main().catch((error) => {
	console.error(
		`[docs-manual-boundary] ERROR: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
