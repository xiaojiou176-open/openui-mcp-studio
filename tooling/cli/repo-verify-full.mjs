#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

console.error(
	"[repo:verify:full] manual heavy lane: prefer `npm run repo:verify:fast` for routine local checks. `repo:verify:full` keeps the full local container-parity path.",
);

const result = spawnSync("npm", ["run", "ci:local:container"], {
	stdio: "inherit",
	cwd: process.cwd(),
	env: process.env,
});

if ((result.status ?? 1) !== 0) {
	console.error(
		"[repo:verify:full] local parity failed. If the locked CI image is unavailable and you intentionally want to build it on this machine, run `npm run ci:local:container:bootstrap` or use the devcontainer path.",
	);
}

process.exit(result.status ?? 1);
