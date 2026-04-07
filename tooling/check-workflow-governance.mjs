import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const WORKFLOWS_DIR = path.resolve(".github/workflows");
const ACTIONS_DIR = path.resolve(".github/actions");
const ALLOWED_CONTINUE_ON_ERROR_STEPS = new Set([
	"ci.yml:gcp_auth",
	"ci.yml:wait_org_runners",
	"build-ci-image.yml:registry_attestation",
	"quality-trend-weekly.yml:ci_gate_run",
	"quality-trend-weekly.yml:mutation_run",
]);
const ALLOWED_SHELL_FAILURE_SUPPRESSION_STEPS = new Set([]);
const ALLOWED_CHECKOUT_CLEAN_FALSE_STEPS = new Set([
	// Narrow exception: secret scanning needs a non-destructive checkout path for forensic inspection.
	"ci.yml:secret_scan:Checkout",
]);
const CI_WORKFLOW_FILE = "ci.yml";
const CI_RUNNER_SELECTOR_REQUIRED_PATTERNS = [
	/^\s*runs_on_json:\s+\${{\s*steps\.select\.outputs\.runs_on_json\s*}}\s*$/,
	/^\s*echo "runs_on_json=\$\{runs_on_json\}" >> "\$\{GITHUB_OUTPUT\}"\s*$/,
	/^\s*runs_on_json='\["ubuntu-latest"\]'\s*$/,
	/^\s*tier="public-github-hosted"\s*$/,
	/^\s*mode="public_default"\s*$/,
];
const CI_SMALL_TASK_JOB_IDS = new Set([
	"required_env_hard_gate",
	"workflow_lint",
	"workflow_governance",
	"commit_messages",
	"lint_backend",
	"lint_frontend",
	"precommit_gate",
	"secret_scan",
]);
const CI_SMALL_TASK_ENV_DEPENDENCY_EXEMPT_JOB_IDS = new Set(["secret_scan"]);
const CI_LARGE_TASK_JOB_IDS = new Set([
	"quality",
	"live_gemini_hard_gate",
	"nightly_cross_browser",
	"nightly_coverage_gate",
	"rollback_drill",
]);
const CI_REQUIRED_NEEDS_BY_JOB = new Map([
	["live_gemini_hard_gate", ["quality"]],
]);
const REQUIRED_NO_BYPASS_ENVS = new Map([
	["OPENUI_ALLOW_QUALITY_SCORE_BYPASS", "0"],
	["OPENUI_ALLOW_MUTATION_SKIP", "0"],
]);
const HIGH_RISK_PERMISSIONS_LINE_PATTERN =
	/^\s*permissions:\s*(?:"write-all"|'write-all'|write-all)\s*(?:#.*)?$/i;
const COMMIT_SHA_REF_PATTERN = /^[0-9a-f]{40}$/i;
const DOCKER_DIGEST_REF_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const UBUNTU_LATEST_RUNS_ON_PATTERN = /^\s*runs-on:\s*ubuntu-latest\s*$/;
const RUNNER_SELECTOR_RUNS_ON_PATTERN =
	/^\s*runs-on:\s+\${{\s*fromJSON\(needs\.runner_selector\.outputs\.runs_on_json\)\s*}}\s*$/;
const FORBIDDEN_RUNNER_REGISTRATION_COMMAND_PATTERN =
	/\bconfig\.sh\b|\b\.\/run\.sh\b|\bremove\.sh\b/;
const REQUIRED_NODE_VERSION = "22.22.0";
const CONTAINER_RUN_ACTION_PATH = "./.github/actions/run-in-ci-container";
const CONTAINER_REQUIRED_JOBS_BY_WORKFLOW = new Map([
		[
			"ci.yml",
			new Set([
				"quality",
				"live_gemini_hard_gate",
				"nightly_cross_browser",
				"nightly_coverage_gate",
			]),
	],
	["mutation-weekly.yml", new Set(["mutation_gate"])],
	["quality-trend-weekly.yml", new Set(["quality_trend"])],
	["weekly-env-audit.yml", new Set(["weekly_env_audit"])],
	["reusable-quality-gate.yml", new Set(["quality_gate"])],
	["release-readiness.yml", new Set(["release_readiness"])],
]);
const NODE_PIN_ENFORCED_WORKFLOWS = new Set([
	"ci.yml",
	"mutation-weekly.yml",
	"quality-trend-weekly.yml",
	"weekly-env-audit.yml",
	"reusable-quality-gate.yml",
	"release-readiness.yml",
]);
const ALLOWED_HOSTED_RUNS_ON = new Map([
	["ci.yml", new Set(["untrusted_pr_static_governance", "runner_bootstrap", "runner_selector"])],
	["shared-runner-health.yml", new Set(["public_ci_health"])],
]);

function collectJobBlocks(lines) {
	const jobsLineIndex = lines.findIndex((line) => /^jobs:\s*$/.test(line));
	if (jobsLineIndex === -1) {
		return [];
	}

	const blocks = [];
	let index = jobsLineIndex + 1;
	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index += 1;
			continue;
		}
		if (/^[^\s#]/.test(line)) {
			break;
		}
		const jobMatch = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
		if (!jobMatch) {
			index += 1;
			continue;
		}
		const jobId = jobMatch[1];
		const start = index;
		index += 1;
		while (index < lines.length) {
			const next = lines[index];
			if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(next)) {
				break;
			}
			if (/^[^\s#]/.test(next)) {
				break;
			}
			index += 1;
		}
		blocks.push({ jobId, start, end: index - 1 });
	}
	return blocks;
}

function indexJobBlocksById(blocks) {
	const mapped = new Map();
	for (const block of blocks) {
		mapped.set(block.jobId, block);
	}
	return mapped;
}

function getBlockLines(lines, block) {
	return lines.slice(block.start, block.end + 1);
}

function blockContainsLine(blockLines, pattern) {
	return blockLines.some((line) => pattern.test(line));
}

function inferEnclosingStepId(lines, lineIndex) {
	let stepStart = -1;
	for (let index = lineIndex; index >= 0; index -= 1) {
		if (/^ {6}-\s+/.test(lines[index])) {
			stepStart = index;
			break;
		}
		if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
			break;
		}
	}
	if (stepStart === -1) {
		return "";
	}
	for (let index = stepStart + 1; index <= lineIndex; index += 1) {
		const match = lines[index].match(/^ {8}id:\s*([A-Za-z0-9_-]+)\s*$/);
		if (match) {
			return match[1];
		}
	}
	return "";
}

function findEnclosingStepStart(lines, lineIndex) {
	for (let index = lineIndex; index >= 0; index -= 1) {
		if (/^ {6}-\s+/.test(lines[index])) {
			return index;
		}
		if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
			break;
		}
	}
	return -1;
}

function inferEnclosingStepName(lines, lineIndex) {
	const stepStart = findEnclosingStepStart(lines, lineIndex);
	if (stepStart === -1) {
		return "";
	}
	for (let index = stepStart; index <= lineIndex; index += 1) {
		const match = lines[index].match(/^ {8}name:\s*(.+?)\s*$/);
		if (match) {
			return normalizeYamlScalarValue(match[1] ?? "");
		}
	}
	return "";
}

function inferEnclosingStepKey(lines, fileName, lineIndex) {
	const jobId = inferNearestJobId(lines, lineIndex);
	const stepName = inferEnclosingStepName(lines, lineIndex);
	const stepId = inferEnclosingStepId(lines, lineIndex);
	return `${fileName}:${jobId}:${stepName || stepId || `line-${lineIndex + 1}`}`;
}

function inferNearestJobId(lines, lineIndex) {
	for (let index = lineIndex; index >= 0; index -= 1) {
		const match = lines[index].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
		if (match) {
			return match[1];
		}
	}
	return "";
}

function validateRequiredEnvHardGate(fileName, lines, jobBlocks, errors) {
	const byId = indexJobBlocksById(jobBlocks);
	const requiredEnvBlock = byId.get("required_env_hard_gate");
	if (!requiredEnvBlock) {
		return;
	}
	const blockLines = getBlockLines(lines, requiredEnvBlock);
	const stepChecks = [
		{
			ok: blockContainsLine(
				blockLines,
				/^\s*- name: Validate GEMINI_API_KEY is configured(?:\s*\(.*\))?\s*$/,
			),
			message: `${fileName}: job "required_env_hard_gate" missing key validation step.`,
		},
		{
			ok: blockContainsLine(blockLines, /^\s*- name: Checkout\s*$/),
			message: `${fileName}: job "required_env_hard_gate" missing checkout step.`,
		},
	];
	for (const check of stepChecks) {
		if (!check.ok) {
			errors.push(check.message);
		}
	}
	if (blockContainsLine(blockLines, /actions\/setup-node@/)) {
		errors.push(
			`${fileName}: job "required_env_hard_gate" must not setup Node; keep it as host pre-check only.`,
		);
	}
	if (blockContainsLine(blockLines, /\bnpm ci\b/)) {
		errors.push(
			`${fileName}: job "required_env_hard_gate" must not install dependencies.`,
		);
	}
}

function validateCiRunnerPolicy(fileName, lines, jobBlocks, errors) {
	if (fileName !== CI_WORKFLOW_FILE) {
		return;
	}

	const byId = indexJobBlocksById(jobBlocks);
	const runnerBootstrapBlock = byId.get("runner_bootstrap");
	if (!runnerBootstrapBlock) {
		errors.push(`${fileName}: missing job "runner_bootstrap".`);
		return;
	}
	const runnerBootstrapLines = getBlockLines(lines, runnerBootstrapBlock);
	if (!blockContainsLine(runnerBootstrapLines, UBUNTU_LATEST_RUNS_ON_PATTERN)) {
		errors.push(
			`${fileName}: job "runner_bootstrap" must run on ubuntu-latest under the public-safe runner contract.`,
		);
	}

	const runnerSelectorBlock = byId.get("runner_selector");
	if (!runnerSelectorBlock) {
		errors.push(`${fileName}: missing job "runner_selector".`);
		return;
	}
	const runnerSelectorLines = getBlockLines(lines, runnerSelectorBlock);
	if (!blockContainsLine(runnerSelectorLines, UBUNTU_LATEST_RUNS_ON_PATTERN)) {
		errors.push(
			`${fileName}: job "runner_selector" must run on ubuntu-latest under the public-safe runner contract.`,
		);
	}
	for (const pattern of CI_RUNNER_SELECTOR_REQUIRED_PATTERNS) {
		if (!blockContainsLine(runnerSelectorLines, pattern)) {
			errors.push(
				`${fileName}: job "runner_selector" is missing required routing element (${String(pattern)}).`,
			);
		}
	}
	if (
		blockContainsLine(
			runnerSelectorLines,
			/self-hosted|shared-pool|gcp-self-hosted-shared-pool|runner_probe_hosted/,
		)
	) {
		errors.push(
			`${fileName}: job "runner_selector" must not reference legacy self-hosted routing details under the public-safe contract.`,
		);
	}
	if (!blockContainsLine(runnerSelectorLines, /^\s*-\s+runner_bootstrap\s*$/)) {
		errors.push(
			`${fileName}: job "runner_selector" must depend on runner_bootstrap.`,
		);
	}

	for (const jobId of CI_SMALL_TASK_JOB_IDS) {
		const block = byId.get(jobId);
		if (!block) {
			errors.push(`${fileName}: missing small-task job "${jobId}".`);
			continue;
		}
		const blockLines = getBlockLines(lines, block);
		if (!blockContainsLine(blockLines, RUNNER_SELECTOR_RUNS_ON_PATTERN)) {
			errors.push(
				`${fileName}: small-task job "${jobId}" must run on fromJSON(needs.runner_selector.outputs.runs_on_json).`,
			);
		}
		if (
			jobId !== "required_env_hard_gate" &&
			!CI_SMALL_TASK_ENV_DEPENDENCY_EXEMPT_JOB_IDS.has(jobId) &&
			!blockContainsLine(blockLines, /^\s*-\s+required_env_hard_gate\s*$/)
		) {
			errors.push(
				`${fileName}: small-task job "${jobId}" must depend on required_env_hard_gate.`,
			);
		}
		if (
			jobId !== "required_env_hard_gate" &&
			!blockContainsLine(blockLines, /^\s*-\s+runner_selector\s*$/)
		) {
			errors.push(
				`${fileName}: small-task job "${jobId}" must depend on runner_selector for fallback routing.`,
			);
		}
	}

	for (const jobId of CI_LARGE_TASK_JOB_IDS) {
		const block = byId.get(jobId);
		if (!block) {
			errors.push(`${fileName}: missing large-task job "${jobId}".`);
			continue;
		}
		const blockLines = getBlockLines(lines, block);
		const usesRunnerSelector = blockContainsLine(
			blockLines,
			RUNNER_SELECTOR_RUNS_ON_PATTERN,
		);
		if (!usesRunnerSelector) {
			errors.push(
				`${fileName}: large-task job "${jobId}" must run on fromJSON(needs.runner_selector.outputs.runs_on_json) under the hosted-first contract.`,
			);
		}
		if (!blockContainsLine(blockLines, /^\s*-\s+runner_selector\s*$/)) {
			errors.push(
				`${fileName}: large-task job "${jobId}" must depend on runner_selector.`,
			);
		}
	}

	for (const [jobId, requiredNeeds] of CI_REQUIRED_NEEDS_BY_JOB.entries()) {
		const block = byId.get(jobId);
		if (!block) {
			continue;
		}
		const blockLines = getBlockLines(lines, block);
		for (const need of requiredNeeds) {
			if (
				!blockContainsLine(blockLines, new RegExp(`^\\s*-\\s+${need}\\s*$`))
			) {
				errors.push(
					`${fileName}: job "${jobId}" must depend on "${need}" to preserve fast-before-long gate ordering.`,
				);
			}
		}
	}

	const nightlyCrossBrowser = byId.get("nightly_cross_browser");
	if (nightlyCrossBrowser) {
		const blockLines = getBlockLines(lines, nightlyCrossBrowser);
		if (
			!blockContainsLine(
				blockLines,
				/(?:run|command):\s+node\s+tooling\/run-with-heartbeat\.mjs\s+--label=nightly-cross-browser-\$\{\{\s*matrix\.project\s*\}\}\s+--\s+/,
			)
		) {
			errors.push(
				`${fileName}: nightly_cross_browser must execute Playwright via run-with-heartbeat wrapper.`,
			);
		}
	}
}

function validateNoBypassEnv(fileName, lines, errors) {
	const content = lines.join("\n");
	for (const [envName, expectedValue] of REQUIRED_NO_BYPASS_ENVS) {
		const keyPattern = new RegExp(`\\b${envName}\\b`);
		if (!keyPattern.test(content)) {
			errors.push(
				`${fileName}: missing explicit ${envName}: "${expectedValue}" to block local bypass behavior in CI.`,
			);
			continue;
		}
		const expectedLinePattern = new RegExp(
			`^\\s*${envName}:\\s*["']?${expectedValue}["']?\\s*$`,
			"m",
		);
		if (!expectedLinePattern.test(content)) {
			errors.push(
				`${fileName}: ${envName} must be explicitly pinned to "${expectedValue}".`,
			);
		}
	}
}

function isImmutableUsesRef(usesRef) {
	const atIndex = usesRef.lastIndexOf("@");
	if (atIndex === -1) {
		return false;
	}
	const ref = usesRef.slice(atIndex + 1);
	if (usesRef.startsWith("docker://")) {
		return DOCKER_DIGEST_REF_PATTERN.test(ref);
	}
	return COMMIT_SHA_REF_PATTERN.test(ref);
}

function parseUsesRefFromLine(line) {
	const usesMatch = line.match(
		/^\s*(?:-\s+)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))(?:\s+#.*)?\s*$/,
	);
	if (!usesMatch) {
		return null;
	}
	return usesMatch[1] ?? usesMatch[2] ?? usesMatch[3] ?? null;
}

function validateWorkflowActionPinning(fileName, lines, errors) {
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const usesRef = parseUsesRefFromLine(line);
		if (!usesRef) {
			continue;
		}
		if (usesRef.startsWith("./")) {
			continue;
		}
		const atIndex = usesRef.lastIndexOf("@");
		if (atIndex === -1) {
			errors.push(
				`${fileName}:${lineIndex + 1} uses "${usesRef}" without an explicit immutable ref.`,
			);
			continue;
		}
		if (!isImmutableUsesRef(usesRef)) {
			errors.push(
				`${fileName}:${lineIndex + 1} uses "${usesRef}" with a non-immutable ref; pin actions to a commit SHA or docker digest.`,
			);
		}
	}
}

function validateWorkflowPermissions(fileName, lines, errors) {
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		if (HIGH_RISK_PERMISSIONS_LINE_PATTERN.test(lines[lineIndex])) {
			errors.push(
				`${fileName}:${lineIndex + 1} sets high-risk permissions: write-all, which is forbidden. Use least-privilege explicit scopes.`,
			);
		}
	}
}

function validateNoRunnerRegistrationCommands(fileName, lines, errors) {
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		if (FORBIDDEN_RUNNER_REGISTRATION_COMMAND_PATTERN.test(line)) {
			errors.push(
				`${fileName}:${lineIndex + 1} contains forbidden runner registration command content (config.sh/./run.sh/remove.sh).`,
			);
		}
	}
}

function validateWorkflowRunsOn(fileName, lines, jobBlocks, errors) {
	for (const block of jobBlocks) {
		const blockLines = getBlockLines(lines, block);
		const hasHostedRunner = blockContainsLine(blockLines, UBUNTU_LATEST_RUNS_ON_PATTERN);
		const usesRunnerSelector = blockContainsLine(
			blockLines,
			RUNNER_SELECTOR_RUNS_ON_PATTERN,
		);
		const allowedHostedJobs = ALLOWED_HOSTED_RUNS_ON.get(fileName) ?? new Set();
		if (hasHostedRunner && allowedHostedJobs.has(block.jobId)) {
			continue;
		}
		if (fileName === CI_WORKFLOW_FILE) {
			if (!hasHostedRunner && !usesRunnerSelector) {
				errors.push(
					`${fileName}: job "${block.jobId}" must run on ubuntu-latest or fromJSON(needs.runner_selector.outputs.runs_on_json) under the hosted-first contract.`,
				);
			}
			continue;
		}
		if (!hasHostedRunner) {
			errors.push(
				`${fileName}: job "${block.jobId}" must run on ubuntu-latest in tracked public workflows.`,
			);
		}
	}
}

function normalizeYamlScalarValue(rawValue) {
	const trimmed = rawValue.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1).trim();
	}
	return trimmed;
}

function validateCheckoutCleanFalse(fileName, lines, errors) {
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		if (!/^\s*clean:\s*false\s*(?:#.*)?$/i.test(lines[lineIndex])) {
			continue;
		}
		const allowKey = inferEnclosingStepKey(lines, fileName, lineIndex);
		if (!ALLOWED_CHECKOUT_CLEAN_FALSE_STEPS.has(allowKey)) {
			errors.push(
				`${fileName}:${lineIndex + 1} sets clean: false outside the narrow checkout allowlist (${allowKey}). Default checkout behavior must remain clean.`,
			);
		}
	}
}

function validateNoDirectHomeCachePaths(fileName, lines, errors) {
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		if (!/~\/\.cache(?:\/|$)/.test(lines[lineIndex])) {
			continue;
		}
		errors.push(
			`${fileName}:${lineIndex + 1} uses a direct ~/.cache path, which is forbidden in workflows. Route caches through runner.temp, workspace-local paths, or an explicit env indirection.`,
		);
	}
}

function validateWorkflowInstallPolicy(fileName, lines, jobBlocks, errors) {
	for (const block of jobBlocks) {
		for (let lineIndex = block.start; lineIndex <= block.end; lineIndex += 1) {
			const line = lines[lineIndex];
			if (
				/\bpython(?:3)?\s+-m\s+pip\s+install\b/.test(line) &&
				!/\b(?:\.venv|venv)\/bin\/python\b/.test(line)
			) {
				errors.push(
					`${fileName}:${lineIndex + 1} runs global python -m pip install inside workflow job "${block.jobId}". Create and use a venv instead.`,
				);
			}
			if (
				/\bplaywright\s+install\b/.test(line) &&
				/(?:^|\s)--with-deps(?:\s|$)/.test(line)
			) {
				errors.push(
					`${fileName}:${lineIndex + 1} runs playwright install --with-deps inside workflow job "${block.jobId}", which is forbidden. Pre-bake OS deps or install browsers without --with-deps.`,
				);
			}
		}
	}
}

function validatePinnedNodeVersion(fileName, lines, errors) {
	if (!NODE_PIN_ENFORCED_WORKFLOWS.has(fileName)) {
		return;
	}
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const match = lines[lineIndex].match(/^\s*node-version:\s*"([^"]+)"\s*$/);
		if (!match) {
			continue;
		}
		const found = match[1];
		if (found !== REQUIRED_NODE_VERSION) {
			errors.push(
				`${fileName}:${lineIndex + 1} must pin node-version to "${REQUIRED_NODE_VERSION}" (found "${found}").`,
			);
		}
	}
}

function validateContainerExecutionContracts(fileName, lines, jobBlocks, errors) {
	const requiredJobs = CONTAINER_REQUIRED_JOBS_BY_WORKFLOW.get(fileName);
	if (!requiredJobs) {
		return;
	}
	const byId = indexJobBlocksById(jobBlocks);
	for (const jobId of requiredJobs) {
		const block = byId.get(jobId);
		if (!block) {
			errors.push(`${fileName}: missing required containerized job "${jobId}".`);
			continue;
		}
		const blockLines = getBlockLines(lines, block);
		if (
			!blockContainsLine(
				blockLines,
				new RegExp(`^\\s*uses:\\s*${CONTAINER_RUN_ACTION_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`),
			)
		) {
			errors.push(
				`${fileName}: job "${jobId}" must execute through ${CONTAINER_RUN_ACTION_PATH}.`,
			);
		}
		const forbiddenPatterns = [
			/actions\/setup-node@/,
			/actions\/setup-python@/,
			/\bnpm ci\b/,
			/\bplaywright install\b/,
			/\bpython(?:3)?\s+-m\s+venv\b/,
			/\bpython(?:3)?\s+-m\s+pip\s+install\b/,
		];
		for (const pattern of forbiddenPatterns) {
			if (blockContainsLine(blockLines, pattern)) {
				errors.push(
					`${fileName}: job "${jobId}" contains forbidden host runtime setup (${String(pattern)}).`,
				);
			}
		}
		if (
			!blockContainsLine(
				blockLines,
				/^\s*registry_password:\s*\${{\s*secrets\.GITHUB_TOKEN\s*}}\s*$/,
			)
		) {
			errors.push(
				`${fileName}: job "${jobId}" must pass explicit registry_password: \${{ secrets.GITHUB_TOKEN }} to run-in-ci-container.`,
			);
		}
	}

	if (fileName === "ci.yml") {
		const content = lines.join("\n");
		if (/npm run ci:gate(?!:container)\b/.test(content)) {
			errors.push(
				`${fileName}: mainline CI must not invoke npm run ci:gate directly; use ci:gate:container.`,
			);
		}
		if (!/npm run ci:gate:container\b/.test(content)) {
			errors.push(
				`${fileName}: mainline CI missing ci:gate:container invocation in containerized jobs.`,
			);
		}
	}
}

async function collectActionFiles() {
	try {
		const actionDirs = await readdir(ACTIONS_DIR, { withFileTypes: true });
		const actionFiles = [];
		for (const entry of actionDirs) {
			if (!entry.isDirectory()) {
				continue;
			}
			const actionPath = path.join(ACTIONS_DIR, entry.name, "action.yml");
			try {
				await readFile(actionPath, "utf8");
				actionFiles.push(relativeToActions(entry.name));
			} catch {
				// ignore
			}
		}
		return actionFiles.sort();
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

function relativeToActions(actionDir) {
	return `${actionDir}/action.yml`;
}

function validateActionCompositeContracts(fileName, lines, errors) {
	if (fileName === "run-in-ci-container/action.yml") {
		if (
			lines.some((line) => /\bnode22-bookworm\b/.test(line) || /\bstable_tag\b/.test(line))
		) {
			errors.push(
				`${fileName}: run-in-ci-container must resolve immutable refs or bootstrap-builds, not stable tags.`,
			);
		}
	}
}

function validateBuildCiImageSupplyChain(fileName, lines, errors) {
	if (fileName !== "build-ci-image.yml") {
		return;
	}
	const requiredPatterns = [
		/^\s*attestations:\s*write\s*$/,
		/^\s*id-token:\s*write\s*$/,
		/--sbom=true/,
		/--attest type=provenance,mode=max/,
		/actions\/attest-build-provenance@10334b5f1e684784025c3fc0a277c88c19089275/,
		/\.runtime-cache\/ci-image\/build-metadata\.json/,
		/\.runtime-cache\/ci-image\/supply-chain-evidence\.json/,
	];
	for (const pattern of requiredPatterns) {
		if (!blockContainsLine(lines, pattern)) {
			errors.push(
				`${fileName}: missing required CI image supply-chain element (${String(pattern)}).`,
			);
		}
	}
}

async function main() {
	const entries = await readdir(WORKFLOWS_DIR, { withFileTypes: true });
	const workflowFiles = entries
		.filter(
			(entry) =>
				entry.isFile() &&
				(entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")),
			)
			.map((entry) => entry.name)
			.sort();
	const actionFiles = await collectActionFiles();

	const errors = [];

	for (const fileName of workflowFiles) {
		const absolutePath = path.join(WORKFLOWS_DIR, fileName);
		const content = await readFile(absolutePath, "utf8");
		const lines = content.split(/\r?\n/);
		const jobBlocks = collectJobBlocks(lines);

		for (const block of jobBlocks) {
			const hasTimeout = lines
				.slice(block.start, block.end + 1)
				.some((line) => /^ {4}timeout-minutes:\s*\d+\s*$/.test(line));
			if (!hasTimeout) {
				errors.push(
					`${fileName}: job "${block.jobId}" missing timeout-minutes.`,
				);
			}
		}

		validateRequiredEnvHardGate(fileName, lines, jobBlocks, errors);
		validateCiRunnerPolicy(fileName, lines, jobBlocks, errors);
		if (
			fileName === "ci.yml" ||
			fileName === "reusable-quality-gate.yml" ||
			fileName === "weekly-env-audit.yml"
		) {
			validateNoBypassEnv(fileName, lines, errors);
		}
		validateWorkflowActionPinning(fileName, lines, errors);
		validateWorkflowPermissions(fileName, lines, errors);
		validateNoRunnerRegistrationCommands(fileName, lines, errors);
		validateWorkflowRunsOn(fileName, lines, jobBlocks, errors);
		validateCheckoutCleanFalse(fileName, lines, errors);
		validateNoDirectHomeCachePaths(fileName, lines, errors);
		validateWorkflowInstallPolicy(fileName, lines, jobBlocks, errors);
		validatePinnedNodeVersion(fileName, lines, errors);
		validateContainerExecutionContracts(fileName, lines, jobBlocks, errors);
		validateBuildCiImageSupplyChain(fileName, lines, errors);

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
			const line = lines[lineIndex];
			const continueOnErrorMatch = line.match(
				/^\s*continue-on-error:\s*(.+?)\s*(?:#.*)?$/,
			);
			if (continueOnErrorMatch) {
				const normalizedValue = normalizeYamlScalarValue(
					continueOnErrorMatch[1] ?? "",
				);
				if (/^\$\{\{[\s\S]*\}\}$/.test(normalizedValue)) {
					errors.push(
						`${fileName}:${lineIndex + 1} contains expression-based continue-on-error, which is forbidden.`,
					);
					continue;
				}
				if (normalizedValue.toLowerCase() === "true") {
					const isJobLevel = /^ {4}continue-on-error:\s*/.test(line);
					const isStepLevel = /^ {8}continue-on-error:\s*/.test(line);
					const stepId = isStepLevel
						? inferEnclosingStepId(lines, lineIndex)
						: "";
					const jobId = inferNearestJobId(lines, lineIndex);
					const allowScope = isJobLevel
						? jobId
							? `job:${jobId}`
							: ""
						: stepId;
					if (!isJobLevel && !isStepLevel) {
						errors.push(
							`${fileName}:${lineIndex + 1} contains continue-on-error: true with unsupported indentation scope.`,
						);
						continue;
					}
					const allowKey = `${fileName}:${allowScope}`;
					if (!ALLOWED_CONTINUE_ON_ERROR_STEPS.has(allowKey)) {
						errors.push(
							`${fileName}:${lineIndex + 1} contains continue-on-error: true outside allowlist (${allowKey || "unknown-step"}).`,
						);
					}
				}
			}

			const stepId = inferEnclosingStepId(lines, lineIndex);
			const suppressionAllowKey = `${fileName}:${stepId}`;
			if (
				line.includes("|| true") &&
				!/forbidden=.*\|\| true/.test(line) &&
				!/grep -Ev .* \|\| true/.test(line) &&
				!ALLOWED_SHELL_FAILURE_SUPPRESSION_STEPS.has(suppressionAllowKey)
			) {
				errors.push(
					`${fileName}:${lineIndex + 1} contains '|| true', which weakens failure semantics.`,
				);
			}
			if (
				/\|\|\s*:([#\s]|$)/.test(line) &&
				!ALLOWED_SHELL_FAILURE_SUPPRESSION_STEPS.has(suppressionAllowKey)
			) {
				errors.push(
					`${fileName}:${lineIndex + 1} contains '|| :', which weakens failure semantics.`,
				);
			}
			if (
				/;\s*true(?:\s*(?:#.*)?)$/.test(line) &&
				!ALLOWED_SHELL_FAILURE_SUPPRESSION_STEPS.has(suppressionAllowKey)
			) {
				errors.push(
					`${fileName}:${lineIndex + 1} contains '; true', which weakens failure semantics.`,
				);
			}
			if (
				/\bset\s+\+e\b/.test(line) &&
				!ALLOWED_SHELL_FAILURE_SUPPRESSION_STEPS.has(suppressionAllowKey)
			) {
				errors.push(
					`${fileName}:${lineIndex + 1} contains 'set +e', which weakens failure semantics.`,
				);
			}
		}
	}

	for (const fileName of actionFiles) {
		const absolutePath = path.join(ACTIONS_DIR, fileName);
		const content = await readFile(absolutePath, "utf8");
		const lines = content.split(/\r?\n/);
		validateWorkflowActionPinning(fileName, lines, errors);
		validateWorkflowPermissions(fileName, lines, errors);
		validateActionCompositeContracts(fileName, lines, errors);
		if (/npm run ci:gate(?!:container)\b/.test(content)) {
			errors.push(
				`${fileName}: composite actions must not invoke npm run ci:gate directly; use ci:gate:container or explicit trusted entrypoints.`,
			);
		}
	}

	if (errors.length > 0) {
		process.stderr.write("[workflow-governance] FAILED\n");
		for (const error of errors) {
			process.stderr.write(`- ${error}\n`);
		}
		process.exit(1);
	}

	process.stdout.write(
		`[workflow-governance] OK: ${workflowFiles.length} workflow files and ${actionFiles.length} composite action files passed strict checks.\n`,
	);
}

main().catch((error) => {
	const detail =
		error instanceof Error ? (error.stack ?? error.message) : String(error);
	process.stderr.write(`[workflow-governance] fatal: ${detail}\n`);
	process.exit(1);
});
