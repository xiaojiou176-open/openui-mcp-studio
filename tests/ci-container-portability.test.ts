import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ci container portability", () => {
	it("avoids sha256sum-only hashing so macOS hosts can compute the runtime marker", async () => {
		const scriptPath = path.resolve(
			import.meta.dirname,
			"..",
			"ops",
			"ci-container",
			"run-in-container.sh",
		);
		const content = await fs.readFile(scriptPath, "utf8");
		expect(content).not.toContain("sha256sum");
		expect(content).toContain("compute_sha256_file");
		expect(content).toContain('crypto.createHash("sha256")');
	});

	it("keeps ci-local-host cleanup scoped to repo-local runtime roots", async () => {
		const scriptPath = path.resolve(
			import.meta.dirname,
			"..",
			"ops",
			"ci-container",
			"run-in-container.sh",
		);
		const content = await fs.readFile(scriptPath, "utf8");
		expect(content).toContain("assert_ci_local_host_path_is_safe");
		expect(content).toContain(
			"must stay under ${WORKSPACE_RUNTIME_CACHE_ROOT}",
		);
		expect(content).toContain(
			'find "${PLAYWRIGHT_CACHE_HOST_PATH}" -mindepth 1 -maxdepth 1',
		);
		expect(content).toContain('find "${HOST_TMPDIR}" -mindepth 1 -maxdepth 1');
		expect(content).toContain('final_status="${bootstrap_status}"');
	});

	it("prevents concurrent repo-local container parity runs for the same workspace", async () => {
		const scriptPath = path.resolve(
			import.meta.dirname,
			"..",
			"ops",
			"ci-container",
			"run-in-container.sh",
		);
		const content = await fs.readFile(scriptPath, "utf8");
		expect(content).toContain("CI_LOCAL_WORKSPACE_LOCK_DIR");
		expect(content).toContain("ci-local-container-${WORKSPACE_TOKEN}.lock");
		expect(content).toContain(
			"another repo-owned local container parity run is already active",
		);
	});
});
