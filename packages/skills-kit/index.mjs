import manifest from "./manifest.json" with { type: "json" };
import starterTemplate from "./starter-contract.template.json" with { type: "json" };
import starterExample from "./starter-contract.example.json" with { type: "json" };
import codexBundle from "./starter-bundles/codex.mcp.json" with { type: "json" };
import claudeCodeBundle from "./starter-bundles/claude-code.mcp.json" with { type: "json" };
import openclawBundle from "./starter-bundles/openclaw.mcp.json" with { type: "json" };

export const OPENUI_SKILLS_KIT_MANIFEST = manifest;
export const OPENUI_SKILLS_STARTER_TEMPLATE = starterTemplate;
export const OPENUI_SKILLS_STARTER_EXAMPLE = starterExample;
export const OPENUI_CODEX_STARTER_BUNDLE = codexBundle;
export const OPENUI_CLAUDE_CODE_STARTER_BUNDLE = claudeCodeBundle;
export const OPENUI_OPENCLAW_STARTER_BUNDLE = openclawBundle;

export function getOpenuiSkillsStarter() {
  return {
    manifest: OPENUI_SKILLS_KIT_MANIFEST,
    template: OPENUI_SKILLS_STARTER_TEMPLATE,
    example: OPENUI_SKILLS_STARTER_EXAMPLE,
    starterBundles: {
      codex: OPENUI_CODEX_STARTER_BUNDLE,
      claudeCode: OPENUI_CLAUDE_CODE_STARTER_BUNDLE,
      openclaw: OPENUI_OPENCLAW_STARTER_BUNDLE,
    },
  };
}
