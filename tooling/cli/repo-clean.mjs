#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const argv = process.argv.slice(2);
const fullMode = !argv.includes("--runtime-only");
const script = fullMode ? "clean:runtime:full" : "clean:runtime";
const result = spawnSync("npm", ["run", "-s", script], {
	stdio: "inherit",
	cwd: process.cwd(),
	env: process.env,
});

process.exit(result.status ?? 1);
