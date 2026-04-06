import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { runEvidenceGovernanceCheck } from "./check-evidence-governance.mjs";
import { runRunCorrelationCheck } from "./check-run-correlation.mjs";

const DEFAULT_CONTRACT_PATH =
	"tooling/contracts/release-readiness.contract.json";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function toPosixPath(filePath) {
	return filePath.split(path.sep).join("/");
}

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCliArgs(argv = process.argv.slice(2)) {
	const options = {
		contractPath: DEFAULT_CONTRACT_PATH,
		outputPath: "",
		strictAuthoritativeRuns: false,
	};

		for (const arg of argv) {
			if (arg.startsWith("--contract=")) {
				const value = arg.slice("--contract=".length).trim();
				if (value) {
					options.contractPath = value;
				}
				continue;
			}
			if (arg.startsWith("--output=")) {
				const value = arg.slice("--output=".length).trim();
				if (value) {
					options.outputPath = value;
				}
				continue;
			}
			if (arg === "--strict-authoritative-runs") {
				options.strictAuthoritativeRuns = true;
			}
		}

	return options;
}

async function readJsonOrPushError(filePath, label, errors) {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		errors.push(`${label}: ${message}`);
		return null;
	}
}

function defaultListGitTags({ cwd }) {
	try {
		const raw = execFileSync("git", ["tag", "--sort=-creatordate"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return raw
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read git tags: ${message}`, { cause: error });
	}
}

function validateTagPolicy(tagPolicy, tags, errors) {
	if (!isPlainObject(tagPolicy)) {
		errors.push("gitTagPolicy must be an object.");
		return { latestTag: null };
	}

	const patternRaw = String(tagPolicy.releaseTagPattern ?? "").trim();
	if (!patternRaw) {
		errors.push("gitTagPolicy.releaseTagPattern must be a non-empty string.");
		return { latestTag: tags[0] ?? null };
	}

	let pattern;
	try {
		pattern = new RegExp(patternRaw);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		errors.push(`gitTagPolicy.releaseTagPattern is invalid regex: ${message}`);
		return { latestTag: tags[0] ?? null };
	}

	const latestTag = tags.find((tag) => pattern.test(tag)) ?? null;
	if (!latestTag) {
		errors.push(
			"No git release tag found. Create a SemVer tag (for example: v0.3.0) before release readiness check.",
		);
		return { latestTag: null };
	}

	return { latestTag };
}

function validateEvidencePathMap(evidence, errors) {
	if (!isPlainObject(evidence)) {
		errors.push("evidence must be an object.");
		return false;
	}

	const required = [
		"openapi",
		"performanceBudget",
		"rumSlo",
		"featureFlags",
		"canaryPolicy",
		"rollbackPolicy",
		"observabilityPolicy",
		"ciImageSupplyChain",
	];

	for (const key of required) {
		const value = String(evidence[key] ?? "").trim();
		if (!value) {
			errors.push(`evidence.${key} must be a non-empty path string.`);
		}
	}

	return errors.length === 0;
}

function validateStrictReadiness(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("strictReadiness must be an object.");
		return;
	}
	if (raw.requireAuthoritativeRuns !== true) {
		errors.push("strictReadiness.requireAuthoritativeRuns must be true.");
	}
}

function validateOpenapiDocument(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("openapi evidence must be an object.");
		return;
	}

	const version = String(raw.openapi ?? "").trim();
	if (!version.startsWith("3.")) {
		errors.push(`openapi.openapi must start with "3.", received "${version}".`);
	}

	const info = raw.info;
	if (!isPlainObject(info)) {
		errors.push("openapi.info must be an object.");
	} else {
		if (!String(info.title ?? "").trim()) {
			errors.push("openapi.info.title must be non-empty.");
		}
		if (!String(info.version ?? "").trim()) {
			errors.push("openapi.info.version must be non-empty.");
		}
	}

	const paths = raw.paths;
	if (!isPlainObject(paths) || Object.keys(paths).length === 0) {
		errors.push("openapi.paths must include at least one path.");
	}
}

function validatePerformanceBudget(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("performanceBudget evidence must be an object.");
		return;
	}

	if (!Array.isArray(raw.budgets) || raw.budgets.length === 0) {
		errors.push("performanceBudget.budgets must include at least one budget.");
	}

	const requiredMetricSet = new Set([
		"tool_request_latency_p95_ms",
		"tool_request_error_rate",
	]);
	const budgetMetricSet = new Set(
		(Array.isArray(raw.budgets) ? raw.budgets : [])
			.map((item) =>
				isPlainObject(item) ? String(item.metric ?? "").trim() : "",
			)
			.filter(Boolean),
	);
	for (const metric of requiredMetricSet) {
		if (!budgetMetricSet.has(metric)) {
			errors.push(`performanceBudget is missing required metric "${metric}".`);
		}
	}
}

function validateRumSlo(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("rumSlo evidence must be an object.");
		return;
	}

	const mode = String(raw.mode ?? "").trim();
	if (!mode) {
		errors.push("rumSlo.mode must be non-empty.");
	}

	const sampleWindowDays = Number(raw.sampleWindowDays);
	if (!Number.isInteger(sampleWindowDays) || sampleWindowDays <= 0) {
		errors.push("rumSlo.sampleWindowDays must be a positive integer.");
	}

	if (!Array.isArray(raw.metrics) || raw.metrics.length === 0) {
		errors.push("rumSlo.metrics must include at least one metric.");
	}
}

function validateFeatureFlags(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("featureFlags evidence must be an object.");
		return;
	}

	const flags = Array.isArray(raw.flags) ? raw.flags : [];
	if (flags.length === 0) {
		errors.push("featureFlags.flags must include at least one flag.");
		return;
	}

	for (const [index, flag] of flags.entries()) {
		if (!isPlainObject(flag)) {
			errors.push(`featureFlags.flags[${index}] must be an object.`);
			continue;
		}

		const key = String(flag.key ?? "").trim();
		if (!/^[a-z0-9_]+$/u.test(key)) {
			errors.push(
				`featureFlags.flags[${index}].key must use lowercase snake_case.`,
			);
		}

		if (!String(flag.owner ?? "").trim()) {
			errors.push(`featureFlags.flags[${index}].owner must be non-empty.`);
		}

		const expiresOn = String(flag.expiresOn ?? "").trim();
		if (!ISO_DATE_PATTERN.test(expiresOn)) {
			errors.push(`featureFlags.flags[${index}].expiresOn must be YYYY-MM-DD.`);
		}
	}
}

function validateCanaryPolicy(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("canaryPolicy evidence must be an object.");
		return;
	}

	const stages = Array.isArray(raw.stages) ? raw.stages : [];
	if (stages.length < 2) {
		errors.push("canaryPolicy.stages must define at least two rollout stages.");
		return;
	}

	let previous = -1;
	for (const [index, stage] of stages.entries()) {
		if (!isPlainObject(stage)) {
			errors.push(`canaryPolicy.stages[${index}] must be an object.`);
			continue;
		}
		const percentage = Number(stage.percentage);
		if (!Number.isFinite(percentage) || percentage <= previous) {
			errors.push(
				`canaryPolicy.stages[${index}].percentage must be increasing numbers.`,
			);
		}
		previous = percentage;
	}

	const autoRollback = raw.autoRollback;
	if (!isPlainObject(autoRollback) || autoRollback.enabled !== true) {
		errors.push("canaryPolicy.autoRollback.enabled must be true.");
	}
}

async function validateRollbackPolicy(raw, errors, rootDir) {
	if (!isPlainObject(raw)) {
		errors.push("rollbackPolicy evidence must be an object.");
		return;
	}

	const rtoMinutes = Number(raw.rtoMinutes);
	if (!Number.isInteger(rtoMinutes) || rtoMinutes <= 0 || rtoMinutes > 30) {
		errors.push("rollbackPolicy.rtoMinutes must be an integer within (0, 30].");
	}

	if (!String(raw.drillCommand ?? "").trim()) {
		errors.push("rollbackPolicy.drillCommand must be non-empty.");
	}

	const runbookPathRaw = String(raw.runbookPath ?? "").trim();
	if (!runbookPathRaw) {
		errors.push("rollbackPolicy.runbookPath must be non-empty.");
		return;
	}

	const runbookPath = path.resolve(rootDir, runbookPathRaw);
	try {
		const stat = await fs.stat(runbookPath);
		if (!stat.isFile()) {
			errors.push(
				`rollbackPolicy.runbookPath must point to a file: ${toPosixPath(runbookPath)}`,
			);
		}
	} catch {
		errors.push(
			`rollbackPolicy.runbookPath does not exist: ${toPosixPath(runbookPath)}`,
		);
	}
}

function validateObservabilityPolicy(raw, errors) {
	if (!isPlainObject(raw)) {
		errors.push("observabilityPolicy evidence must be an object.");
		return;
	}

	const redMetrics = new Set(
		(Array.isArray(raw.redMetrics) ? raw.redMetrics : [])
			.map((item) => String(item ?? "").trim())
			.filter(Boolean),
	);
	for (const metric of ["request_rate", "error_rate", "duration_ms"]) {
		if (!redMetrics.has(metric)) {
			errors.push(`observabilityPolicy.redMetrics must include "${metric}".`);
		}
	}

	const tracing = raw.tracing;
	if (!isPlainObject(tracing) || tracing.enabled !== true) {
		errors.push("observabilityPolicy.tracing.enabled must be true.");
	}

	const alerts = Array.isArray(raw.alerts) ? raw.alerts : [];
	if (alerts.length === 0) {
		errors.push("observabilityPolicy.alerts must include at least one alert.");
	}
}

async function validateCiImageSupplyChain(raw, errors, rootDir) {
	if (!isPlainObject(raw)) {
		errors.push("ciImageSupplyChain evidence must be an object.");
		return;
	}

	const imageLockPathRaw = String(raw.imageLockPath ?? "").trim();
	const buildWorkflowPathRaw = String(raw.buildWorkflowPath ?? "").trim();
	const releaseWorkflowPathRaw = String(raw.releaseWorkflowPath ?? "").trim();
	const metadataArtifactPrefix = String(raw.metadataArtifactPrefix ?? "").trim();
	const bootstrapTransitionAllowed = raw.bootstrapTransitionAllowed === true;

	if (!imageLockPathRaw) {
		errors.push("ciImageSupplyChain.imageLockPath must be non-empty.");
	}
	if (!buildWorkflowPathRaw) {
		errors.push("ciImageSupplyChain.buildWorkflowPath must be non-empty.");
	}
	if (!releaseWorkflowPathRaw) {
		errors.push("ciImageSupplyChain.releaseWorkflowPath must be non-empty.");
	}
	if (!metadataArtifactPrefix) {
		errors.push("ciImageSupplyChain.metadataArtifactPrefix must be non-empty.");
	}

	for (const filePathRaw of [
		imageLockPathRaw,
		buildWorkflowPathRaw,
		releaseWorkflowPathRaw,
	].filter(Boolean)) {
		const absolutePath = path.resolve(rootDir, filePathRaw);
		try {
			const stat = await fs.stat(absolutePath);
			if (!stat.isFile()) {
				errors.push(
					`ciImageSupplyChain path must point to a file: ${toPosixPath(absolutePath)}`,
				);
			}
		} catch {
			errors.push(
				`ciImageSupplyChain path does not exist: ${toPosixPath(absolutePath)}`,
			);
		}
	}

	if (imageLockPathRaw) {
		const imageLockPath = path.resolve(rootDir, imageLockPathRaw);
		const imageLock = await readJsonOrPushError(
			imageLockPath,
			`ciImageLock (${imageLockPathRaw})`,
			errors,
		);
		if (isPlainObject(imageLock)) {
			const digest = String(imageLock.digest ?? "").trim();
			if (!digest) {
				errors.push(
					bootstrapTransitionAllowed
						? "ciImageSupplyChain digest is empty; bootstrap transition remains enabled, so release readiness cannot pass yet."
						: "ciImageSupplyChain digest is empty; publish an immutable GHCR digest and sync .github/ci-image.lock.json before claiming release readiness.",
				);
			} else if (!/^sha256:[0-9a-f]{64}$/i.test(digest)) {
				errors.push("ciImageSupplyChain digest must be a valid sha256 digest.");
			}
		}
	}

	if (!Array.isArray(raw.supplyChainArtifactFields) || raw.supplyChainArtifactFields.length === 0) {
		errors.push("ciImageSupplyChain.supplyChainArtifactFields must be a non-empty array.");
	}

	if (!isPlainObject(raw.sbom) || raw.sbom.enabled !== true) {
		errors.push("ciImageSupplyChain.sbom.enabled must be true.");
	}
	if (!isPlainObject(raw.provenance) || raw.provenance.enabled !== true) {
		errors.push("ciImageSupplyChain.provenance.enabled must be true.");
	}
	if (
		!isPlainObject(raw.registryAttestation) ||
		raw.registryAttestation.enabled !== true
	) {
		errors.push("ciImageSupplyChain.registryAttestation.enabled must be true.");
	}
}

export async function verifyReleaseReadiness(options = {}) {
	const rootDir = options.rootDir
		? path.resolve(options.rootDir)
		: process.cwd();
	const contractPath = path.resolve(
		rootDir,
		options.contractPath ?? DEFAULT_CONTRACT_PATH,
	);
	const listTags = options.listTags ?? defaultListGitTags;
	const errors = [];

	const contract = await readJsonOrPushError(
		contractPath,
		`contract (${toPosixPath(contractPath)})`,
		errors,
	);
	if (!contract) {
		return {
			ok: false,
			errors,
			contractPath: toPosixPath(contractPath),
			latestTag: null,
		};
	}

	if (!Number.isInteger(contract.version) || contract.version <= 0) {
		errors.push("contract.version must be a positive integer.");
	}

	const evidence = contract.evidence;
	validateEvidencePathMap(evidence, errors);

	let tags = [];
	try {
		tags = listTags({ cwd: rootDir });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		errors.push(message);
	}

	const { latestTag } = validateTagPolicy(contract.gitTagPolicy, tags, errors);

	if (!isPlainObject(evidence)) {
		return {
			ok: false,
			errors,
			contractPath: toPosixPath(contractPath),
			latestTag,
		};
	}

	const openapi = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.openapi ?? "")),
		`openapi (${String(evidence.openapi ?? "")})`,
		errors,
	);
	const performanceBudget = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.performanceBudget ?? "")),
		`performanceBudget (${String(evidence.performanceBudget ?? "")})`,
		errors,
	);
	const rumSlo = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.rumSlo ?? "")),
		`rumSlo (${String(evidence.rumSlo ?? "")})`,
		errors,
	);
	const featureFlags = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.featureFlags ?? "")),
		`featureFlags (${String(evidence.featureFlags ?? "")})`,
		errors,
	);
	const canaryPolicy = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.canaryPolicy ?? "")),
		`canaryPolicy (${String(evidence.canaryPolicy ?? "")})`,
		errors,
	);
	const rollbackPolicy = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.rollbackPolicy ?? "")),
		`rollbackPolicy (${String(evidence.rollbackPolicy ?? "")})`,
		errors,
	);
	const observabilityPolicy = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.observabilityPolicy ?? "")),
		`observabilityPolicy (${String(evidence.observabilityPolicy ?? "")})`,
		errors,
	);
	const ciImageSupplyChain = await readJsonOrPushError(
		path.resolve(rootDir, String(evidence.ciImageSupplyChain ?? "")),
		`ciImageSupplyChain (${String(evidence.ciImageSupplyChain ?? "")})`,
		errors,
	);

	if (openapi) {
		validateOpenapiDocument(openapi, errors);
	}
	if (performanceBudget) {
		validatePerformanceBudget(performanceBudget, errors);
	}
	if (rumSlo) {
		validateRumSlo(rumSlo, errors);
	}
	if (featureFlags) {
		validateFeatureFlags(featureFlags, errors);
	}
	if (canaryPolicy) {
		validateCanaryPolicy(canaryPolicy, errors);
	}
	if (rollbackPolicy) {
		await validateRollbackPolicy(rollbackPolicy, errors, rootDir);
	}
	if (observabilityPolicy) {
		validateObservabilityPolicy(observabilityPolicy, errors);
	}
	if (ciImageSupplyChain) {
		await validateCiImageSupplyChain(ciImageSupplyChain, errors, rootDir);
	}
	if (options.requireAuthoritativeRuns === true) {
		validateStrictReadiness(contract.strictReadiness, errors);
		const evidenceResult = await runEvidenceGovernanceCheck({
			rootDir,
			allowNoAuthoritativeRuns: false,
		});
		if (!evidenceResult.ok) {
			for (const issue of evidenceResult.errors) {
				errors.push(`authoritativeEvidence: ${issue}`);
			}
		}
		const correlationResult = await runRunCorrelationCheck({
			rootDir,
			allowNoAuthoritativeRuns: false,
		});
		if (!correlationResult.ok) {
			for (const issue of correlationResult.errors) {
				errors.push(`authoritativeRunCorrelation: ${issue}`);
			}
		}
	}

	return {
		ok: errors.length === 0,
		errors,
		contractPath: toPosixPath(contractPath),
		latestTag,
	};
}

export async function runReleaseReadinessCli({
	argv = process.argv.slice(2),
	stdout = process.stdout,
	stderr = process.stderr,
} = {}) {
	const args = parseCliArgs(argv);
	const result = await verifyReleaseReadiness({
		contractPath: args.contractPath,
		requireAuthoritativeRuns: args.strictAuthoritativeRuns,
	});

	if (args.outputPath) {
		const outputPath = path.resolve(process.cwd(), args.outputPath);
		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
	}

	if (!result.ok) {
		stderr.write("[release-readiness] FAILED\n");
		for (const issue of result.errors) {
			stderr.write(`- ${issue}\n`);
		}
		return 1;
	}

	stdout.write(
		`[release-readiness] OK (contract=${result.contractPath}, latestTag=${result.latestTag}${args.strictAuthoritativeRuns ? ", strictAuthoritativeRuns=true" : ""})\n`,
	);
	return 0;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	runReleaseReadinessCli().then((exitCode) => {
		process.exitCode = exitCode;
	});
}
