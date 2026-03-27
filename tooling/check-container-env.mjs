#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import process from "node:process";

const CONTAINER_ENV_MARKERS = [
	"DEVCONTAINER",
	"DOTNET_RUNNING_IN_CONTAINER",
	"KUBERNETES_SERVICE_HOST",
	"container",
];
const REQUIRE_CONTAINER_FLAG = "--require-container";

async function fileExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function detectContainerSignals() {
	const signals = [];

	if (await fileExists("/.dockerenv")) {
		signals.push("/.dockerenv");
	}

	for (const marker of CONTAINER_ENV_MARKERS) {
		const value = process.env[marker];
		if (typeof value === "string" && value.trim().length > 0) {
			signals.push(`env:${marker}=${value.trim()}`);
		}
	}

	try {
		const cgroup = await readFile("/proc/1/cgroup", "utf8");
		if (/(docker|containerd|kubepods|podman|lxc)/i.test(cgroup)) {
			signals.push("cgroup:container-runtime");
		}
	} catch {
		// /proc/1/cgroup may be unavailable on non-Linux hosts; ignore gracefully.
	}

	return signals;
}

async function main() {
	const requireContainer = process.argv.includes(REQUIRE_CONTAINER_FLAG);
	const signals = await detectContainerSignals();
	const inContainer = signals.length > 0;

	const payload = {
		ok: !requireContainer || inContainer,
		inContainer,
		requireContainer,
		signals,
		checkedAt: new Date().toISOString(),
	};

	const output = JSON.stringify(payload, null, 2);
	if (!payload.ok) {
		console.error(output);
		process.exit(1);
	}

	console.log(output);
}

main().catch((error) => {
	console.error(
		JSON.stringify(
			{
				ok: false,
				inContainer: false,
				requireContainer: process.argv.includes(REQUIRE_CONTAINER_FLAG),
				error: error instanceof Error ? error.message : String(error),
			},
			null,
			2,
		),
	);
	process.exit(1);
});
