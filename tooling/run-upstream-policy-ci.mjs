#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const UPSTREAM_SYNC_BRANCH_PATTERN = /^chore\/upstream-sync-\d{8}$/;

function resolveBranchName(env = process.env) {
	const headRef = env.GITHUB_HEAD_REF?.trim();
	if (headRef) {
		return headRef;
	}
	return env.GITHUB_REF_NAME?.trim() ?? "";
}

function runUpstreamPolicyCi(options = {}) {
	const env = options.env ?? process.env;
	const branchName = resolveBranchName(env);
	if (!branchName) {
		console.log(
			"Skipping upstream policy check: branch context unavailable in container env.",
		);
		return 0;
	}
	if (!UPSTREAM_SYNC_BRANCH_PATTERN.test(branchName)) {
		console.log(
			`Skipping upstream policy check for branch '${branchName}': only upstream-sync branches are enforced in PR/push CI.`,
		);
		return 0;
	}

	const result = (options.spawnSync ?? spawnSync)(
		NPM_BIN,
		["run", "sync:upstream:check", "--", "--mode=blocking"],
		{
			stdio: "inherit",
			env,
		},
	);
	return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exit(runUpstreamPolicyCi());
}

export { resolveBranchName, runUpstreamPolicyCi, UPSTREAM_SYNC_BRANCH_PATTERN };
