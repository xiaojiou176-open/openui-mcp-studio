import { describe, expect, it } from "vitest";

import {
	getOpenuiSkillsStarter,
	OPENUI_CLAUDE_CODE_STARTER_BUNDLE,
	OPENUI_CODEX_STARTER_BUNDLE,
	OPENUI_OPENCLAW_STARTER_BUNDLE,
	OPENUI_SKILLS_KIT_MANIFEST,
	OPENUI_SKILLS_STARTER_EXAMPLE,
	OPENUI_SKILLS_STARTER_TEMPLATE,
} from "../packages/skills-kit/index.mjs";

describe("@openui/skills-kit", () => {
	it("exposes an installable public starter manifest", () => {
		expect(OPENUI_SKILLS_KIT_MANIFEST.packageName).toBe("@openui/skills-kit");
		expect(OPENUI_SKILLS_KIT_MANIFEST.status).toBe(
			"plugin-grade-public-package",
		);
		expect(OPENUI_SKILLS_KIT_MANIFEST.installPath).toEqual(
			expect.arrayContaining([expect.stringContaining("packages/skills-kit")]),
		);
		expect(OPENUI_SKILLS_KIT_MANIFEST.verificationPath).toEqual(
			expect.arrayContaining([
				expect.stringContaining("npm run demo:ship"),
				expect.stringContaining("node --input-type=module -e"),
				expect.stringContaining("OPENUI_SKILLS_KIT_MANIFEST.packageName"),
			]),
		);
		expect(OPENUI_SKILLS_KIT_MANIFEST.starterBundles).toEqual(
			expect.arrayContaining([
				"starter-bundles/codex.mcp.json",
				"starter-bundles/openclaw.mcp.json",
			]),
		);
		expect(OPENUI_SKILLS_KIT_MANIFEST.notFor).toContain(
			"claiming a marketplace listing",
		);
	});

	it("exports starter template, example payloads, and host bundles", () => {
		expect(OPENUI_SKILLS_STARTER_TEMPLATE.status).toBe("starter-draft");
		expect(OPENUI_SKILLS_STARTER_EXAMPLE.status).toBe("starter-example-only");
		expect(OPENUI_CODEX_STARTER_BUNDLE.host).toBe("Codex");
		expect(OPENUI_CLAUDE_CODE_STARTER_BUNDLE.host).toBe("Claude Code");
		expect(OPENUI_OPENCLAW_STARTER_BUNDLE.host).toBe("OpenClaw");
		expect(getOpenuiSkillsStarter()).toEqual(
			expect.objectContaining({
				manifest: OPENUI_SKILLS_KIT_MANIFEST,
				template: OPENUI_SKILLS_STARTER_TEMPLATE,
				example: OPENUI_SKILLS_STARTER_EXAMPLE,
				starterBundles: expect.objectContaining({
					codex: OPENUI_CODEX_STARTER_BUNDLE,
					claudeCode: OPENUI_CLAUDE_CODE_STARTER_BUNDLE,
					openclaw: OPENUI_OPENCLAW_STARTER_BUNDLE,
				}),
			}),
		);
	});
});
