#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync("npm", ["run", "ci:local:container"], {
	stdio: "inherit",
	cwd: process.cwd(),
	env: process.env,
});

process.exit(result.status ?? 1);
