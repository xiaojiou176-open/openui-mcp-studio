import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { buildRunLayout, readRunLayout } from "./run-layout.mjs";
import { toPosixPath } from "./governance-utils.mjs";

const DEFAULT_OPENUI_CHROME_CHANNEL = "chrome";
const DEFAULT_OPENUI_CHROME_CDP_PORT = 9343;
const DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME = "openui-mcp-studio";
const DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY = "Profile 1";
const DEFAULT_OPENUI_CHROME_VERIFY_URL = "https://myaccount.google.com/";
const DEFAULT_CHROME_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_SOURCE_STABILITY_DELAY_MS = 300;
const DEFAULT_BROWSER_REPORT_ROOT = ".runtime-cache/reports/space-governance";
const DEFAULT_BROWSER_BOOTSTRAP_BASENAME = "browser-bootstrap-latest";
const CHROME_EPHEMERAL_ENTRY_NAMES = Object.freeze([
	"SingletonLock",
	"SingletonCookie",
	"SingletonSocket",
	"DevToolsActivePort",
]);
const CHROME_LOCAL_STATE_BASENAME = "Local State";

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandHomePath(filePath, homeDir = os.homedir()) {
	const value = String(filePath ?? "").trim();
	if (value === "~") {
		return homeDir;
	}
	if (value.startsWith("~/")) {
		return path.join(homeDir, value.slice(2));
	}
	return value;
}

function resolveAbsolutePath(rawValue, cwd = process.cwd()) {
	if (typeof rawValue !== "string" || rawValue.trim() === "") {
		return "";
	}
	const expanded = expandHomePath(rawValue.trim());
	return path.isAbsolute(expanded)
		? path.resolve(expanded)
		: path.resolve(cwd, expanded);
}

async function pathExists(targetPath) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function getDefaultChromeSourceUserDataDir(
	platform = process.platform,
	homeDir = os.homedir(),
) {
	if (platform === "darwin") {
		return path.join(
			homeDir,
			"Library",
			"Application Support",
			"Google",
			"Chrome",
		);
	}
	if (platform === "win32") {
		return path.join(
			homeDir,
			"AppData",
			"Local",
			"Google",
			"Chrome",
			"User Data",
		);
	}
	return path.join(homeDir, ".config", "google-chrome");
}

function getDefaultIsolatedChromeUserDataDir(homeDir = os.homedir()) {
	return path.join(
		homeDir,
		".cache",
		"openui-mcp-studio",
		"browser",
		"chrome-user-data",
	);
}

function getDefaultChromeExecutablePath(channel, platform = process.platform) {
	if (platform === "darwin") {
		const channelMap = {
			chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"chrome-beta":
				"/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
			"chrome-dev":
				"/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev",
			"chrome-canary":
				"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
		};
		return channelMap[channel] ?? channelMap.chrome;
	}
	if (platform === "win32") {
		const localAppData =
			process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
		const channelMap = {
			chrome: path.join(
				localAppData,
				"Google",
				"Chrome",
				"Application",
				"chrome.exe",
			),
			"chrome-beta": path.join(
				localAppData,
				"Google",
				"Chrome Beta",
				"Application",
				"chrome.exe",
			),
			"chrome-dev": path.join(
				localAppData,
				"Google",
				"Chrome Dev",
				"Application",
				"chrome.exe",
			),
		};
		return channelMap[channel] ?? channelMap.chrome;
	}
	const binaryMap = {
		chrome: "/usr/bin/google-chrome",
		"chrome-beta": "/usr/bin/google-chrome-beta",
		"chrome-dev": "/usr/bin/google-chrome-unstable",
	};
	return binaryMap[channel] ?? binaryMap.chrome;
}

function extractFlagValue(command, flagName) {
	const match = new RegExp(
		`${escapeRegExp(flagName)}=(.*?)(?=\\s--[A-Za-z0-9-]+(?:=|\\b)|$)`,
	).exec(command);
	return match?.[1]?.trim() ?? null;
}

function listChromeProcesses() {
	try {
		const stdout = execFileSync("ps", ["-axo", "pid=,command="], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return stdout
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const match = /^(\d+)\s+(.*)$/u.exec(line);
				if (!match) {
					return null;
				}
				const command = match[2] ?? "";
				const isChrome =
					command.includes("Google Chrome") ||
					command.includes("chrome_crashpad_handler");
				if (!isChrome) {
					return null;
				}
				const pid = Number.parseInt(match[1] ?? "", 10);
				return {
					pid,
					command,
					isCrashpad: command.includes("chrome_crashpad_handler"),
					userDataDir: extractFlagValue(command, "--user-data-dir"),
					cdpPort: extractFlagValue(command, "--remote-debugging-port"),
					profileDirectory: extractFlagValue(command, "--profile-directory"),
				};
			})
			.filter(Boolean);
	} catch {
		return [];
	}
}

async function readJsonFile(filePath) {
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath, value) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function formatPath(value) {
	return value ? toPosixPath(path.resolve(value)) : null;
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isTruthyEnvValue(value) {
	return ["1", "true", "yes", "on"].includes(
		String(value ?? "").trim().toLowerCase(),
	);
}

function allowDetachedChromeLaunch(options = {}) {
	const env = options.env ?? process.env;
	return isTruthyEnvValue(env.OPENUI_CHROME_ALLOW_DETACHED_LAUNCH);
}

async function readChromeProfilePolicy(options = {}) {
	const env = options.env ?? process.env;
	const cwd = path.resolve(options.cwd ?? process.cwd());
	const userDataDir = resolveAbsolutePath(env.OPENUI_CHROME_USER_DATA_DIR, cwd);
	const profileDirectory = String(
		env.OPENUI_CHROME_PROFILE_DIRECTORY ?? "",
	).trim();
	const channel =
		String(env.OPENUI_CHROME_CHANNEL ?? DEFAULT_OPENUI_CHROME_CHANNEL).trim() ||
		DEFAULT_OPENUI_CHROME_CHANNEL;
	const executablePath = resolveAbsolutePath(
		env.OPENUI_CHROME_EXECUTABLE_PATH,
		cwd,
	);
	const configured = userDataDir !== "" && profileDirectory !== "";
	const userDataDirExists = userDataDir ? await pathExists(userDataDir) : false;
	const executablePathExists = executablePath
		? await pathExists(executablePath)
		: false;
	const cdpPortRaw = String(
		env.OPENUI_CHROME_CDP_PORT ?? DEFAULT_OPENUI_CHROME_CDP_PORT,
	).trim();
	const cdpPort = Number.parseInt(cdpPortRaw, 10);
	let status = "missing";
	let reason = "real Chrome profile env is not configured";

	if (!Number.isInteger(cdpPort) || cdpPort <= 0) {
		status = "invalid";
		reason = "OPENUI_CHROME_CDP_PORT must be a positive integer";
	} else if (configured && !userDataDirExists) {
		status = "invalid";
		reason = "OPENUI_CHROME_USER_DATA_DIR is configured but the path does not exist";
	} else if (configured && executablePath && !executablePathExists) {
		status = "invalid";
		reason =
			"OPENUI_CHROME_EXECUTABLE_PATH is configured but the path does not exist";
	} else if (configured) {
		status = "configured";
		reason =
			"real Chrome profile env is configured for the repo-owned single-instance CDP lane";
	}

	return {
		status,
		reason,
		localOnly: true,
		configured,
		userDataDir: formatPath(userDataDir),
		userDataDirExists,
		profileDirectory: profileDirectory || null,
		channel,
		executablePath: formatPath(executablePath),
		executablePathExists,
		cdpPort: Number.isInteger(cdpPort) && cdpPort > 0 ? cdpPort : null,
		cdpEndpoint:
			Number.isInteger(cdpPort) && cdpPort > 0
				? `http://127.0.0.1:${cdpPort}`
				: null,
		profileDisplayName: DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME,
		janitorExcluded: true,
		recommendedUserDataDir: formatPath(
			getDefaultIsolatedChromeUserDataDir(os.homedir()),
		),
		recommendedProfileDirectory: DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY,
		defaultVerifyUrl: DEFAULT_OPENUI_CHROME_VERIFY_URL,
	};
}

async function resolveChromeExecutable(policy) {
	if (policy.executablePath) {
		return policy.executablePath;
	}
	const candidate = getDefaultChromeExecutablePath(policy.channel);
	if (await pathExists(candidate)) {
		return formatPath(candidate);
	}
	throw new Error(
		`Unable to resolve a Chrome executable for channel "${policy.channel}". Set OPENUI_CHROME_EXECUTABLE_PATH explicitly.`,
	);
}

async function requireRealChromeProfile(options = {}) {
	const policy = await readChromeProfilePolicy(options);
	if (!policy.configured) {
		throw new Error(
			"Real Chrome profile is not configured. Set OPENUI_CHROME_USER_DATA_DIR and OPENUI_CHROME_PROFILE_DIRECTORY.",
		);
	}
	if (!policy.userDataDirExists) {
		throw new Error(
			`OPENUI_CHROME_USER_DATA_DIR does not exist: ${policy.userDataDir ?? "<empty>"}.`,
		);
	}
	if (policy.executablePath && !policy.executablePathExists) {
		throw new Error(
			`OPENUI_CHROME_EXECUTABLE_PATH does not exist: ${policy.executablePath}.`,
		);
	}
	if ((options.env ?? process.env).CI) {
		throw new Error("Real Chrome profile mode is local-only and must not run inside CI.");
	}
	const resolvedExecutablePath = await resolveChromeExecutable(policy);
	return {
		userDataDir: policy.userDataDir,
		profileDirectory: policy.profileDirectory,
		channel: policy.channel,
		executablePath: resolvedExecutablePath,
		cdpPort: policy.cdpPort,
		cdpEndpoint: policy.cdpEndpoint,
		launchArguments: [
			`--user-data-dir=${policy.userDataDir}`,
			`--profile-directory=${policy.profileDirectory}`,
			"--remote-debugging-address=127.0.0.1",
			`--remote-debugging-port=${policy.cdpPort}`,
			"--no-first-run",
			"--no-default-browser-check",
		],
	};
}

async function readChromeVersionJson(cdpPort) {
	try {
		const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, {
			signal: globalThis.AbortSignal.timeout(1_500),
		});
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch {
		return null;
	}
}

async function inspectChromeCdpLane(options = {}) {
	const policy = await readChromeProfilePolicy(options);
	if (!policy.configured || !policy.cdpPort) {
		return {
			status: "stopped",
			reason: policy.reason,
			policy,
			cdpReachable: false,
			processes: [],
		};
	}
	if (policy.status === "invalid") {
		return {
			status: "stopped",
			reason: policy.reason,
			policy,
			cdpReachable: false,
			processes: [],
		};
	}

	const processes = listChromeProcesses().filter(
		(entry) => entry.cdpPort === String(policy.cdpPort),
	);
	const sameRootProcesses = processes.filter(
		(entry) =>
			entry.userDataDir && formatPath(entry.userDataDir) === policy.userDataDir,
	);
	const versionJson = await readChromeVersionJson(policy.cdpPort);
	const cdpReachable = Boolean(versionJson?.webSocketDebuggerUrl);

	if (sameRootProcesses.length > 0) {
		return {
			status: "running-same-root",
			reason: cdpReachable
				? "Chrome is already running on the expected CDP port and root."
				: "Chrome uses the expected root, but CDP has not become reachable yet.",
			policy,
			cdpReachable,
			processes,
			matchingProcesses: sameRootProcesses,
			versionJson,
		};
	}

	if (processes.length === 0) {
		return {
			status: "stopped",
			reason: "No Chrome process is listening on the configured repo CDP port.",
			policy,
			cdpReachable,
			processes,
			versionJson,
		};
	}

	const mismatchedChromeProcess = processes.find((entry) => entry.userDataDir);
	if (mismatchedChromeProcess) {
		return {
			status: "root-mismatch",
			reason:
				"The configured CDP port is already owned by a Chrome instance that points at a different user-data-dir.",
			policy,
			cdpReachable,
			processes,
			versionJson,
		};
	}

	return {
		status: "port-collision",
		reason:
			"The configured CDP port is occupied, but the owning process does not look like the repo-owned Chrome root.",
		policy,
		cdpReachable,
		processes,
		versionJson,
	};
}

async function waitForChromeLaneReady(options = {}) {
	const timeoutMs = Number(options.timeoutMs ?? DEFAULT_CHROME_STARTUP_TIMEOUT_MS);
	const startTime = Date.now();
	while (Date.now() - startTime <= timeoutMs) {
		const status = await inspectChromeCdpLane(options);
		if (status.status === "running-same-root" && status.cdpReachable) {
			return status;
		}
		if (status.status === "root-mismatch" || status.status === "port-collision") {
			throw new Error(status.reason);
		}
		await sleep(250);
	}
	throw new Error(
		`Timed out waiting for Chrome CDP lane to become reachable on port ${options.env?.OPENUI_CHROME_CDP_PORT ?? DEFAULT_OPENUI_CHROME_CDP_PORT}.`,
	);
}

async function ensureChromeCdpLane(options = {}) {
	const required = await requireRealChromeProfile(options);
	const current = await inspectChromeCdpLane({
		...options,
		env: {
			...(options.env ?? process.env),
			OPENUI_CHROME_USER_DATA_DIR: required.userDataDir,
			OPENUI_CHROME_PROFILE_DIRECTORY: required.profileDirectory,
			OPENUI_CHROME_CHANNEL: required.channel,
			OPENUI_CHROME_EXECUTABLE_PATH: required.executablePath,
			OPENUI_CHROME_CDP_PORT: String(required.cdpPort),
		},
	});
	if (current.status === "running-same-root" && current.cdpReachable) {
		return {
			launched: false,
			status: current,
			cdpEndpoint: required.cdpEndpoint,
		};
	}
	if (current.status === "root-mismatch" || current.status === "port-collision") {
		throw new Error(current.reason);
	}

	const startupUrl = String(options.startupUrl ?? "about:blank").trim() || "about:blank";
	if (!allowDetachedChromeLaunch(options)) {
		throw new Error(
			"Detached Chrome launch is operator-gated. Set OPENUI_CHROME_ALLOW_DETACHED_LAUNCH=1 before launching a repo-owned Chrome CDP lane from this helper.",
		);
	}
	const child = spawn(
		required.executablePath,
		[
			...required.launchArguments,
			"--new-window",
			startupUrl,
		],
		{
			detached: true,
			stdio: "ignore",
		},
	);
	child.unref();
	const ready = await waitForChromeLaneReady({
		...options,
		env: {
			...(options.env ?? process.env),
			OPENUI_CHROME_USER_DATA_DIR: required.userDataDir,
			OPENUI_CHROME_PROFILE_DIRECTORY: required.profileDirectory,
			OPENUI_CHROME_CHANNEL: required.channel,
			OPENUI_CHROME_EXECUTABLE_PATH: required.executablePath,
			OPENUI_CHROME_CDP_PORT: String(required.cdpPort),
		},
	});
	return {
		launched: true,
		status: ready,
		cdpEndpoint: required.cdpEndpoint,
	};
}

async function readChromeLocalState(sourceRoot) {
	return readJsonFile(path.join(sourceRoot, CHROME_LOCAL_STATE_BASENAME));
}

function findChromeProfileByDisplayName(
	localState,
	displayName = DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME,
) {
	const infoCache = localState?.profile?.info_cache ?? {};
	for (const [profileDirectory, entry] of Object.entries(infoCache)) {
		if (entry && entry.name === displayName) {
			return {
				profileDirectory,
				entry,
			};
		}
	}
	return null;
}

async function removeChromeEphemeralEntries(targetRoot) {
	const removedPaths = [];
	for (const entryName of CHROME_EPHEMERAL_ENTRY_NAMES) {
		const candidatePath = path.join(targetRoot, entryName);
		if (!(await pathExists(candidatePath))) {
			continue;
		}
		await fs.rm(candidatePath, { recursive: true, force: true });
		removedPaths.push(toPosixPath(candidatePath));
	}
	return removedPaths;
}

async function collectSourceStabilitySnapshot(localStatePath, sourceProfilePath) {
	const [localStateStat, sourceProfileStat, sourceProfileEntries] = await Promise.all([
		fs.stat(localStatePath),
		fs.stat(sourceProfilePath),
		fs.readdir(sourceProfilePath),
	]);
	const localState = await fs.readFile(localStatePath, "utf8");
	return {
		localStateSize: Buffer.byteLength(localState, "utf8"),
		localStateMtimeMs: localStateStat.mtimeMs,
		profileMtimeMs: sourceProfileStat.mtimeMs,
		profileEntryCount: sourceProfileEntries.length,
		profileEntrySample: [...sourceProfileEntries].sort().slice(0, 20),
	};
}

async function runSourceQuiescencePreflight(options = {}) {
	const sourceRoot = path.resolve(
		options.sourceRoot ??
			getDefaultChromeSourceUserDataDir(process.platform, os.homedir()),
	);
	const localStatePath = path.join(sourceRoot, CHROME_LOCAL_STATE_BASENAME);
	const sourceProfilePath = path.join(
		sourceRoot,
		String(options.sourceProfileDirectory ?? ""),
	);
	const processMatches = listChromeProcesses().filter(
		(entry) =>
			!entry.isCrashpad &&
			entry.userDataDir &&
			formatPath(entry.userDataDir) === formatPath(sourceRoot),
	);
	const singletonPaths = [];
	for (const entryName of CHROME_EPHEMERAL_ENTRY_NAMES.slice(0, 3)) {
		const candidatePath = path.join(sourceRoot, entryName);
		if (await pathExists(candidatePath)) {
			singletonPaths.push(toPosixPath(candidatePath));
		}
	}

	const first = await collectSourceStabilitySnapshot(localStatePath, sourceProfilePath);
	await sleep(Number(options.delayMs ?? DEFAULT_SOURCE_STABILITY_DELAY_MS));
	const second = await collectSourceStabilitySnapshot(localStatePath, sourceProfilePath);
	const stable = JSON.stringify(first) === JSON.stringify(second);
	return {
		ok: processMatches.length === 0 && singletonPaths.length === 0 && stable,
		sourceRoot: formatPath(sourceRoot),
		processMatches,
		singletonPaths,
		stability: {
			stable,
			first,
			second,
		},
	};
}

function rewriteChromeLocalState(localState, options = {}) {
	const profileDirectory =
		String(options.profileDirectory ?? DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY).trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY;
	const displayName =
		String(options.displayName ?? DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME).trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME;
	const sourceProfileDirectory = String(options.sourceProfileDirectory ?? "").trim();
	const cloned = globalThis.structuredClone(localState);
	const profileSection =
		cloned.profile && typeof cloned.profile === "object" ? cloned.profile : {};
	const infoCache =
		profileSection.info_cache && typeof profileSection.info_cache === "object"
			? profileSection.info_cache
			: {};
	const sourceEntry = infoCache[sourceProfileDirectory];
	if (!sourceEntry || typeof sourceEntry !== "object") {
		throw new Error(
			`Source profile ${JSON.stringify(sourceProfileDirectory)} was not found inside Local State info_cache.`,
		);
	}
	const nextEntry = {
		...sourceEntry,
		name: displayName,
		is_using_default_name: false,
	};
	profileSection.info_cache = {
		[profileDirectory]: nextEntry,
	};
	profileSection.last_used = profileDirectory;
	profileSection.last_active_profiles = [profileDirectory];
	profileSection.profiles_order = [profileDirectory];
	cloned.profile = profileSection;
	return {
		localState: cloned,
		rewriteSummary: {
			sourceProfileDirectory,
			targetProfileDirectory: profileDirectory,
			displayName,
			updatedProfileKeys: [
				"profile.info_cache",
				"profile.last_used",
				"profile.last_active_profiles",
				"profile.profiles_order",
			],
		},
	};
}

function buildBrowserBootstrapMarkdown(receipt) {
	const quiescenceStatus = receipt.quiescencePreflight?.skipped
		? `skipped (${receipt.quiescencePreflight.reason ?? "target already bootstrapped"})`
		: receipt.quiescencePreflight.ok
			? "yes"
			: "no";
	return [
		"# Browser Bootstrap Receipt",
		"",
		`- Mode: ${receipt.mode ?? "bootstrap"}`,
		`- Generated at: ${receipt.generatedAt}`,
		`- Source root: ${receipt.sourceRoot}`,
		`- Source profile: ${receipt.sourceProfileDirectory}`,
		`- Target root: ${receipt.targetRoot}`,
		`- Target profile: ${receipt.targetProfileDirectory}`,
		`- Quiescence preflight ok: ${quiescenceStatus}`,
		"",
		"## Copied Paths",
		"",
		...(receipt.copiedPaths.length > 0
			? receipt.copiedPaths.map((entry) => `- ${entry}`)
			: ["- none"]),
		"",
		"## Removed Ephemeral Paths",
		"",
		...(receipt.removedEphemeralPaths.length > 0
			? receipt.removedEphemeralPaths.map((entry) => `- ${entry}`)
			: ["- none"]),
		"",
		"## Local State Rewrite",
		"",
		`- Source profile directory: ${receipt.localStateRewrite.sourceProfileDirectory}`,
		`- Target profile directory: ${receipt.localStateRewrite.targetProfileDirectory}`,
		`- Display name: ${receipt.localStateRewrite.displayName}`,
	].join("\n");
}

async function writeBrowserBootstrapReceipt(rootDir, receipt) {
	const reportRoot = path.resolve(rootDir, DEFAULT_BROWSER_REPORT_ROOT);
	await fs.mkdir(reportRoot, { recursive: true });
	const jsonPath = path.join(
		reportRoot,
		`${DEFAULT_BROWSER_BOOTSTRAP_BASENAME}.json`,
	);
	const markdownPath = path.join(
		reportRoot,
		`${DEFAULT_BROWSER_BOOTSTRAP_BASENAME}.md`,
	);
	await Promise.all([
		fs.writeFile(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
		fs.writeFile(markdownPath, `${buildBrowserBootstrapMarkdown(receipt)}\n`, "utf8"),
	]);
	return {
		jsonPath,
		markdownPath,
	};
}

async function inspectExistingBootstrapTarget(options = {}) {
	const targetRoot = path.resolve(options.targetRoot ?? process.cwd());
	const displayName =
		String(options.displayName ?? DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME).trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME;
	const targetProfileDirectory =
		String(options.targetProfileDirectory ?? DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY).trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY;
	const localStatePath = path.join(targetRoot, CHROME_LOCAL_STATE_BASENAME);
	if (!(await pathExists(localStatePath))) {
		return {
			ok: false,
			reason: `Target Chrome root is missing ${CHROME_LOCAL_STATE_BASENAME}.`,
		};
	}
	const targetLocalState = await readJsonFile(localStatePath);
	const profileHit = findChromeProfileByDisplayName(targetLocalState, displayName);
	if (!profileHit) {
		return {
			ok: false,
			reason: `Target Chrome root does not contain a profile named ${JSON.stringify(displayName)}.`,
		};
	}
	if (profileHit.profileDirectory !== targetProfileDirectory) {
		return {
			ok: false,
			reason:
				`Target Chrome root maps ${JSON.stringify(displayName)} to ${JSON.stringify(profileHit.profileDirectory)} instead of ${JSON.stringify(targetProfileDirectory)}.`,
		};
	}
	const targetProfilePath = path.join(targetRoot, targetProfileDirectory);
	if (!(await pathExists(targetProfilePath))) {
		return {
			ok: false,
			reason:
				`Target Chrome root is missing expected profile directory ${JSON.stringify(targetProfileDirectory)}.`,
		};
	}
	return {
		ok: true,
		sourceProfileDirectory: profileHit.profileDirectory,
		localStateRewrite: {
			sourceProfileDirectory: targetProfileDirectory,
			targetProfileDirectory,
			displayName,
			updatedProfileKeys: [],
		},
	};
}

async function bootstrapChromeProfileLane(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const sourceRoot = path.resolve(
		options.sourceRoot ??
			getDefaultChromeSourceUserDataDir(process.platform, os.homedir()),
	);
	const targetRoot = path.resolve(
		options.targetRoot ??
			getDefaultIsolatedChromeUserDataDir(os.homedir()),
	);
	const displayName =
		String(options.displayName ?? DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME).trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME;
	const targetProfileDirectory =
		String(options.targetProfileDirectory ?? DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY).trim() ||
		DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY;
	const targetExists = await pathExists(targetRoot);
	if (targetExists && options.force !== true) {
		const existingTarget = await inspectExistingBootstrapTarget({
			targetRoot,
			displayName,
			targetProfileDirectory,
		});
		if (!existingTarget.ok) {
			throw new Error(
				`Target Chrome root already exists: ${toPosixPath(targetRoot)}. ${existingTarget.reason} Re-run with force=true if you intentionally want to replace it.`,
			);
		}
		const removedEphemeralPaths = await removeChromeEphemeralEntries(targetRoot);
		const receipt = {
			mode: "reused-existing-target",
			generatedAt: new Date().toISOString(),
			sourceRoot: toPosixPath(sourceRoot),
			sourceProfileDirectory: existingTarget.sourceProfileDirectory,
			targetRoot: toPosixPath(targetRoot),
			targetProfileDirectory,
			copiedPaths: [],
			removedEphemeralPaths,
			localStateRewrite: existingTarget.localStateRewrite,
			quiescencePreflight: {
				ok: true,
				skipped: true,
				reason: "target already bootstrapped",
				sourceRoot: formatPath(sourceRoot),
				processMatches: [],
				singletonPaths: [],
				stability: {
					stable: true,
					first: null,
					second: null,
				},
			},
		};
		const receiptPaths = await writeBrowserBootstrapReceipt(rootDir, receipt);
		return {
			...receipt,
			receiptJsonPath: toPosixPath(path.relative(rootDir, receiptPaths.jsonPath)),
			receiptMarkdownPath: toPosixPath(path.relative(rootDir, receiptPaths.markdownPath)),
		};
	}

	const sourceLocalStatePath = path.join(sourceRoot, CHROME_LOCAL_STATE_BASENAME);
	const sourceLocalState = await readChromeLocalState(sourceRoot);
	const profileHit = findChromeProfileByDisplayName(sourceLocalState, displayName);
	if (!profileHit) {
		throw new Error(
			`No source Chrome profile named ${JSON.stringify(displayName)} was found in ${toPosixPath(sourceLocalStatePath)}.`,
		);
	}

	const quiescencePreflight = await runSourceQuiescencePreflight({
		sourceRoot,
		sourceProfileDirectory: profileHit.profileDirectory,
	});
	if (!quiescencePreflight.ok) {
		throw new Error(
			`Source Chrome root is not quiescent enough for one-time copy: ${JSON.stringify(quiescencePreflight, null, 2)}`,
		);
	}
	if (targetExists) {
		await fs.rm(targetRoot, { recursive: true, force: true });
	}

	await fs.mkdir(targetRoot, { recursive: true });
	const sourceProfilePath = path.join(sourceRoot, profileHit.profileDirectory);
	const targetProfilePath = path.join(targetRoot, targetProfileDirectory);
	await fs.copyFile(sourceLocalStatePath, path.join(targetRoot, CHROME_LOCAL_STATE_BASENAME));
	await fs.cp(sourceProfilePath, targetProfilePath, { recursive: true });
	const removedEphemeralPaths = await removeChromeEphemeralEntries(targetRoot);
	const { localState: rewrittenLocalState, rewriteSummary } = rewriteChromeLocalState(
		sourceLocalState,
		{
			sourceProfileDirectory: profileHit.profileDirectory,
			profileDirectory: targetProfileDirectory,
			displayName,
		},
	);
	await writeJsonFile(
		path.join(targetRoot, CHROME_LOCAL_STATE_BASENAME),
		rewrittenLocalState,
	);

	const receipt = {
		mode: "bootstrap",
		generatedAt: new Date().toISOString(),
		sourceRoot: toPosixPath(sourceRoot),
		sourceProfileDirectory: profileHit.profileDirectory,
		targetRoot: toPosixPath(targetRoot),
		targetProfileDirectory,
		copiedPaths: [
			toPosixPath(sourceLocalStatePath),
			toPosixPath(sourceProfilePath),
		],
		removedEphemeralPaths,
		localStateRewrite: rewriteSummary,
		quiescencePreflight,
	};
	const receiptPaths = await writeBrowserBootstrapReceipt(rootDir, receipt);
	return {
		...receipt,
		receiptJsonPath: toPosixPath(path.relative(rootDir, receiptPaths.jsonPath)),
		receiptMarkdownPath: toPosixPath(path.relative(rootDir, receiptPaths.markdownPath)),
	};
}

async function waitForVisibleSelector(page, selector, timeoutMs = 5_000) {
	if (!selector) {
		return false;
	}
	try {
		await page.locator(selector).first().waitFor({
			state: "visible",
			timeout: timeoutMs,
		});
		return true;
	} catch {
		return false;
	}
}

function inferLoginVerdict(url, html, options = {}) {
	const currentUrl = String(url ?? "");
	const markup = String(html ?? "").toLowerCase();
	const googleLoginUrl =
		/service(login|logout)|signin\/v2|accounts\.google\.com\/v3\/signin/i.test(
			currentUrl,
		);
	const googleSignInSignals =
		markup.includes("identifierid") ||
		markup.includes('type="email"') ||
		markup.includes(">sign in<") ||
		markup.includes("choose an account");

	if (options.loggedInBySelector) {
		return {
			verdict: "logged-in",
			manualReviewNeeded: false,
			reason: "The configured logged-in selector became visible.",
		};
	}
	if (options.loggedOutBySelector) {
		return {
			verdict: "logged-out",
			manualReviewNeeded: false,
			reason: "The configured logged-out selector became visible.",
		};
	}
	if (
		/^https:\/\/myaccount\.google\.com\//i.test(currentUrl) &&
		!googleLoginUrl &&
		!googleSignInSignals
	) {
		return {
			verdict: "logged-in",
			manualReviewNeeded: false,
			reason: "The page stayed on myaccount.google.com without Google sign-in prompts.",
		};
	}
	if (googleLoginUrl || googleSignInSignals) {
		return {
			verdict: "logged-out",
			manualReviewNeeded: false,
			reason: "The page redirected into a Google sign-in flow.",
		};
	}
	return {
		verdict: "manual-review-needed",
		manualReviewNeeded: true,
		reason:
			"No explicit selector or URL heuristic could prove the login state for this target.",
	};
}

async function captureBrowserEvidence(options) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const browserRoot = path.resolve(options.browserRoot);
	const page = options.page;
	const consoleEntries = options.consoleEntries ?? [];
	const networkEntries = options.networkEntries ?? [];
	const screenshotPath = path.join(browserRoot, "screenshot.png");
	const domPath = path.join(browserRoot, "dom.html");
	const consolePath = path.join(browserRoot, "console.json");
	const networkPath = path.join(browserRoot, "network.json");
	const html = await page.content();
	await fs.writeFile(domPath, html, "utf8");
	await writeJsonFile(consolePath, consoleEntries);
	await writeJsonFile(networkPath, networkEntries);
	let screenshotCaptured = false;
	let screenshotError = null;
	try {
		await page.screenshot({
			path: screenshotPath,
			fullPage: false,
			timeout: 10_000,
		});
		screenshotCaptured = true;
	} catch (error) {
		screenshotError =
			error instanceof Error && error.message
				? error.message
				: String(error);
	}
	return {
		html,
		screenshotCaptured,
		screenshotError,
		screenshotPath: screenshotCaptured
			? toPosixPath(path.relative(rootDir, screenshotPath))
			: null,
		domPath: toPosixPath(path.relative(rootDir, domPath)),
		consolePath: toPosixPath(path.relative(rootDir, consolePath)),
		networkPath: toPosixPath(path.relative(rootDir, networkPath)),
	};
}

async function verifyChromeCdpLane(options = {}) {
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	const targetUrl =
		String(options.url ?? DEFAULT_OPENUI_CHROME_VERIFY_URL).trim() ||
		DEFAULT_OPENUI_CHROME_VERIFY_URL;
	const lane = await ensureChromeCdpLane({
		...options,
		startupUrl: targetUrl,
	});
	const runId =
		String(
			options.runId ??
				process.env.OPENUI_RUNTIME_RUN_ID ??
				`repo-browser-verify-${Date.now()}`,
		).trim() || `repo-browser-verify-${Date.now()}`;
	const { contract } = await readRunLayout({ rootDir });
	const layout = buildRunLayout(rootDir, runId, contract);
	const browserRoot = path.join(layout.runRootAbsolute, "browser");
	await fs.mkdir(browserRoot, { recursive: true });
	await fs.mkdir(path.join(layout.runRootAbsolute, "meta"), { recursive: true });
	await writeJsonFile(path.join(layout.runRootAbsolute, "meta", "run.json"), {
		runId,
		authoritative: false,
		source: "repo:browser:verify",
		generatedAt: new Date().toISOString(),
	});

	const { chromium } = await import("playwright");
	const browser = await chromium.connectOverCDP(lane.cdpEndpoint);
	const context = browser.contexts()[0];
	if (!context) {
		throw new Error(
			"Connected Chrome instance did not expose a default browser context.",
		);
	}

	const page = await context.newPage();
	const consoleEntries = [];
	const networkEntries = [];
	page.on("console", (message) => {
		consoleEntries.push({
			type: message.type(),
			text: message.text(),
			location: message.location(),
		});
	});
	page.on("response", (response) => {
		networkEntries.push({
			url: response.url(),
			status: response.status(),
			ok: response.ok(),
			resourceType: response.request().resourceType(),
			method: response.request().method(),
		});
	});
	page.on("requestfailed", (request) => {
		networkEntries.push({
			url: request.url(),
			status: null,
			ok: false,
			resourceType: request.resourceType(),
			method: request.method(),
			failureText: request.failure()?.errorText ?? "unknown",
		});
	});

	try {
		await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
		await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
		const evidence = await captureBrowserEvidence({
			rootDir,
			browserRoot,
			page,
			consoleEntries,
			networkEntries,
		});

		const loggedInBySelector = await waitForVisibleSelector(
			page,
			options.loggedInSelector,
		);
		const loggedOutBySelector = await waitForVisibleSelector(
			page,
			options.loggedOutSelector,
		);
		const verdict = inferLoginVerdict(page.url(), evidence.html, {
			loggedInBySelector,
			loggedOutBySelector,
		});
		const summary = {
			ok: verdict.verdict === "logged-in",
			runId,
			url: targetUrl,
			finalUrl: page.url(),
			title: await page.title(),
			loginVerdict: verdict.verdict,
			manualReviewNeeded: verdict.manualReviewNeeded,
			reason: verdict.reason,
			laneStatus: lane.status.status,
			cdpPort: lane.status.policy?.cdpPort ?? DEFAULT_OPENUI_CHROME_CDP_PORT,
			screenshotCaptured: evidence.screenshotCaptured,
			screenshotError: evidence.screenshotError,
			screenshotPath: evidence.screenshotPath,
			domPath: evidence.domPath,
			consolePath: evidence.consolePath,
			networkPath: evidence.networkPath,
		};
		const summaryPath = path.join(browserRoot, "summary.json");
		await writeJsonFile(summaryPath, summary);
		return {
			...summary,
			summaryPath: toPosixPath(path.relative(rootDir, summaryPath)),
		};
	} finally {
		await page.close().catch(() => {});
		await browser.close().catch(() => {});
	}
}

export {
	DEFAULT_OPENUI_CHROME_CDP_PORT,
	DEFAULT_OPENUI_CHROME_CHANNEL,
	DEFAULT_OPENUI_CHROME_PROFILE_DIRECTORY,
	DEFAULT_OPENUI_CHROME_PROFILE_DISPLAY_NAME,
	DEFAULT_OPENUI_CHROME_VERIFY_URL,
	bootstrapChromeProfileLane,
	captureBrowserEvidence,
	findChromeProfileByDisplayName,
	getDefaultChromeSourceUserDataDir,
	getDefaultIsolatedChromeUserDataDir,
	inspectChromeCdpLane,
	readChromeLocalState,
	readChromeProfilePolicy,
	requireRealChromeProfile,
	rewriteChromeLocalState,
	runSourceQuiescencePreflight,
	verifyChromeCdpLane,
};
