import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runRemoteCanonicalReview } from "../tooling/remote-canonical-review.mjs";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("remote canonical review", () => {
	it("degrades gracefully when privileged GitHub surfaces are unavailable", async () => {
		const rootDir = await mkTempDir("openui-remote-review-");
		await fs.mkdir(
			path.join(rootDir, ".runtime-cache", "reports", "release-readiness"),
			{
				recursive: true,
			},
		);
		await fs.mkdir(
			path.join(rootDir, ".runtime-cache", "reports", "security"),
			{
				recursive: true,
			},
		);
		const originalCwd = process.cwd();
		process.chdir(rootDir);
		try {
			const result = await runRemoteCanonicalReview({
				rootDir,
				latestTagReader: () => "v0.3.2",
				originUrl: "https://github.com/example/demo.git",
				requiredGithubReader: async (_args, restPathname) => ({
					data:
						restPathname === "repos/example/demo"
							? {
									full_name: "example/demo",
									html_url: "https://github.com/example/demo",
									default_branch: "main",
									private: false,
								}
							: null,
					source: "rest",
				}),
				optionalGithubReader: async () => ({
					data: null,
					source: "unavailable",
				}),
				mirrorAuditRunner: async () => ({
					baselineGitleaks: {
						status: "clean",
						reportPath:
							".runtime-cache/reports/security/final-mirror-gitleaks-baseline.json",
					},
					pullRefsGitleaks: {
						status: "clean",
						reportPath:
							".runtime-cache/reports/security/final-mirror-gitleaks-pull-refs.json",
					},
					trufflehogGit: {
						status: "clean",
						reportPath:
							".runtime-cache/reports/security/final-mirror-trufflehog-git.json",
					},
				}),
			});

			expect(result.ok).toBe(true);
			expect(result.verdict).toBe("clean with accepted caveats");

			const reportPath = path.join(
				rootDir,
				".runtime-cache",
				"reports",
				"release-readiness",
				"remote-canonical-review.json",
			);
			const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
			expect(report.repository.nameWithOwner).toBe("example/demo");
			expect(report.platform.visibility).toBe("unknown");
			expect(report.platform.privateVulnerabilityReporting).toBe("unknown");
			expect(report.notes).toEqual(
				expect.arrayContaining([
					expect.stringContaining("Repository metadata source: unavailable."),
					expect.stringContaining("Branch protection source: unavailable."),
					expect.stringContaining(
						"Live Gemini environment source: unavailable.",
					),
				]),
			);
		} finally {
			process.chdir(originalCwd);
		}
	});
});
