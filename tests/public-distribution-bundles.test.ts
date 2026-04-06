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

describe("public distribution bundles", () => {
	it("ships a repo-owned Claude marketplace entry and bundle", async () => {
		const marketplace = await readJson(".claude-plugin/marketplace.json");
		const plugins = marketplace.plugins as Array<Record<string, unknown>>;
		const plugin = await readJson(
			"plugins/openui-workspace-delivery/.claude-plugin/plugin.json",
		);
		const readme = await readText(
			"plugins/openui-workspace-delivery/README.md",
		);

		expect(marketplace.version).toBe(1);
		expect(marketplace.name).toBe("openui-mcp-studio-distribution-starter");
		expect(marketplace.owner).toEqual(
			expect.objectContaining({
				name: "xiaojiou176",
			}),
		);
		expect(Array.isArray(plugins)).toBe(true);
		expect(plugins[0]?.name).toBe("openui-workspace-delivery");
		expect(plugins[0]?.source).toBe("./plugins/openui-workspace-delivery");
		expect(plugin.name).toBe("openui-workspace-delivery");
		expect(plugin.skills).toBe("./skills/");
		expect(plugin.commands).toBe("./commands/");
		expect(readme).toContain("OpenClaw");
	});

	it("keeps a copyable repo-scoped Codex marketplace sample and bundle", async () => {
		const marketplace = await readJson(
			"examples/codex/marketplace.sample.json",
		);
		const plugins = marketplace.plugins as Array<Record<string, unknown>>;
		const plugin = await readJson(
			"plugins/openui-codex-delivery/.codex-plugin/plugin.json",
		);
		const readme = await readText("examples/codex/README.md");

		expect(marketplace.version).toBe(1);
		expect(plugins[0]?.id).toBe("openui-codex-delivery");
		expect(plugin.name).toBe("openui-codex-delivery");
		expect(plugin.skills).toBe("./skills/");
		expect(readme).toContain("$REPO_ROOT/.agents/plugins/marketplace.json");
	});

	it("ships an OpenClaw public-ready manifest with install and proof anchors", async () => {
		const manifest = await readJson(
			"examples/openclaw/public-ready.manifest.json",
		);
		const note = await readText("examples/openclaw/README.md");

		expect(manifest.status).toBe("public-ready");
		expect(manifest.installPath).toEqual(
			expect.arrayContaining([
				"openclaw plugins install ./plugins/openui-workspace-delivery",
			]),
		);
		expect(manifest.discoverableArtifacts).toEqual(
			expect.arrayContaining([
				".claude-plugin/marketplace.json",
				"packages/skills-kit/starter-bundles/openclaw.mcp.json",
			]),
		);
		expect(note).toContain("not a ClawHub listing");
	});
});
