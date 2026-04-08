import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const skillsRoot = path.join(repoRoot, "examples", "skills");

async function readJson(relativePath: string): Promise<unknown> {
	const raw = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
	return JSON.parse(raw);
}

async function readText(relativePath: string): Promise<string> {
	return await fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("public skills product line", () => {
	it("ships a machine-readable public starter manifest with honest boundaries", async () => {
		const manifest = (await readJson(
			"examples/skills/public-starter.manifest.json",
		)) as Record<string, unknown>;

		expect(manifest.version).toBe(1);
		expect(manifest.id).toBe("openui.public-skills-starter");
		expect(manifest.status).toBe("public-starter");
		expect(manifest.distributionTier).toBe(
			"plugin-grade-public-distribution-package",
		);
		expect(manifest.role).toBe(
			"Official repo-owned skill product line for honest host installs and unlisted packaging.",
		);
		expect(manifest).toHaveProperty("packageShape");
		expect(manifest).toHaveProperty("installPath");
		expect(manifest).toHaveProperty("starterBundles");
		expect(manifest).toHaveProperty("usePath");
		expect(manifest).toHaveProperty("proofLoop");
		expect(manifest).toHaveProperty("proofAnchors");
		expect(manifest).toHaveProperty("troubleshootingPath");
		expect(manifest).toHaveProperty("notFor");
	});

	it("includes a zero-context install/use note that keeps runtime claims bounded", async () => {
		const note = await readText("examples/skills/install-use-note.md");

		expect(note).toContain("official **repo-owned skill");
		expect(note).toContain("public-starter.manifest.json");
		expect(note).toContain("../public-distribution/codex.mcp.json");
		expect(note).toContain("../public-distribution/claude-code.mcp.json");
		expect(note).toContain(
			"../public-distribution/openclaw-public-ready.manifest.json",
		);
		expect(note).toContain("it is **not** a shipped Skills runtime");
		expect(note).toContain("it is **not** a marketplace listing");
	});

	it("keeps the example contract wired to the public starter manifest and install note", async () => {
		const example = (await readJson(
			"examples/skills/starter-contract.example.json",
		)) as Record<string, unknown>;
		const starterPack = example.starterPack as Record<string, unknown>;
		const proofAnchors = example.proofAnchors as Array<Record<string, string>>;

		expect(example.status).toBe("public-starter-example");
		expect(starterPack.manifest).toBe(
			"examples/skills/public-starter.manifest.json",
		);
		expect(starterPack.installNote).toBe("examples/skills/install-use-note.md");
		expect(
			proofAnchors.some(
				(anchor) =>
					anchor.path === "examples/skills/public-starter.manifest.json",
			),
		).toBe(true);
		expect(
			proofAnchors.some(
				(anchor) => anchor.path === "examples/skills/install-use-note.md",
			),
		).toBe(true);
		expect(proofAnchors.some((anchor) => /later lane/i.test(anchor.why))).toBe(
			false,
		);
		expect(
			proofAnchors.some((anchor) =>
				/@openui\/skills-kit|skill product line/i.test(anchor.why),
			),
		).toBe(true);
	});

	it("keeps the repo mirror focused on docs and manifest files", async () => {
		const entries = await fs.readdir(skillsRoot);

		expect(entries).toContain("public-starter.manifest.json");
		expect(entries).toContain("install-use-note.md");
		expect(entries).toContain("README.md");
		expect(entries).toContain("codex.mcp.json");
		expect(entries).toContain("openclaw.mcp.json");
	});

	it("ships starter bundle files from the package surface with honest boundaries", async () => {
		const codexBundle = (await readJson(
			"packages/skills-kit/starter-bundles/codex.mcp.json",
		)) as Record<string, unknown>;
		const claudeBundle = (await readJson(
			"packages/skills-kit/starter-bundles/claude-code.mcp.json",
		)) as Record<string, unknown>;
		const openclawBundle = (await readJson(
			"packages/skills-kit/starter-bundles/openclaw.mcp.json",
		)) as Record<string, unknown>;

		expect(codexBundle.status).toBe("plugin-grade-public-package");
		expect(claudeBundle.status).toBe("plugin-grade-public-package");
		expect(openclawBundle.status).toBe("public-ready-unlisted");
		expect(JSON.stringify(openclawBundle)).toContain("ClawHub");
	});
});
