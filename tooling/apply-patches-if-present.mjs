#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const PATCH_DIR = path.resolve(ROOT, "ops/upstream/patches/patch-package");
const RUNNER =
	process.platform === "win32"
		? path.resolve(ROOT, "node_modules/.bin/patch-package.cmd")
		: path.resolve(ROOT, "node_modules/.bin/patch-package");

async function hasPatchFiles(dir) {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		return entries.some((entry) => entry.isFile() && entry.name.endsWith(".patch"));
	} catch {
		return false;
	}
}

async function main() {
	if (!(await hasPatchFiles(PATCH_DIR))) {
		console.log("patch-package skipped: no patch files present");
		return;
	}

	const result = spawnSync(RUNNER, ["--patch-dir", PATCH_DIR], {
		stdio: "inherit",
		shell: true,
	});
	process.exit(result.status ?? 1);
}

main().catch((error) => {
	console.error(
		`patch-package bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
