import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	getTargetBuildManifestStatus,
	writeTargetBuildManifest,
} from "../packages/shared-runtime/src/target-build-manifest.js";

const tempDirs: string[] = [];

async function createSandbox(): Promise<string> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), "openui-target-build-manifest-"),
	);
	tempDirs.push(dir);
	return dir;
}

async function createTargetRoot(sandbox: string): Promise<string> {
	const root = path.resolve(sandbox, "target-app");
	await fs.mkdir(path.resolve(root, "app", "nested"), { recursive: true });
	await fs.mkdir(path.resolve(root, "components", "ui"), { recursive: true });
	await fs.mkdir(path.resolve(root, "lib"), { recursive: true });
	await fs.writeFile(
		path.resolve(root, "app", "page.tsx"),
		"export default 1;",
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, "app", "nested", "layout.tsx"),
		"export default function Layout({ children }) { return children; }",
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, "components", "ui", "button.tsx"),
		"export function Button() { return null; }",
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, "lib", "utils.ts"),
		"export const value = 1;",
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, "package.json"),
		JSON.stringify(
			{
				name: "target-build-manifest-test-app",
				private: true,
			},
			null,
			2,
		),
		"utf8",
	);
	return root;
}

async function createBuildMarker(
	root: string,
	buildDir = ".next",
): Promise<void> {
	await fs.mkdir(path.resolve(root, buildDir), { recursive: true });
	await fs.writeFile(
		path.resolve(root, buildDir, "BUILD_ID"),
		"build-1",
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, buildDir, "required-server-files.json"),
		JSON.stringify({ version: 1 }),
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, buildDir, "routes-manifest.json"),
		JSON.stringify({ version: 1 }),
		"utf8",
	);
	await fs.writeFile(
		path.resolve(root, buildDir, "prerender-manifest.json"),
		JSON.stringify({ version: 1, routes: {} }),
		"utf8",
	);
}

async function createRuntimePackage(root: string, pkg: string): Promise<void> {
	const pkgPath = path.resolve(root, "node_modules", pkg, "package.json");
	await fs.mkdir(path.dirname(pkgPath), { recursive: true });
	await fs.writeFile(pkgPath, `{"name":"${pkg}"}`, "utf8");
}

async function installFakeNextConfigLoader(root: string): Promise<void> {
	const constantsPath = path.resolve(
		root,
		"node_modules",
		"next",
		"constants.js",
	);
	const loaderPath = path.resolve(
		root,
		"node_modules",
		"next",
		"dist",
		"server",
		"config.js",
	);
	await fs.mkdir(path.dirname(constantsPath), { recursive: true });
	await fs.mkdir(path.dirname(loaderPath), { recursive: true });
	await fs.writeFile(
		constantsPath,
		"module.exports = { PHASE_PRODUCTION_BUILD: 'phase-production-build' };",
		"utf8",
	);
	await fs.writeFile(
		loaderPath,
		[
			"const path = require('node:path');",
			"module.exports = async function loadConfig(phase, dir) {",
			"  const configPath = path.resolve(dir, 'next.config.js');",
			"  const loaded = require(configPath);",
			"  return typeof loaded === 'function' ? await loaded(phase, {}) : loaded;",
			"};",
		].join("\n"),
		"utf8",
	);
}

function expectString(value: string | null): string {
	expect(value).not.toBeNull();
	expect(typeof value).toBe("string");
	return value as string;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("target build manifest", () => {
	it("returns manifest-missing-or-invalid when manifest does not exist", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);

		const status = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});

		expect(status.valid).toBe(false);
		expect(status.reason).toBe("manifest-missing-or-invalid");
		expect(status.buildMarkerMtimeMs).toBeNull();
	});

	it("returns null from write when build marker is missing", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);

		const manifestPath = await writeTargetBuildManifest({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});

		expect(manifestPath).toBeNull();
	});

	it("treats schema-invalid manifest payload as missing-or-invalid", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);

		const missingStatus = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		await fs.mkdir(path.dirname(missingStatus.manifestPath), {
			recursive: true,
		});
		await fs.writeFile(
			missingStatus.manifestPath,
			JSON.stringify(
				{
					version: 2,
					targetRoot: root,
					requiredPackages: ["next"],
				},
				null,
				2,
			),
			"utf8",
		);

		const status = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(status.valid).toBe(false);
		expect(status.reason).toBe("manifest-missing-or-invalid");
	});

	it("reports valid manifest when runtime packages and build marker are present", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createBuildMarker(root);
		await createRuntimePackage(root, "next");
		await createRuntimePackage(root, "react");

		const manifestPath = await writeTargetBuildManifest({
			root,
			requiredPackages: ["react", "next", "react"],
			workspaceRoot: sandbox,
		});

		expectString(manifestPath);

		const status = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next", "react"],
			workspaceRoot: sandbox,
		});

		expect(status.valid).toBe(true);
		expect(status.reason).toBe("manifest-valid");
		expect(status.buildMarkerMtimeMs).toBeTypeOf("number");
		expect(status.latestSourceMtimeMs).toBeGreaterThan(0);
	});

	it("invalidates manifest when component sources change outside app/pages/src", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createBuildMarker(root);
		await createRuntimePackage(root, "next");
		await createRuntimePackage(root, "react");

		const manifestPath = await writeTargetBuildManifest({
			root,
			requiredPackages: ["next", "react"],
			workspaceRoot: sandbox,
		});
		expectString(manifestPath);

		await new Promise((resolve) => setTimeout(resolve, 20));
		await fs.writeFile(
			path.resolve(root, "components", "ui", "button.tsx"),
			"export function Button() { return 'updated'; }",
			"utf8",
		);

		const status = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next", "react"],
			workspaceRoot: sandbox,
		});

		expect(status.valid).toBe(false);
		expect(status.reason).toBe("build-stale");
	});

	it("tracks custom build directories resolved from next config", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createRuntimePackage(root, "next");
		await createRuntimePackage(root, "react");
		await installFakeNextConfigLoader(root);
		await fs.writeFile(
			path.resolve(root, "next.config.js"),
			[
				"module.exports = (phase) => ({",
				"  distDir: phase === 'phase-production-build' ? 'build-output' : 'dev-output',",
				"});",
			].join("\n"),
			"utf8",
		);
		await createBuildMarker(root, "build-output");

		const manifestPath = await writeTargetBuildManifest({
			root,
			requiredPackages: ["next", "react"],
			workspaceRoot: sandbox,
		});

		expectString(manifestPath);

		const status = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next", "react"],
			workspaceRoot: sandbox,
		});

		expect(status.valid).toBe(true);
		expect(status.reason).toBe("manifest-valid");
	});

	it("detects manifest build dir mismatch after config changes", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createBuildMarker(root);
		await createRuntimePackage(root, "next");
		await installFakeNextConfigLoader(root);

		const manifestPath = await writeTargetBuildManifest({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expectString(manifestPath);

		await fs.writeFile(
			path.resolve(root, "next.config.js"),
			"module.exports = { distDir: 'next-build-output' };",
			"utf8",
		);
		await createBuildMarker(root, "next-build-output");

		const status = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(status.valid).toBe(false);
		expect(status.reason).toBe("manifest-build-dir-mismatch");
	});

	it("detects required package mismatch and runtime package missing", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createBuildMarker(root);
		await createRuntimePackage(root, "next");
		await createRuntimePackage(root, "react");

		await writeTargetBuildManifest({
			root,
			requiredPackages: ["next", "react"],
			workspaceRoot: sandbox,
		});

		const mismatch = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next", "zod"],
			workspaceRoot: sandbox,
		});
		expect(mismatch.valid).toBe(false);
		expect(mismatch.reason).toBe("manifest-required-packages-mismatch");

		const runtimeMissing = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next", "react", "zod"],
			workspaceRoot: sandbox,
		});
		expect(runtimeMissing.valid).toBe(false);
		expect(runtimeMissing.reason).toBe("manifest-required-packages-mismatch");
	});

	it("detects runtime package missing and build marker missing", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createBuildMarker(root);
		await createRuntimePackage(root, "next");

		await writeTargetBuildManifest({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});

		await fs.rm(path.resolve(root, "node_modules", "next"), {
			recursive: true,
			force: true,
		});
		const runtimeMissing = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(runtimeMissing.valid).toBe(false);
		expect(runtimeMissing.reason).toBe("runtime-packages-missing");

		await createRuntimePackage(root, "next");
		await fs.rm(path.resolve(root, ".next", "BUILD_ID"), { force: true });
		const markerMissing = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(markerMissing.valid).toBe(false);
		expect(markerMissing.reason).toBe("build-marker-missing");

		await createBuildMarker(root);
		await fs.rm(path.resolve(root, ".next", "prerender-manifest.json"), {
			force: true,
		});
		const artifactsMissing = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(artifactsMissing.valid).toBe(false);
		expect(artifactsMissing.reason).toBe("build-artifacts-missing");
	});

	it("detects stale build and malformed/root-mismatch manifests", async () => {
		const sandbox = await createSandbox();
		const root = await createTargetRoot(sandbox);
		await createBuildMarker(root);
		await createRuntimePackage(root, "next");

		const manifestPath = await writeTargetBuildManifest({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		const concreteManifestPath = expectString(manifestPath);

		const sourcePath = path.resolve(root, "app", "page.tsx");
		const now = new Date();
		const staleMarker = new Date(now.getTime() - 60_000);
		await fs.utimes(
			path.resolve(root, ".next", "BUILD_ID"),
			staleMarker,
			staleMarker,
		);
		await fs.utimes(sourcePath, now, now);

		const staleStatus = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(staleStatus.valid).toBe(false);
		expect(staleStatus.reason).toBe("build-stale");

		const raw = await fs.readFile(concreteManifestPath, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		parsed.targetRoot = path.resolve(root, "other-root");
		await fs.writeFile(concreteManifestPath, JSON.stringify(parsed), "utf8");

		const mismatchRoot = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(mismatchRoot.valid).toBe(false);
		expect(mismatchRoot.reason).toBe("manifest-target-root-mismatch");

		await fs.writeFile(concreteManifestPath, "{not json", "utf8");
		const malformed = await getTargetBuildManifestStatus({
			root,
			requiredPackages: ["next"],
			workspaceRoot: sandbox,
		});
		expect(malformed.valid).toBe(false);
		expect(malformed.reason).toBe("manifest-missing-or-invalid");
	});
});
