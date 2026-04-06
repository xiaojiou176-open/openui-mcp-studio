import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	bootstrapChromeProfileLane,
	captureBrowserEvidence,
	DEFAULT_OPENUI_CHROME_CDP_PORT,
	findChromeProfileByDisplayName,
	inspectChromeCdpLane,
	readChromeProfilePolicy,
	requireRealChromeProfile,
	rewriteChromeLocalState,
} from "../tooling/shared/local-chrome-profile.mjs";

const tempDirs: string[] = [];

async function mkTempDir(prefix: string) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeTempExecutable(fileName: string) {
	const dir = await mkTempDir("openui-local-chrome-bin-");
	const filePath = path.join(dir, fileName);
	await fs.writeFile(filePath, "#!/bin/sh\nexit 0\n", {
		mode: 0o755,
	});
	return filePath;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("local chrome profile contract", () => {
	it("reports missing policy when real Chrome env is absent", async () => {
		const policy = await readChromeProfilePolicy({ env: {} });

		expect(policy).toMatchObject({
			status: "missing",
			configured: false,
			localOnly: true,
			userDataDir: null,
			profileDirectory: null,
			channel: "chrome",
			cdpPort: DEFAULT_OPENUI_CHROME_CDP_PORT,
			janitorExcluded: true,
		});
	});

	it("builds single-instance launch arguments when the local Chrome env is complete", async () => {
		const userDataDir = await mkTempDir("openui-local-chrome-profile-");
		const executablePath = await makeTempExecutable("chrome");
		const result = await requireRealChromeProfile({
			env: {
				OPENUI_CHROME_USER_DATA_DIR: userDataDir,
				OPENUI_CHROME_PROFILE_DIRECTORY: "Profile 1",
				OPENUI_CHROME_CHANNEL: "chrome",
				OPENUI_CHROME_CDP_PORT: "9343",
				OPENUI_CHROME_EXECUTABLE_PATH: executablePath,
			},
		});

		expect(result.userDataDir).toBe(userDataDir.replaceAll("\\", "/"));
		expect(result.profileDirectory).toBe("Profile 1");
		expect(result.cdpPort).toBe(9343);
		expect(result.cdpEndpoint).toBe("http://127.0.0.1:9343");
		expect(result.launchArguments).toContain(`--profile-directory=Profile 1`);
		expect(result.launchArguments).toContain(`--remote-debugging-port=9343`);
	});

	it("fails fast inside CI even when a real Chrome profile is configured", async () => {
		const userDataDir = await mkTempDir("openui-local-chrome-ci-");
		const executablePath = await makeTempExecutable("chrome");
		await expect(
			requireRealChromeProfile({
				env: {
					CI: "1",
					OPENUI_CHROME_USER_DATA_DIR: userDataDir,
					OPENUI_CHROME_PROFILE_DIRECTORY: "Profile 1",
					OPENUI_CHROME_CDP_PORT: "9343",
					OPENUI_CHROME_EXECUTABLE_PATH: executablePath,
				},
			}),
		).rejects.toThrow(/local-only/i);
	});

	it("rewrites local state into a single Profile 1 mapping", () => {
		const sourceLocalState = {
			profile: {
				last_used: "Default",
				last_active_profiles: ["Default"],
				profiles_order: ["Default", "Profile 29"],
				info_cache: {
					Default: { name: "Person 1" },
					"Profile 29": {
						name: "openui-mcp-studio",
						is_using_default_name: true,
						user_name: "openui-profile@example.com",
					},
				},
			},
		};

		expect(
			findChromeProfileByDisplayName(sourceLocalState, "openui-mcp-studio"),
		).toMatchObject({
			profileDirectory: "Profile 29",
		});

		const { localState, rewriteSummary } = rewriteChromeLocalState(
			sourceLocalState,
			{
				sourceProfileDirectory: "Profile 29",
				profileDirectory: "Profile 1",
				displayName: "openui-mcp-studio",
			},
		);

		expect(localState.profile.last_used).toBe("Profile 1");
		expect(localState.profile.last_active_profiles).toEqual(["Profile 1"]);
		expect(localState.profile.profiles_order).toEqual(["Profile 1"]);
		expect(Object.keys(localState.profile.info_cache)).toEqual(["Profile 1"]);
		expect(localState.profile.info_cache["Profile 1"]).toMatchObject({
			name: "openui-mcp-studio",
			is_using_default_name: false,
			user_name: "openui-profile@example.com",
		});
		expect(rewriteSummary).toMatchObject({
			sourceProfileDirectory: "Profile 29",
			targetProfileDirectory: "Profile 1",
			displayName: "openui-mcp-studio",
		});
	});

	it("bootstraps an isolated Chrome root from Local State + Profile 29", async () => {
		const rootDir = await mkTempDir("openui-browser-bootstrap-workspace-");
		const sourceRoot = await mkTempDir("openui-browser-bootstrap-source-");
		const targetRoot = await mkTempDir(
			"openui-browser-bootstrap-target-parent-",
		);
		const isolatedRoot = path.join(targetRoot, "chrome-user-data");
		await writeJson(path.join(sourceRoot, "Local State"), {
			profile: {
				last_used: "Default",
				last_active_profiles: ["Default"],
				profiles_order: ["Default", "Profile 29"],
				info_cache: {
					"Profile 29": {
						name: "openui-mcp-studio",
						is_using_default_name: false,
						user_name: "openui-profile@example.com",
					},
				},
			},
		});
		await fs.mkdir(path.join(sourceRoot, "Profile 29"), { recursive: true });
		await fs.writeFile(
			path.join(sourceRoot, "Profile 29", "Preferences"),
			"{}",
			"utf8",
		);

		const receipt = await bootstrapChromeProfileLane({
			rootDir,
			sourceRoot,
			targetRoot: isolatedRoot,
		});

		expect(receipt.sourceProfileDirectory).toBe("Profile 29");
		expect(receipt.targetProfileDirectory).toBe("Profile 1");
		expect(receipt.quiescencePreflight.ok).toBe(true);
		await expect(
			fs.readFile(path.join(isolatedRoot, "Profile 1", "Preferences"), "utf8"),
		).resolves.toBe("{}");
		const localState = JSON.parse(
			await fs.readFile(path.join(isolatedRoot, "Local State"), "utf8"),
		);
		expect(localState.profile.last_used).toBe("Profile 1");
		expect(localState.profile.info_cache["Profile 1"]).toMatchObject({
			name: "openui-mcp-studio",
		});
		await expect(
			fs.readFile(
				path.join(
					rootDir,
					".runtime-cache",
					"reports",
					"space-governance",
					"browser-bootstrap-latest.json",
				),
				"utf8",
			),
		).resolves.toContain('"targetProfileDirectory": "Profile 1"');
	});

	it("reuses an existing isolated Chrome root without requiring force", async () => {
		const rootDir = await mkTempDir(
			"openui-browser-bootstrap-reuse-workspace-",
		);
		const sourceRoot = await mkTempDir(
			"openui-browser-bootstrap-unused-source-",
		);
		const targetRoot = await mkTempDir(
			"openui-browser-bootstrap-existing-target-",
		);
		await writeJson(path.join(targetRoot, "Local State"), {
			profile: {
				last_used: "Profile 1",
				last_active_profiles: ["Profile 1"],
				profiles_order: ["Profile 1"],
				info_cache: {
					"Profile 1": {
						name: "openui-mcp-studio",
						is_using_default_name: false,
						user_name: "openui-profile@example.com",
					},
				},
			},
		});
		await fs.mkdir(path.join(targetRoot, "Profile 1"), { recursive: true });
		await fs.writeFile(
			path.join(targetRoot, "Profile 1", "Preferences"),
			"{}",
			"utf8",
		);

		const receipt = await bootstrapChromeProfileLane({
			rootDir,
			sourceRoot,
			targetRoot,
		});

		expect(receipt.mode).toBe("reused-existing-target");
		expect(receipt.targetProfileDirectory).toBe("Profile 1");
		expect(receipt.copiedPaths).toEqual([]);
		expect(receipt.quiescencePreflight).toMatchObject({
			ok: true,
			skipped: true,
		});
		await expect(
			fs.readFile(
				path.join(
					rootDir,
					".runtime-cache",
					"reports",
					"space-governance",
					"browser-bootstrap-latest.md",
				),
				"utf8",
			),
		).resolves.toContain("Mode: reused-existing-target");
	});

	it("reports stopped when the lane is configured but no Chrome instance is attached", async () => {
		const userDataDir = await mkTempDir("openui-browser-lane-status-");
		const executablePath = await makeTempExecutable("chrome");
		const status = await inspectChromeCdpLane({
			env: {
				OPENUI_CHROME_USER_DATA_DIR: userDataDir,
				OPENUI_CHROME_PROFILE_DIRECTORY: "Profile 1",
				OPENUI_CHROME_CHANNEL: "chrome",
				OPENUI_CHROME_EXECUTABLE_PATH: executablePath,
				OPENUI_CHROME_CDP_PORT: "19543",
			},
		});

		expect(status.status).toBe("stopped");
		expect(status.policy.cdpPort).toBe(19543);
	});

	it("keeps browser evidence capture non-fatal when screenshot export times out", async () => {
		const rootDir = await mkTempDir("openui-browser-evidence-root-");
		const browserRoot = path.join(
			rootDir,
			".runtime-cache",
			"runs",
			"demo",
			"browser",
		);
		await fs.mkdir(browserRoot, { recursive: true });

		const evidence = await captureBrowserEvidence({
			rootDir,
			browserRoot,
			page: {
				async content() {
					return "<html><body>ok</body></html>";
				},
				async screenshot() {
					const error = new Error("page.screenshot: Timeout 30000ms exceeded.");
					error.name = "TimeoutError";
					throw error;
				},
			},
			consoleEntries: [{ type: "info", text: "ready" }],
			networkEntries: [
				{
					url: "https://example.com/",
					status: 200,
					ok: true,
					resourceType: "document",
					method: "GET",
				},
			],
		});

		expect(evidence.screenshotCaptured).toBe(false);
		expect(evidence.screenshotPath).toBeNull();
		expect(evidence.screenshotError).toMatch(/Timeout 30000ms exceeded/);
		await expect(
			fs.readFile(path.join(rootDir, evidence.domPath), "utf8"),
		).resolves.toContain("<body>ok</body>");
		await expect(
			fs.readFile(path.join(rootDir, evidence.consolePath), "utf8"),
		).resolves.toContain('"text": "ready"');
		await expect(
			fs.readFile(path.join(rootDir, evidence.networkPath), "utf8"),
		).resolves.toContain('"status": 200');
	});
});
