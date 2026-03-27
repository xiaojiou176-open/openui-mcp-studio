#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const steps = [
	["npm", "run", "-s", "governance:upstream:check"],
	["npm", "run", "-s", "security:history:audit"],
];

for (const [cmd, ...args] of steps) {
	const result = spawnSync(cmd, args, {
		stdio: "inherit",
		cwd: process.cwd(),
		env: process.env,
	});
	if ((result.status ?? 1) !== 0) {
		process.exit(result.status ?? 1);
	}
}

process.exit(0);
