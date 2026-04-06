import { describe, expect, it } from "vitest";

import {
	buildEcosystemGuidePayload,
	buildHelpText,
	buildSkillsStarterPayload,
	buildSurfaceGuidePayload,
	isCliEntrypoint,
} from "../tooling/cli/openui.mjs";

describe("openui repo-local cli", () => {
	it("surfaces the builder guide command in help text", () => {
		const help = buildHelpText();

		expect(help).toContain("surface-guide [--json]");
		expect(help).toContain("ecosystem-guide [--json]");
		expect(help).toContain("repo-side builder surface");
	});

	it("builds a builder surface guide payload from OpenAPI extensions", () => {
		const payload = buildSurfaceGuidePayload("/repo", {
			"x-openui-builder-dispatcher": {
				cli: "openui-mcp-studio",
				surfaceGuideCommand: "openui-mcp-studio surface-guide",
			},
			"x-openui-builder-surface-guide": {
				startWith: "Begin with local MCP.",
				openapiWhen: "Read OpenAPI second.",
				workflowPacketWhen: "Read workflow third.",
				skillsStarterWhen: "Read starter last.",
			},
			"x-openui-builder-surface-order": [
				{
					position: 1,
					surface: "Local stdio MCP",
					audience: "builder",
					bestFor: "real runtime use",
					readWhen: "first",
					notFor: "hosted claims",
					entrypoints: ["services/mcp-server/src/main.ts"],
				},
			],
			"x-openui-later-lanes": [
				{
					id: "managed-hosted-deployment",
					description: "Managed hosted deployment remains later.",
				},
			],
		});

		expect(payload.dispatcher?.surfaceGuideCommand).toBe(
			"openui-mcp-studio surface-guide",
		);
		expect(payload.currentOrder[0]).toEqual(
			expect.objectContaining({
				surface: "Local stdio MCP",
				audience: "builder",
			}),
		);
		expect(payload.laterLanes[0]).toEqual(
			expect.objectContaining({
				id: "managed-hosted-deployment",
			}),
		);
	});

	it("treats shimmed bin paths as the same entrypoint after realpath resolution", () => {
		const resolver = (targetPath: string) => {
			if (targetPath.endsWith("node_modules/.bin/openui-mcp-studio")) {
				return "/repo/tooling/cli/openui.mjs";
			}
			return targetPath;
		};

		expect(
			isCliEntrypoint(
				"/repo/node_modules/.bin/openui-mcp-studio",
				"/repo/tooling/cli/openui.mjs",
				resolver,
			),
		).toBe(true);
	});

	it("builds an ecosystem guide payload from the ecosystem contract", () => {
		const payload = buildEcosystemGuidePayload("/repo", {
			technicalName: "OpenUI MCP Studio",
			frontdoorLabel: "OneClickUI.ai",
			summary: "Current ecosystem packaging truth.",
			currentTruth: {
				codex: "install-ready local MCP",
			},
			clientSupportMatrix: [
				{
					client: "Codex",
					status: "install-ready",
					why: "Local stdio MCP installation is documented.",
					repoOwnedProof: ["README.md"],
					notFor: "marketplace claim",
				},
			],
			surfaces: [
				{
					id: "formal-skills",
					title: "Repo-side Skills starter",
					status: "starter-only",
					audience: "builders",
					role: "starter contract",
					packageShape: "repo-local starter kit",
					installPath: ["examples/skills/README.md"],
					verificationPath: [
						"node tooling/cli/openui.mjs skills starter --json",
					],
					notFor: "public Skills runtime",
				},
			],
			operatorOnlyActions: ["publish release"],
		});

		expect(payload.technicalName).toBe("OpenUI MCP Studio");
		expect(payload.frontdoorLabel).toBe("OneClickUI.ai");
		expect(payload.clientSupportMatrix[0]).toEqual(
			expect.objectContaining({
				client: "Codex",
				status: "install-ready",
			}),
		);
		expect(payload.surfaces[0]).toEqual(
			expect.objectContaining({
				title: "Repo-side Skills starter",
				status: "starter-only",
			}),
		);
		expect(payload.operatorOnlyActions).toContain("publish release");
	});

	it("builds a skills starter payload that exposes install, use, and verification paths", () => {
		const payload = buildSkillsStarterPayload(
			"/repo",
			{
				packageName: "@openui/skills-kit",
				version: "0.1.0",
				summary: "Installable starter kit.",
				audience: "maintainers",
				role: "starter package",
				installPath: ["npm install /repo/packages/skills-kit"],
				status: "plugin-grade-public-package",
				starterBundles: ["starter-bundles/codex.mcp.json"],
				troubleshootingPath: ["starter-troubleshooting.md"],
				verificationPath: ["node tooling/cli/openui.mjs skills starter --json"],
				notFor: ["marketplace claim"],
			},
			{
				summary: "Public starter-pack contract.",
				audience: ["maintainers", "builders"],
				role: "Public starter-pack surface",
				installPath: ["examples/skills/install-use-note.md"],
				usePath: ["Start from the current local stdio MCP builder surface"],
				distributionTier: "plugin-grade-public-distribution-package",
				proofLoop: [
					"openui-mcp-studio skills starter --json",
					"npm run repo:doctor",
				],
				troubleshootingPath: ["packages/skills-kit/starter-troubleshooting.md"],
				officialPublicSurfaces: {
					codex: "bundle exists",
				},
				notFor: ["hosted runtime claim"],
			},
			[
				{
					name: "README.md",
					description: "repo-side starter asset",
					path: "examples/skills/README.md",
				},
			],
		);

		expect(payload.summary).toBe("Public starter-pack contract.");
		expect(payload.audience).toEqual(["maintainers", "builders"]);
		expect(payload.installPath).toEqual([
			"npm install /repo/packages/skills-kit",
			"examples/skills/install-use-note.md",
		]);
		expect(payload.usePath).toEqual([
			"Start from the current local stdio MCP builder surface",
		]);
		expect(payload.distributionTier).toBe(
			"plugin-grade-public-distribution-package",
		);
		expect(payload.starterBundles).toEqual(["starter-bundles/codex.mcp.json"]);
		expect(payload.proofLoop).toEqual([
			"openui-mcp-studio skills starter --json",
			"npm run repo:doctor",
		]);
		expect(payload.troubleshootingPath).toEqual([
			"packages/skills-kit/starter-troubleshooting.md",
		]);
		expect(payload.officialPublicSurfaces).toEqual({
			codex: "bundle exists",
		});
		expect(payload.verificationPath).toEqual([
			"node tooling/cli/openui.mjs skills starter --json",
		]);
		expect(payload.notFor).toEqual([
			"marketplace claim",
			"hosted runtime claim",
		]);
	});
});
