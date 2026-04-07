import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const governanceScriptPath = path.join(
	repoRoot,
	"tooling",
	"check-workflow-governance.mjs",
);
const COMMIT_SHA_REF_PATTERN = /^[0-9a-f]{40}$/i;
const DOCKER_DIGEST_REF_PATTERN = /^sha256:[0-9a-f]{64}$/i;

function parseUsesRefFromLine(line: string): string | null {
	const usesMatch = line.match(
		/^\s*(?:-\s+)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:\s+#.*)?\s*$/,
	);
	if (!usesMatch) {
		return null;
	}
	return usesMatch[1] ?? usesMatch[2] ?? usesMatch[3] ?? null;
}

function collectUsesRefs(workflow: string): string[] {
	const refs: string[] = [];
	for (const line of workflow.split(/\r?\n/)) {
		const usesRef = parseUsesRefFromLine(line);
		if (usesRef) {
			refs.push(usesRef);
		}
	}
	return refs;
}

function getJobSection(workflow: string, jobId: string): string {
	const jobHeader = `  ${jobId}:\n`;
	const sectionStart = workflow.indexOf(jobHeader);
	if (sectionStart === -1) {
		throw new Error(`Missing workflow job section: ${jobId}`);
	}
	const remainder = workflow.slice(sectionStart + jobHeader.length);
	const nextJobMatcher = /^\s{2}[A-Za-z0-9_-]+:\n/m;
	const nextJobMatch = nextJobMatcher.exec(remainder);
	if (!nextJobMatch || nextJobMatch.index === undefined) {
		return remainder;
	}
	return remainder.slice(0, nextJobMatch.index);
}

function getJobIds(workflow: string): string[] {
	return Array.from(workflow.matchAll(/^\s{2}([A-Za-z0-9_-]+):\n/gm)).map(
		(match) => match[1],
	);
}

function getJobNeeds(workflow: string, jobId: string): string[] {
	const section = getJobSection(workflow, jobId);
	const lines = section.split(/\r?\n/);
	const needsStart = lines.findIndex((line) => /^\s*needs:\s*$/.test(line));
	if (needsStart === -1) {
		return [];
	}

	const needs: string[] = [];
	for (const line of lines.slice(needsStart + 1)) {
		const needsItemMatch = line.match(/^\s*-\s*([A-Za-z0-9_-]+)\s*$/);
		if (!needsItemMatch) {
			break;
		}
		needs.push(needsItemMatch[1]);
	}
	return needs;
}

function isImmutableUsesRef(usesRef: string): boolean {
	const ref = usesRef.slice(usesRef.lastIndexOf("@") + 1);
	if (usesRef.startsWith("docker://")) {
		return DOCKER_DIGEST_REF_PATTERN.test(ref);
	}
	return COMMIT_SHA_REF_PATTERN.test(ref);
}

async function readWorkflowFiles(): Promise<
	Array<{ name: string; content: string }>
> {
	const workflowsDir = path.join(repoRoot, ".github", "workflows");
	const entries = await fs.readdir(workflowsDir, { withFileTypes: true });
	const files = entries
		.filter(
			(entry) =>
				entry.isFile() &&
				(entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
		)
		.map((entry) => entry.name)
		.sort();
	return Promise.all(
		files.map(async (name) => ({
			name,
			content: await fs.readFile(path.join(workflowsDir, name), "utf8"),
		})),
	);
}

async function withTempWorkflow(
	prefix: string,
	lines: string[],
	assertion: (tempRoot: string) => Promise<void>,
	fileName = "sample.yml",
): Promise<void> {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	const workflowsDir = path.join(tempRoot, ".github", "workflows");
	const workflowPath = path.join(workflowsDir, fileName);

	try {
		await fs.mkdir(workflowsDir, { recursive: true });
		await fs.writeFile(workflowPath, lines.join("\n"), "utf8");
		await assertion(tempRoot);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
}

describe("ci workflow hardening", () => {
	it("passes composite action command input through env to preserve multiline shell safely", async () => {
		const actionPath = path.join(
			repoRoot,
			".github/actions/run-in-ci-container/action.yml",
		);
		const action = await fs.readFile(actionPath, "utf8");

		expect(action).toContain(`INPUT_COMMAND: \${{ inputs.command }}`);
		expect(action).toContain(
			`INPUT_GEMINI_API_KEY: \${{ inputs.gemini_api_key }}`,
		);
		expect(action).toContain(
			`export GEMINI_API_KEY="\${INPUT_GEMINI_API_KEY}"`,
		);
		expect(action).toContain(`--command "\${INPUT_COMMAND}"`);
		expect(action).not.toContain(`--command "\${{ inputs.command }}"`);
	});

	it("parses quoted uses refs and keeps immutable pin checks", () => {
		const workflow = `
jobs:
  quoted_refs:
    steps:
      - uses: actions/checkout@393031adb9afb225ee52ae2ccd7a5af5525e03e8
      - uses: "rhysd/actionlint@393031adb9afb225ee52ae2ccd7a5af5525e03e8"
      - uses: 'docker://alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      - uses: "./.github/actions/local-check"
`;
		const refs = collectUsesRefs(workflow);
		expect(refs).toEqual([
			"actions/checkout@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
			"rhysd/actionlint@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
			"docker://alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			"./.github/actions/local-check",
		]);
		expect(isImmutableUsesRef(refs[0])).toBe(true);
		expect(isImmutableUsesRef(refs[1])).toBe(true);
		expect(isImmutableUsesRef(refs[2])).toBe(true);
	});

	it("treats quoted tag refs as non-immutable", () => {
		const refs = collectUsesRefs(
			`      - uses: "actions/checkout@v4" # should be pinned to commit sha`,
		);
		expect(refs).toEqual(["actions/checkout@v4"]);
		expect(isImmutableUsesRef(refs[0])).toBe(false);
	});

	it("contains workflow lint gate and strict timeout controls by target jobs", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const workflowLintSection = getJobSection(workflow, "workflow_lint");
		const qualitySection = getJobSection(workflow, "quality");
		const nightlyCoverageSection = getJobSection(
			workflow,
			"nightly_coverage_gate",
		);
		const rollbackDrillSection = getJobSection(workflow, "rollback_drill");

		expect(workflowLintSection).toContain("name: Workflow Lint");
		expect(workflowLintSection).toContain("Install actionlint");
		expect(workflowLintSection).toContain(
			`archive="actionlint_\${version}_linux_amd64.tar.gz"`,
		);
		expect(workflowLintSection).toContain(
			[
				"900919a8",
				"4f2229ba",
				"c68ca9cd",
				"4103ea29",
				"7abc35e9",
				"689ebb84",
				"2c6e34a3",
				"d1b01b0a",
			].join(""),
		);
		expect(workflowLintSection).toContain(
			"curl -fL --retry 3 --retry-delay 2 --retry-connrefused",
		);
		expect(workflowLintSection).toContain(
			`echo "\${install_dir}" >> "\${GITHUB_PATH}"`,
		);
		expect(workflowLintSection).toContain("run: actionlint -color");
		expect(qualitySection).toContain("timeout-minutes: 40");
		expect(nightlyCoverageSection).toContain("timeout-minutes: 60");
		expect(rollbackDrillSection).toContain("timeout-minutes: 15");
		expect(qualitySection).toContain(
			"uses: ./.github/actions/run-in-ci-container",
		);
		expect(qualitySection).toContain(
			"Bootstrap CI image from tracked Dockerfile",
		);
		expect(qualitySection).toContain(
			"DOCKER_BUILDKIT=1 docker build -f .devcontainer/Dockerfile . --progress=plain",
		);
		expect(qualitySection).toContain("command: npm run ci:gate:container");
		expect(qualitySection).not.toContain("GEMINI_API_KEY:");
		expect(qualitySection).not.toContain('python-version: "3.11"');
		expect(qualitySection).toContain(
			".runtime-cache/runs/**/artifacts/playwright/**",
		);
		expect(qualitySection).not.toContain("playwright-report/**");
		expect(qualitySection).not.toContain("tests/artifacts/playwright/**");
	});

	it("enables CI image sbom and provenance evidence in build-ci-image workflow", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/build-ci-image.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");

		expect(workflow).toContain("attestations: write");
		expect(workflow).toContain("id-token: write");
		expect(workflow).toContain("--sbom=true");
		expect(workflow).toContain("--attest type=provenance,mode=max");
		expect(workflow).toContain(
			"actions/attest-build-provenance@10334b5f1e684784025c3fc0a277c88c19089275",
		);
		expect(workflow).toContain("id: build_push");
		expect(workflow).toContain(".runtime-cache/ci-image/build-metadata.json");
		expect(workflow).toContain(".runtime-cache/ci-image-artifact/");
		expect(workflow).toContain(`cat > "\${artifact_dir}/status.json" <<EOF`);
		expect(workflow).toContain(
			".runtime-cache/ci-image/supply-chain-evidence.json",
		);
	});

	it("defines a public CI health workflow without exposing internal runner topology", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/shared-runner-health.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");
		const healthSection = getJobSection(workflow, "public_ci_health");

		expect(workflow).toContain("runs-on: ubuntu-latest");
		expect(workflow).toContain("workflow_dispatch:");
		expect(workflow).toContain('cron: "*/30 * * * *"');
		expect(workflow).toContain("Verify public workflow infra boundary");
		expect(workflow).not.toContain("github-runner-core-01");
		expect(workflow).not.toContain("pool-core01-01");
		expect(workflow).not.toContain("gcloud");
		expect(healthSection).toContain("permissions:");
		expect(healthSection).toContain("Public CI Contract Health");
		expect(healthSection).toContain("Runner contract: github-hosted only");
		expect(healthSection).toContain("contents: read");
		expect(workflow).toContain("GITHUB_STEP_SUMMARY");
		expect(workflow).not.toContain("curl -fsSL");
		expect(workflow).not.toContain("google-github-actions/auth@");
		expect(workflow).not.toContain("google-github-actions/setup-gcloud@");
		expect(workflow).not.toContain('http_code="$(curl -sSL \\');
		expect(workflow).not.toContain(
			"::warning title=Shared runner health query transient failure::",
		);
		expect(workflow).not.toContain(
			"::warning title=Shared runner health mismatch::",
		);
		expect(workflow).not.toMatch(
			/\bconfig\.sh\b|\b\.\/run\.sh\b|\bremove\.sh\b/,
		);
	});

	it("keeps release-readiness on hosted runners while preserving container execution", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/release-readiness.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");
		const releaseReadinessSection = getJobSection(
			workflow,
			"release_readiness",
		);

		expect(releaseReadinessSection).toContain("runs-on: ubuntu-latest");
		expect(releaseReadinessSection).not.toContain("self-hosted");
		expect(releaseReadinessSection).not.toContain("shared-pool");
		expect(releaseReadinessSection).toContain(
			"uses: ./.github/actions/run-in-ci-container",
		);
		expect(releaseReadinessSection).toContain(
			"command: node tooling/check-release-readiness.mjs --output=.runtime-cache/reports/release-readiness/report.json",
		);
	});

	it("keeps runtime checks inside quality instead of a duplicate functional lane", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const qualitySection = getJobSection(workflow, "quality");
		const workflowGovernanceSection = getJobSection(
			workflow,
			"workflow_governance",
		);

		expect(workflow).not.toContain("\n  functional_strict:\n");
		expect(qualitySection).toContain("Full quality gate in CI container");
		expect(qualitySection).toContain("command: npm run ci:gate:container");
		expect(workflowGovernanceSection).toContain("name: Workflow Governance");
		expect(workflowGovernanceSection).toContain(
			"command: npm run governance:workflow:check",
		);
	});

	it("routes branch-aware upstream policy through a repo-local helper before entering the container bridge", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const qualitySection = getJobSection(workflow, "quality");

		expect(qualitySection).toContain(
			"command: node tooling/run-upstream-policy-ci.mjs",
		);
		expect(qualitySection).not.toContain("command=\"$(cat <<'EOF'");
		expect(qualitySection).not.toContain("branch_name=");
		expect(qualitySection).not.toContain("GITHUB_HEAD_REF");
		expect(qualitySection).not.toContain("GITHUB_REF_NAME");
	});

	it("routes flake metrics through a helper so missing summaries stay advisory", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const qualitySection = getJobSection(workflow, "quality");

		expect(qualitySection).toContain(
			"command: node tooling/run-ci-flake-metrics.mjs",
		);
		expect(qualitySection).not.toContain("flake_metrics_command");
	});

	it("treats always-run quality artifacts as advisory evidence uploads", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const qualitySection = getJobSection(workflow, "quality");

		expect(qualitySection).toContain("Upload env inventory artifact");
		expect(qualitySection).toContain("Upload ci-gate summary");
		expect(qualitySection).toContain("Upload flake metrics artifact");
		expect(qualitySection).toContain(
			`name: env-inventory-\${{ github.run_id }}-\${{ github.run_attempt }}`,
		);
		expect(qualitySection).toContain(
			`name: ci-gate-summary-\${{ github.run_id }}-\${{ github.run_attempt }}`,
		);
		expect(qualitySection).toContain(
			`name: flake-metrics-\${{ github.run_id }}-\${{ github.run_attempt }}`,
		);
		expect(qualitySection).toContain("if-no-files-found: ignore");
		expect(qualitySection).toContain(
			"command: node tooling/run-ci-flake-metrics.mjs",
		);
	});

	it("enforces fast-before-long dependency for live hard gate", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const liveGateSection = getJobSection(workflow, "live_gemini_hard_gate");
		const nightlyCrossBrowserSection = getJobSection(
			workflow,
			"nightly_cross_browser",
		);
		const liveGateNeeds = getJobNeeds(workflow, "live_gemini_hard_gate");

		expect(liveGateSection).toContain("name: Live Gemini hard gate");
		expect(liveGateSection).toContain("environment: live-gemini-manual");
		expect(liveGateNeeds).toContain("quality");
		expect(liveGateNeeds).not.toContain("functional_strict");
		expect(nightlyCrossBrowserSection).toContain(
			`command: node tooling/run-with-heartbeat.mjs --label=nightly-cross-browser-\${{ matrix.project }} -- npx playwright test --config=playwright.config.ts --project=\${{ matrix.project }}`,
		);
	});

	it("routes fork pull requests to a hosted static governance lane", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const untrustedSection = getJobSection(
			workflow,
			"untrusted_pr_static_governance",
		);

		expect(untrustedSection).toContain("runs-on: ubuntu-latest");
		expect(untrustedSection).toContain("Workflow lint");
		expect(untrustedSection).toContain("Workflow governance");
		expect(untrustedSection).toContain("Docs governance");
		expect(untrustedSection).toContain("Env governance");
		expect(untrustedSection).toContain("Commitlint range");
		expect(untrustedSection).toContain("Gitleaks scan");
	});

	it("requires gitleaks report artifact and disallows silent missing files", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const secretScanSection = getJobSection(workflow, "secret_scan");

		expect(secretScanSection).toContain(
			`pkg="gitleaks_8.24.2_\${os}_\${arch}.tar.gz"`,
		);
		expect(secretScanSection).toContain(
			`https://github.com/gitleaks/gitleaks/releases/download/v8.24.2/\${pkg}`,
		);
		expect(secretScanSection).toContain("/tmp/gitleaks detect \\");
		expect(secretScanSection).toContain("Upload gitleaks report");
		expect(secretScanSection).toContain("if-no-files-found: error");
		expect(secretScanSection).not.toContain("if-no-files-found: ignore");
	});

	it("routes trusted CI jobs through the public runner selector contract and keeps fork PRs on hosted runners", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const runnerSelectorSection = getJobSection(workflow, "runner_selector");
		const runnerBootstrapSection = getJobSection(workflow, "runner_bootstrap");
		const untrustedSection = getJobSection(
			workflow,
			"untrusted_pr_static_governance",
		);

		expect(runnerSelectorSection).toContain(
			"runs_on_json='[\"ubuntu-latest\"]'",
		);
		expect(runnerSelectorSection).toContain('tier="public-github-hosted"');
		expect(runnerSelectorSection).toContain('mode="public_default"');
		expect(runnerSelectorSection).not.toContain("shared_pool_json");
		expect(runnerSelectorSection).not.toContain("self-hosted");
		expect(runnerSelectorSection).not.toContain("shared-pool");
		expect(runnerBootstrapSection).toContain("runs-on: ubuntu-latest");
		expect(runnerBootstrapSection).toContain("Public Runner Contract");
		expect(runnerBootstrapSection).toContain("github-hosted contract");
		expect(runnerBootstrapSection).not.toContain("pool-core01-01");
		expect(runnerBootstrapSection).not.toContain("gcloud");
		expect(workflow).not.toContain("config.sh");
		expect(workflow).not.toContain("./run.sh");
		expect(workflow).not.toContain("remove.sh");
		expect(untrustedSection).toContain("runs-on: ubuntu-latest");
	});

	it("does not allow continue-on-error in the public-safe ci workflow", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const continueMatches =
			workflow.match(/^\s*continue-on-error:\s*true\s*$/gm) ?? [];

		expect(continueMatches).toHaveLength(0);

		for (const jobId of getJobIds(workflow)) {
			const section = getJobSection(workflow, jobId);
			expect(/^\s*continue-on-error:\s*true\s*$/m.test(section)).toBe(false);
		}
	});

	it("pins every ci workflow action to a commit sha", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const refs = collectUsesRefs(workflow);
		expect(refs.length).toBeGreaterThan(0);
		for (const usesRef of refs) {
			if (usesRef.startsWith("./")) {
				continue;
			}
			expect(isImmutableUsesRef(usesRef)).toBe(true);
		}
		expect(workflow).not.toMatch(/uses:\s*[^\s#]+@v\d/);
	});

	it("supports scanning .yaml workflow files in governance checks", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-governance-yaml-"),
		);
		const workflowsDir = path.join(tempRoot, ".github", "workflows");
		const workflowPath = path.join(workflowsDir, "sample.yaml");

		try {
			await fs.mkdir(workflowsDir, { recursive: true });
			await fs.writeFile(
				workflowPath,
				[
					"name: governance-yaml",
					"on: [push]",
					"jobs:",
					"  sample:",
					"    runs-on: ubuntu-latest",
					"    timeout-minutes: 5",
					"    steps:",
					"      - uses: actions/checkout@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
				].join("\n"),
				"utf8",
			);

			const { stdout } = await execFileAsync(
				process.execPath,
				[governanceScriptPath],
				{
					cwd: tempRoot,
				},
			);
			expect(stdout).toContain(
				"OK: 1 workflow files and 0 composite action files passed strict checks.",
			);
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}, 15000);

	it("rejects workflow files that set high-risk permissions write-all", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-governance-permissions-"),
		);
		const workflowsDir = path.join(tempRoot, ".github", "workflows");
		const workflowPath = path.join(workflowsDir, "sample.yml");

		try {
			await fs.mkdir(workflowsDir, { recursive: true });
			await fs.writeFile(
				workflowPath,
				[
					"name: governance-permissions",
					"on: [push]",
					"permissions: write-all",
					"jobs:",
					"  sample:",
					"    runs-on: ubuntu-latest",
					"    timeout-minutes: 5",
					"    steps:",
					"      - uses: actions/checkout@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
				].join("\n"),
				"utf8",
			);

			await expect(
				execFileAsync(process.execPath, [governanceScriptPath], {
					cwd: tempRoot,
				}),
			).rejects.toMatchObject({
				stderr: expect.stringContaining(
					"high-risk permissions: write-all, which is forbidden",
				),
			});
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("rejects expression-based continue-on-error values", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-governance-expression-"),
		);
		const workflowsDir = path.join(tempRoot, ".github", "workflows");
		const workflowPath = path.join(workflowsDir, "sample.yml");

		try {
			await fs.mkdir(workflowsDir, { recursive: true });
			await fs.writeFile(
				workflowPath,
				[
					"name: governance-expression",
					"on: [push]",
					"jobs:",
					"  sample:",
					"    runs-on: ubuntu-latest",
					"    timeout-minutes: 5",
					"    steps:",
					"      - id: guarded",
					`        continue-on-error: \${{ github.ref != 'refs/heads/main' }}`,
					"        run: echo guarded",
				].join("\n"),
				"utf8",
			);

			await expect(
				execFileAsync(process.execPath, [governanceScriptPath], {
					cwd: tempRoot,
				}),
			).rejects.toMatchObject({
				stderr: expect.stringContaining(
					"expression-based continue-on-error, which is forbidden",
				),
			});
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});

	it("keeps pre-commit cache outside the workspace cleanup path", async () => {
		const workflowPath = path.join(repoRoot, ".github/workflows/ci.yml");
		const workflow = await fs.readFile(workflowPath, "utf8");
		const precommitGateSection = getJobSection(workflow, "precommit_gate");

		expect(precommitGateSection).toContain(
			"Run pre-commit config (gitleaks, ruff)",
		);
		expect(precommitGateSection).toContain(
			"PRE_COMMIT_HOME=/tmp/pre-commit-cache",
		);
		expect(precommitGateSection).toContain(
			"/tmp/precommit-venv/bin/pre-commit run --all-files",
		);
		expect(precommitGateSection).not.toContain(
			`env:\n      PRE_COMMIT_HOME: \${{ runner.temp }}/pre-commit-cache`,
		);
		expect(precommitGateSection).not.toContain(
			"PRE_COMMIT_HOME: ~/.cache/pre-commit",
		);
		expect(precommitGateSection).not.toContain("path: ~/.cache/pre-commit");
		expect(precommitGateSection).not.toContain(
			`Restore pre-commit cache
        env:
          PRE_COMMIT_HOME: \${{ runner.temp }}/pre-commit-cache
        uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306`,
		);
	});

	it("rejects clean false outside the narrow checkout allowlist", async () => {
		await withTempWorkflow(
			"openui-workflow-governance-clean-false-",
			[
				"name: governance-clean-false",
				"on: [push]",
				"jobs:",
				"  sample:",
				"    runs-on: ubuntu-latest",
				"    timeout-minutes: 5",
				"    steps:",
				"      - name: Checkout",
				"        uses: actions/checkout@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
				"        with:",
				"          clean: false",
			],
			async (tempRoot) => {
				await expect(
					execFileAsync(process.execPath, [governanceScriptPath], {
						cwd: tempRoot,
					}),
				).rejects.toMatchObject({
					stderr: expect.stringContaining(
						"sets clean: false outside the narrow checkout allowlist",
					),
				});
			},
		);
	});

	it("rejects workflows that wire caches directly into ~/.cache", async () => {
		await withTempWorkflow(
			"openui-workflow-governance-home-cache-",
			[
				"name: governance-home-cache",
				"on: [push]",
				"jobs:",
				"  sample:",
				"    runs-on: ubuntu-latest",
				"    timeout-minutes: 5",
				"    steps:",
				"      - name: Cache Playwright",
				"        uses: actions/cache@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
				"        with:",
				"          path: ~/.cache/ms-playwright",
				"          key: sample-playwright-cache",
			],
			async (tempRoot) => {
				await expect(
					execFileAsync(process.execPath, [governanceScriptPath], {
						cwd: tempRoot,
					}),
				).rejects.toMatchObject({
					stderr: expect.stringContaining(
						"uses a direct ~/.cache path, which is forbidden in workflows",
					),
				});
			},
		);
	});

	it("rejects global pip installs inside governed workflows", async () => {
		await withTempWorkflow(
			"openui-workflow-governance-hosted-pip-",
			[
				"name: governance-hosted-pip",
				"on: [push]",
				"jobs:",
				"  sample:",
				"    runs-on: ubuntu-latest",
				"    timeout-minutes: 5",
				"    steps:",
				"      - name: Install pre-commit globally",
				"        run: python -m pip install --upgrade pip pre-commit",
			],
			async (tempRoot) => {
				await expect(
					execFileAsync(process.execPath, [governanceScriptPath], {
						cwd: tempRoot,
					}),
				).rejects.toMatchObject({
					stderr: expect.stringContaining(
						"runs global python -m pip install inside workflow job",
					),
				});
			},
		);
	});

	it("rejects playwright install with deps inside governed workflows", async () => {
		await withTempWorkflow(
			"openui-workflow-governance-hosted-playwright-",
			[
				"name: governance-hosted-playwright",
				"on: [push]",
				"jobs:",
				"  sample:",
				"    runs-on: ubuntu-latest",
				"    timeout-minutes: 5",
				"    steps:",
				"      - name: Install Playwright browsers",
				"        run: npx playwright install --with-deps chromium firefox webkit",
			],
			async (tempRoot) => {
				await expect(
					execFileAsync(process.execPath, [governanceScriptPath], {
						cwd: tempRoot,
					}),
				).rejects.toMatchObject({
					stderr: expect.stringContaining(
						"runs playwright install --with-deps inside workflow job",
					),
				});
			},
		);
	});

	it("allows governed workflows to use runner temp cache indirection and venv installs", async () => {
		await withTempWorkflow(
			"openui-workflow-governance-hosted-safe-",
			[
				"name: governance-hosted-safe",
				"on: [push]",
				"jobs:",
				"  sample:",
				"    runs-on: ubuntu-latest",
				"    timeout-minutes: 5",
				"    env:",
				`      PLAYWRIGHT_BROWSERS_PATH: \${{ runner.temp }}/ms-playwright`,
				"    steps:",
				"      - name: Setup venv",
				"        run: python -m venv .venv",
				"      - name: Install pre-commit in venv",
				"        run: .venv/bin/python -m pip install --upgrade pip pre-commit",
				"      - name: Cache Playwright browsers",
				"        uses: actions/cache@393031adb9afb225ee52ae2ccd7a5af5525e03e8",
				"        with:",
				`          path: \${{ env.PLAYWRIGHT_BROWSERS_PATH }}`,
				"          key: sample-playwright-cache",
				"      - name: Install Playwright browsers",
				"        run: npx playwright install chromium firefox",
			],
			async (tempRoot) => {
				const { stdout } = await execFileAsync(
					process.execPath,
					[governanceScriptPath],
					{
						cwd: tempRoot,
					},
				);
				expect(stdout).toContain(
					"OK: 1 workflow files and 0 composite action files passed strict checks.",
				);
			},
		);
	});

	it("rejects shell failure suppression patterns in workflow run steps", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "openui-workflow-governance-shell-"),
		);
		const workflowsDir = path.join(tempRoot, ".github", "workflows");
		const workflowPath = path.join(workflowsDir, "sample.yml");

		try {
			await fs.mkdir(workflowsDir, { recursive: true });
			await fs.writeFile(
				workflowPath,
				[
					"name: governance-shell-suppression",
					"on: [push]",
					"jobs:",
					"  sample:",
					"    runs-on: ubuntu-latest",
					"    timeout-minutes: 5",
					"    steps:",
					"      - id: swallow",
					"        run: npm run lint || :",
					"      - id: semicolon_true",
					"        run: npm run test; true",
					"      - id: set_plus_e",
					"        run: |",
					"          set +e",
					"          npm run build",
				].join("\n"),
				"utf8",
			);

			const failure = await execFileAsync(
				process.execPath,
				[governanceScriptPath],
				{
					cwd: tempRoot,
				},
			)
				.then(() => ({ stderr: "" }))
				.catch((error: { stderr?: string }) => ({
					stderr: error.stderr ?? "",
				}));
			expect(failure.stderr).toContain("contains '|| :',");
			expect(failure.stderr).toContain("contains '; true',");
			expect(failure.stderr).toContain("contains 'set +e',");
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	});
});

describe("quality trend workflow hardening", () => {
	it("fails when ci:gate or mutation input generation fails", async () => {
		const workflowPath = path.join(
			repoRoot,
			".github/workflows/quality-trend-weekly.yml",
		);
		const workflow = await fs.readFile(workflowPath, "utf8");

		expect(workflow).toContain("id: ci_gate_run");
		expect(workflow).toContain("id: mutation_run");
		expect(workflow).toContain("Fail workflow when gate inputs fail");
		expect(workflow).toContain("steps.ci_gate_run.outcome");
		expect(workflow).toContain("steps.mutation_run.outcome");
		expect(workflow).toContain("if-no-files-found: error");
		expect(workflow).not.toContain("npm run ci:gate || true");
		expect(workflow).not.toContain("npm run mutation:run:full || true");
	});

	it("pins every workflow action across .github/workflows to a commit sha", async () => {
		const workflows = await readWorkflowFiles();
		expect(workflows.length).toBeGreaterThan(0);
		for (const { name, content } of workflows) {
			const refs = collectUsesRefs(content);
			expect(refs.length).toBeGreaterThan(0);
			for (const usesRef of refs) {
				if (usesRef.startsWith("./")) {
					continue;
				}
				expect(
					isImmutableUsesRef(usesRef),
					`${name}: non-immutable uses ref "${usesRef}"`,
				).toBe(true);
			}
			expect(content).not.toMatch(/uses:\s*[^\s#]+@v\d/);
		}
	});
});
