import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function readJson(
	relativePath: string,
): Promise<Record<string, unknown>> {
	const raw = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
	return JSON.parse(raw) as Record<string, unknown>;
}

async function readText(relativePath: string): Promise<string> {
	return await fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("public distribution bundle", () => {
	it("ships a package-ready public distribution manifest with sample configs and proof loop", async () => {
		const manifest = await readJson(
			"examples/public-distribution/public-distribution.manifest.json",
		);

		expect(manifest.version).toBe(1);
		expect(manifest.id).toBe("openui.public-distribution-bundle");
		expect(manifest.status).toBe("package-ready");
		expect(manifest).toHaveProperty("artifacts");
		expect(manifest).toHaveProperty("proofLoop");
		expect(manifest).toHaveProperty("operatorOnlyTail");
		expect(JSON.stringify(manifest)).toContain(
			".claude-plugin/marketplace.json",
		);
		expect(JSON.stringify(manifest)).toContain(
			"examples/codex/marketplace.sample.json",
		);
	});

	it("ships a mixed-boundary root manifest plus Docker packaging notes without claiming a live publish", async () => {
		const rootManifest = await readText("manifest.yaml");
		const dockerManifest = await readJson(
			"examples/public-distribution/docker-runtime-submission.manifest.json",
		);
		const dockerNote = await readText(
			"examples/public-distribution/docker-install-and-proof.md",
		);

		expect(rootManifest).toContain("status: mixed-live-and-review-boundary");
		expect(rootManifest).toContain(
			"canonical_repo: xiaojiou176-open/openui-mcp-studio",
		);
		expect(rootManifest).toContain("external_truth:");
		expect(rootManifest).toContain("clawhub:");
		expect(rootManifest).toContain("status: listed_live");
		expect(rootManifest).toContain(
			"moderation_label: suspicious.llm_suspicious",
		);
		expect(rootManifest).toContain("openhands_pr_161:");
		expect(rootManifest).toContain("status: OPEN / REVIEW_REQUIRED / BLOCKED");
		expect(rootManifest).toContain("official_mcp_registry:");
		expect(rootManifest).toContain("status: not_submitted");
		expect(rootManifest).toContain("ghcr:");
		expect(rootManifest).toContain("status: not_published");
		expect(rootManifest).toContain("public_package_and_container_lanes:");
		expect(rootManifest).toContain("status: no verified public receipt today");
		expect(rootManifest).toContain("docker-runtime-submission.manifest.json");
		expect(dockerManifest.status).toBe("submission-ready-unlisted");
		expect(JSON.stringify(dockerManifest)).toContain("ghcr.io");
		expect(JSON.stringify(dockerManifest)).toContain("not yet published");
		expect(dockerNote).toContain("submission-ready-unlisted");
		expect(dockerNote).toContain("ghcr.io/xiaojiou176-open/openui-mcp-studio");
	});

	it("ships a public-ready OpenClaw bundle without overclaiming a live listing", async () => {
		const manifest = await readJson(
			"examples/public-distribution/openclaw-public-ready.manifest.json",
		);

		expect(manifest.id).toBe("openui.openclaw-public-ready");
		expect(manifest.status).toBe("public-ready");
		expect(manifest).toHaveProperty("officialSurfaceEvidence");
		expect(manifest).toHaveProperty("operatorOnlyTail");
		expect(JSON.stringify(manifest)).toContain("ClawHub");
		expect(JSON.stringify(manifest)).not.toContain('"status":"listed"');
	});

	it("documents the plug-and-play install and proof loop in human-readable notes", async () => {
		const installNote = await readText(
			"examples/public-distribution/install-and-proof.md",
		);
		const openclawNote = await readText(
			"examples/public-distribution/openclaw-install-and-proof.md",
		);

		expect(installNote).toContain("codex mcp add openui");
		expect(installNote).toContain("claude mcp add --transport stdio");
		expect(installNote).toContain(".claude-plugin/marketplace.json");
		expect(installNote).toContain("examples/codex/marketplace.sample.json");
		expect(installNote).toContain("node tooling/public-distribution-proof.mjs");
		expect(openclawNote).toContain("public-ready");
		expect(openclawNote).toContain("ClawHub");
		expect(openclawNote).toContain(
			"openclaw plugins install ./plugins/openui-workspace-delivery",
		);
	});

	it("ships plugin bundle directories with host config and manifest together", async () => {
		const claudeBundle = await readJson(
			"plugins/openui-workspace-delivery/.claude-plugin/plugin.json",
		);
		const codexBundle = await readJson(
			"plugins/openui-codex-delivery/.codex-plugin/plugin.json",
		);
		const claudeMcp = await readJson(
			"plugins/openui-workspace-delivery/.mcp.json",
		);
		const codexMcp = await readJson("plugins/openui-codex-delivery/.mcp.json");

		expect(claudeBundle.name).toBe("openui-workspace-delivery");
		expect(codexBundle.name).toBe("openui-codex-delivery");
		expect(JSON.stringify(claudeMcp)).toContain("mcpServers");
		expect(JSON.stringify(codexMcp)).toContain("mcpServers");
	});
});
