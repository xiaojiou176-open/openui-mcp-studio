import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function createToolHarness(): {
	server: McpServer;
	getHandler: (name: string) => ToolHandler;
} {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			if (typeof handler !== "function") {
				throw new Error(`Invalid tool handler for ${name}`);
			}
			handlers.set(name, handler as ToolHandler);
		},
	} as unknown as McpServer;

	return {
		server,
		getHandler(name: string) {
			const handler = handlers.get(name);
			if (!handler) {
				throw new Error(`Missing tool handler: ${name}`);
			}
			return handler;
		},
	};
}

function readText(result: TextResult): string {
	const block = result.content.find((item) => item.type === "text");
	if (!block?.text) {
		throw new Error("Tool result is missing text content.");
	}
	return block.text;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	delete process.env.OPENUI_MCP_CACHE_DIR;
	delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship branch coverage", () => {
	it("skips rollback_on_quality_fail when quality fails but apply writes are empty", async () => {
		const workspaceRoot = await mkTempDir("openui-ship-branch-workspace-");
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();
		process.env.OPENUI_MCP_CACHE_DIR = await mkTempDir(
			"openui-ship-branch-cache-",
		);

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};
		const resolveShadcnStyleGuideMock = vi.fn(async () => ({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		}));
		const requestHtmlFromPromptMock = vi.fn(
			async () => "<main>quality fail</main>",
		);
		const convertHtmlToReactShadcnMock = vi.fn(async () => ({
			detection,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content: "export default function Page() { return null; }",
					},
				],
				notes: [],
			},
		}));
		const applyGeneratedFilesMock = vi.fn(async () => ({
			targetRoot: workspaceRoot,
			dryRun: false,
			rollbackOnError: true,
			plan: [{ path: "app/page.tsx", status: "create" as const }],
			written: [],
			rolledBack: false,
		}));
		const runQualityGateMock = vi.fn(async () => ({
			passed: false,
			issues: [{ severity: "error", message: "quality failed" }],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		}));
		const leaseAbandon = vi.fn(async () => undefined);
		const leaseComplete = vi.fn(async () => undefined);
		const idempotencyStoreMock = {
			get: vi.fn(async () => undefined),
			beginExecution: vi.fn(async () => ({
				status: "acquired",
				lease: {
					startHeartbeat: () => () => undefined,
					complete: leaseComplete,
					abandon: leaseAbandon,
				},
			})),
			waitFor: vi.fn(),
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: resolveShadcnStyleGuideMock,
				requestHtmlFromPrompt: requestHtmlFromPromptMock,
				convertHtmlToReactShadcn: convertHtmlToReactShadcnMock,
			};
		});
		vi.doMock("../services/mcp-server/src/file-ops.js", async () => {
			const actual =
				await vi.importActual<typeof import("../services/mcp-server/src/file-ops.js")>(
					"../services/mcp-server/src/file-ops.js",
				);
			return { ...actual, applyGeneratedFiles: applyGeneratedFilesMock };
		});
		vi.doMock("../services/mcp-server/src/quality-gate.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/quality-gate.js")
			>("../services/mcp-server/src/quality-gate.js");
			return { ...actual, runQualityGate: runQualityGateMock };
		});
		vi.doMock("../packages/shared-runtime/src/idempotency-store.js", () => ({
			shipIdempotencyStore: idempotencyStoreMock,
		}));

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);
		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship branch quality fail without writes",
			workspaceRoot,
			idempotencyKey: "quality-fail-no-write-key",
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as {
			files: Array<{ path: string }>;
			apply: { rollbackReason?: string };
			summary: { status: string; changedPaths: string[] };
			steps: Array<{ name: string }>;
		};
		expect(payload.summary.status).toBe("quality_failed");
		expect(payload.summary.changedPaths).toEqual(
			payload.files.map((file) => file.path),
		);
		expect(payload.apply.rollbackReason).toBeUndefined();
		expect(
			payload.steps.some((step) => step.name === "rollback_on_quality_fail"),
		).toBe(false);
		expect(leaseComplete).not.toHaveBeenCalled();
		expect(leaseAbandon).toHaveBeenCalledTimes(1);
	}, 15000);

	it("throws when beginExecution returns cached payload that is not reusable", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const resolveShadcnStyleGuideMock = vi.fn(async () => ({
			detection: {
				workspaceRoot: "/tmp/openui-workspace",
				source: "default" as const,
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["fixture"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use cards",
		}));
		const requestHtmlFromPromptMock = vi.fn(
			async () => "<main>should-not-run</main>",
		);
		const idempotencyStoreMock = {
			get: vi.fn(async () => undefined),
			beginExecution: vi.fn(async () => ({
				status: "cached",
				value: {
					workspaceRoot: "/tmp/openui-workspace",
					detection: { source: "cached" },
					html: "<main>stale</main>",
					files: [{ path: "app/page.tsx", content: "stale" }],
					notes: [],
					apply: { written: ["app/page.tsx"], rolledBack: false },
					quality: { passed: false },
				},
			})),
			waitFor: vi.fn(),
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: resolveShadcnStyleGuideMock,
				requestHtmlFromPrompt: requestHtmlFromPromptMock,
			};
		});
		vi.doMock("../packages/shared-runtime/src/idempotency-store.js", () => ({
			shipIdempotencyStore: idempotencyStoreMock,
		}));

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "cached but quality failed",
				workspaceRoot: "/tmp/openui-workspace",
				idempotencyKey: "cached-not-reusable-key",
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow(/did not acquire lease/i);
		expect(requestHtmlFromPromptMock).not.toHaveBeenCalled();
	}, 15000);

	it("continues after idempotency_lookup best-effort failure and reuses cached beginExecution payload", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const resolveShadcnStyleGuideMock = vi.fn(async () => ({
			detection: {
				workspaceRoot: "/tmp/openui-workspace",
				source: "default" as const,
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["fixture"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use cards",
		}));
		const requestHtmlFromPromptMock = vi.fn(
			async () => "<main>should-not-run</main>",
		);
		const idempotencyStoreMock = {
			get: vi.fn(async () => {
				throw new Error("lookup-down");
			}),
			beginExecution: vi.fn(async () => ({
				status: "cached",
				value: {
					workspaceRoot: "/tmp/openui-workspace",
					detection: { source: "cached" },
					html: "<main>cached</main>",
					files: [{ path: "app/page.tsx", content: "cached" }],
					notes: [],
					apply: { written: ["app/page.tsx"], rolledBack: false },
					quality: { passed: true },
				},
			})),
			waitFor: vi.fn(),
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: resolveShadcnStyleGuideMock,
				requestHtmlFromPrompt: requestHtmlFromPromptMock,
			};
		});
		vi.doMock("../packages/shared-runtime/src/idempotency-store.js", () => ({
			shipIdempotencyStore: idempotencyStoreMock,
		}));

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "lookup fail then cached payload",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "lookup-fail-then-cached-key",
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as {
			html: string;
			summary: { idempotencyHit: boolean };
			steps: Array<{ name: string; status: string; error?: string }>;
		};
		const lookupStep = payload.steps.find(
			(step) => step.name === "idempotency_lookup",
		);
		expect(lookupStep?.status).toBe("error");
		expect(lookupStep?.error).toContain("lookup-down");
		expect(payload.html).toBe("<main>cached</main>");
		expect(payload.summary.idempotencyHit).toBe(true);
		expect(requestHtmlFromPromptMock).not.toHaveBeenCalled();
	}, 15000);

	it("returns cached payload when inflight wait resolves to ready", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const resolveShadcnStyleGuideMock = vi.fn(async () => ({
			detection: {
				workspaceRoot: "/tmp/openui-workspace",
				source: "default" as const,
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["fixture"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use cards",
		}));
		const requestHtmlFromPromptMock = vi.fn(
			async () => "<main>should-not-run</main>",
		);
		const idempotencyStoreMock = {
			get: vi.fn(async () => undefined),
			beginExecution: vi.fn(async () => ({ status: "inflight" })),
			waitFor: vi.fn(async () => ({
				status: "ready",
				value: {
					workspaceRoot: "/tmp/openui-workspace",
					detection: { source: "cached" },
					html: "<main>ready</main>",
					files: [{ path: "app/page.tsx", content: "ready" }],
					notes: [],
					apply: { written: ["app/page.tsx"], rolledBack: false },
					quality: { passed: true },
				},
			})),
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: resolveShadcnStyleGuideMock,
				requestHtmlFromPrompt: requestHtmlFromPromptMock,
			};
		});
		vi.doMock("../packages/shared-runtime/src/idempotency-store.js", () => ({
			shipIdempotencyStore: idempotencyStoreMock,
		}));

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "inflight ready",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "inflight-ready-key",
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as {
			html: string;
			summary: { idempotencyHit: boolean };
		};
		expect(payload.html).toBe("<main>ready</main>");
		expect(payload.summary.idempotencyHit).toBe(true);
		expect(requestHtmlFromPromptMock).not.toHaveBeenCalled();
	}, 15000);

	it("fails loudly when inflight wait ends with timeout_missing", async () => {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const resolveShadcnStyleGuideMock = vi.fn(async () => ({
			detection: {
				workspaceRoot: "/tmp/openui-workspace",
				source: "default" as const,
				uiImportBase: "@/components/ui",
				uiDir: "components/ui",
				componentsImportBase: "@/components",
				componentsDir: "components",
				evidence: ["fixture"],
			},
			uiImportBase: "@/components/ui",
			styleGuide: "Use cards",
		}));
		const idempotencyStoreMock = {
			get: vi.fn(async () => undefined),
			beginExecution: vi.fn(async () => ({ status: "inflight" })),
			waitFor: vi.fn(async () => ({ status: "timeout_missing" })),
		};

		vi.doMock("../services/mcp-server/src/tools/shared.js", async () => {
			const actual = await vi.importActual<
				typeof import("../services/mcp-server/src/tools/shared.js")
			>("../services/mcp-server/src/tools/shared.js");
			return {
				...actual,
				resolveShadcnStyleGuide: resolveShadcnStyleGuideMock,
			};
		});
		vi.doMock("../packages/shared-runtime/src/idempotency-store.js", () => ({
			shipIdempotencyStore: idempotencyStoreMock,
		}));

		const { registerShipTool } = await import("../services/mcp-server/src/tools/ship.js");
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "inflight timeout missing",
				workspaceRoot: "/tmp/openui-workspace",
				idempotencyKey: "inflight-timeout-missing-key",
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow(/status=timeout_missing/i);
	}, 15000);

	it("records missing snapshot details and rollback conflict boundaries", async () => {
		const root = await mkTempDir("openui-ship-branch-rollback-");
		const ship = await import("../services/mcp-server/src/tools/ship.js");

		const missingSnapshot = await ship.__test__.rollbackWrittenFiles(
			root,
			["app/page.tsx"],
			new Map(),
			new Map([["app/page.tsx", "new-content"]]),
		);
		expect(missingSnapshot.rolledBack).toBe(false);
		expect(missingSnapshot.rollbackDetails).toEqual([
			{
				path: "app/page.tsx",
				status: "remove_failed",
				message: "Missing pre-apply backup snapshot.",
			},
		]);

		const absentPath = "app/new-file.tsx";
		const removeWhenAlreadyAbsent = await ship.__test__.rollbackWrittenFiles(
			root,
			[absentPath],
			new Map([[absentPath, { path: absentPath, existed: false }]]),
			new Map([[absentPath, "created-content"]]),
		);
		expect(removeWhenAlreadyAbsent.rolledBack).toBe(true);
		expect(removeWhenAlreadyAbsent.rollbackDetails).toEqual([
			{ path: absentPath, status: "removed" },
		]);

		const conflictPath = "app/conflict.tsx";
		const absoluteConflictPath = path.join(root, conflictPath);
		await fs.mkdir(path.dirname(absoluteConflictPath), { recursive: true });
		await fs.writeFile(absoluteConflictPath, "external-content", "utf8");
		const restoreConflict = await ship.__test__.rollbackWrittenFiles(
			root,
			[conflictPath],
			new Map([
				[
					conflictPath,
					{
						path: conflictPath,
						existed: true,
						previousContent: "old-content",
					},
				],
			]),
			new Map([[conflictPath, "new-content"]]),
		);
		expect(restoreConflict.rolledBack).toBe(false);
		expect(restoreConflict.rollbackDetails).toEqual([
			{
				path: conflictPath,
				status: "restore_skipped_conflict",
				message: "Skipped rollback because file content changed after apply.",
			},
		]);
	});

	it("buildSummary handles rolledBack and fallback changedPaths branches", async () => {
		const ship = await import("../services/mcp-server/src/tools/ship.js");

		const rolledBackSummary = ship.__test__.buildSummary(
			{
				workspaceRoot: "/tmp/openui-workspace",
				detection: { source: "fixture" },
				html: "<main>ok</main>",
				files: [{ path: "app/page.tsx", content: "content" }],
				notes: [],
				apply: { rolledBack: true, written: ["app/page.tsx"] },
				quality: { passed: true },
			},
			false,
		);
		expect(rolledBackSummary).toEqual({
			filesCount: 1,
			changedPaths: [],
			qualityGate: true,
			status: "success",
			idempotencyHit: false,
		});

		const fallbackSummary = ship.__test__.buildSummary(
			{
				workspaceRoot: "/tmp/openui-workspace",
				detection: { source: "fixture" },
				html: "<main>failed</main>",
				files: [
					{ path: "app/page.tsx", content: "content" },
					{ path: "components/card.tsx", content: "content" },
				],
				notes: [],
				apply: { rolledBack: false, written: [] },
				quality: { passed: false },
			},
			true,
		);
		expect(fallbackSummary).toEqual({
			filesCount: 2,
			changedPaths: ["app/page.tsx", "components/card.tsx"],
			qualityGate: false,
			status: "quality_failed",
			idempotencyHit: true,
		});
	});
});
