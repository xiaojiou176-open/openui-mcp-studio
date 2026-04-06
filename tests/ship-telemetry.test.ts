import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	runBestEffortStep,
	runRequiredStep,
} from "../services/mcp-server/src/ship/telemetry.js";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

type ShipTelemetryStep = {
	name: string;
	status: string;
	durationMs: number;
	error?: string;
};

type ShipTelemetrySummary = {
	filesCount: number;
	changedPaths: string[];
	qualityGate: boolean;
	status: string;
	idempotencyHit: boolean;
};

type ShipToolOutput = {
	files: Array<{ path: string; content: string }>;
	apply: {
		written?: string[];
		rolledBack?: boolean;
		rollbackReason?: string;
		rollbackDetails?: Array<{ path: string; status: string; message?: string }>;
	};
	quality: { passed: boolean };
	steps: ShipTelemetryStep[];
	summary: ShipTelemetrySummary;
};

const tempDirs: string[] = [];
const ORIGINAL_OPENUI_MCP_CACHE_DIR = process.env.OPENUI_MCP_CACHE_DIR;
const ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT =
	process.env.OPENUI_MCP_WORKSPACE_ROOT;

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
	if (ORIGINAL_OPENUI_MCP_CACHE_DIR === undefined) {
		delete process.env.OPENUI_MCP_CACHE_DIR;
	} else {
		process.env.OPENUI_MCP_CACHE_DIR = ORIGINAL_OPENUI_MCP_CACHE_DIR;
	}
	if (ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT === undefined) {
		delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	} else {
		process.env.OPENUI_MCP_WORKSPACE_ROOT = ORIGINAL_OPENUI_MCP_WORKSPACE_ROOT;
	}
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship telemetry", () => {
	it("records string failures for required and best-effort steps", async () => {
		const steps: ShipTelemetryStep[] = [];

		await expect(
			runRequiredStep(steps, "required-string", async () => {
				throw "network-down";
			}),
		).rejects.toBe("network-down");

		const bestEffort = await runBestEffortStep(
			steps,
			"best-effort-string",
			async () => {
				throw "soft-failure";
			},
		);

		expect(bestEffort).toBeUndefined();
		expect(steps).toEqual([
			expect.objectContaining({
				name: "required-string",
				status: "error",
				error: "network-down",
			}),
			expect.objectContaining({
				name: "best-effort-string",
				status: "error",
				error: "soft-failure",
			}),
		]);
	});

	it("returns steps and summary with stable shape", async () => {
		process.env.OPENUI_MCP_CACHE_DIR = await mkTempDir(
			"openui-ship-telemetry-cache-",
		);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		const detection = {
			workspaceRoot: "/tmp/openui-workspace",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(shared, "requestHtmlFromPrompt").mockResolvedValue(
			"<main>telemetry</main>",
		);
		vi.spyOn(shared, "convertHtmlToReactShadcn").mockResolvedValue({
			detection,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content: "export default function Page() { return null; }",
					},
				],
				notes: ["converted"],
			},
		});
		vi.spyOn(fileOps, "applyGeneratedFiles").mockResolvedValue({
			targetRoot: "/tmp/openui-workspace",
			dryRun: false,
			rollbackOnError: true,
			plan: [{ path: "app/page.tsx", status: "create" as const }],
			written: ["app/page.tsx"],
			rolledBack: false,
		});
		vi.spyOn(quality, "runQualityGate").mockResolvedValue({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship telemetry",
			workspaceRoot: "/tmp/openui-workspace",
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as ShipToolOutput;

		expect(Array.isArray(payload.steps)).toBe(true);
		expect(payload.steps.length).toBeGreaterThanOrEqual(5);
		const stepNames = payload.steps.map((step) => step.name);
		expect(stepNames).toEqual(
			expect.arrayContaining([
				"resolve_style_guide",
				"generate_html",
				"convert_react",
				"apply_files",
				"quality_gate",
			]),
		);
		for (const step of payload.steps) {
			expect(typeof step.name).toBe("string");
			expect(typeof step.status).toBe("string");
			expect(typeof step.durationMs).toBe("number");
			expect(step.durationMs).toBeGreaterThanOrEqual(0);
			expect(step.error === undefined || typeof step.error === "string").toBe(
				true,
			);
		}

		expect(payload.summary).toEqual({
			filesCount: payload.files.length,
			changedPaths:
				payload.apply.written || payload.files.map((file) => file.path),
			qualityGate: payload.quality.passed,
			status: "success",
			idempotencyHit: false,
		});
	}, 20_000);

	it("does not reuse implicit idempotency cache when uiImportBase changes", async () => {
		const cacheDir = await mkTempDir("openui-ship-telemetry-cache-");
		const workspaceRoot = await mkTempDir("openui-ship-telemetry-workspace-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockImplementation(
			async ({ workspaceRoot: root, uiImportBase }) => {
				const resolvedUiImportBase =
					typeof uiImportBase === "string" && uiImportBase.trim().length > 0
						? uiImportBase
						: "@/components/ui";
				const detection = {
					workspaceRoot: root,
					source: "default" as const,
					uiImportBase: resolvedUiImportBase,
					uiDir: "components/ui",
					componentsImportBase: "@/components",
					componentsDir: "components",
					evidence: ["fixture"],
				};
				return {
					detection,
					uiImportBase: resolvedUiImportBase,
					styleGuide: "Use cards",
				};
			},
		);
		vi.spyOn(shared, "requestHtmlFromPrompt").mockResolvedValue(
			"<main>telemetry</main>",
		);
		const convertSpy = vi
			.spyOn(shared, "convertHtmlToReactShadcn")
			.mockImplementation(async ({ detection }) => ({
				detection,
				payload: {
					files: [
						{
							path: "app/page.tsx",
							content:
								'export default function Page() { return <main className="p-4">ok</main>; }',
						},
					],
					notes: ["converted"],
				},
			}));
		vi.spyOn(fileOps, "applyGeneratedFiles").mockResolvedValue({
			targetRoot: workspaceRoot,
			dryRun: true,
			rollbackOnError: true,
			plan: [{ path: "app/page.tsx", status: "create" as const }],
			written: [],
			rolledBack: false,
		});
		vi.spyOn(quality, "runQualityGate").mockResolvedValue({
			passed: true,
			issues: [],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const firstResult = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship telemetry uiImportBase",
			workspaceRoot,
			uiImportBase: "@/components/ui",
			dryRun: true,
			runCommands: false,
		});
		const secondResult = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship telemetry uiImportBase",
			workspaceRoot,
			uiImportBase: "@/lib/ui",
			dryRun: true,
			runCommands: false,
		});

		const firstPayload = JSON.parse(readText(firstResult)) as ShipToolOutput;
		const secondPayload = JSON.parse(readText(secondResult)) as ShipToolOutput;

		expect(firstPayload.summary.idempotencyHit).toBe(false);
		expect(secondPayload.summary.idempotencyHit).toBe(false);
		expect(convertSpy).toHaveBeenCalledTimes(2);
	}, 20_000);

	it("rolls back written files when quality gate fails", async () => {
		const cacheDir = await mkTempDir("openui-ship-telemetry-cache-");
		const workspaceRoot = await mkTempDir("openui-ship-telemetry-workspace-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const originalFilePath = path.join(workspaceRoot, "app/page.tsx");
		await fs.mkdir(path.dirname(originalFilePath), { recursive: true });
		await fs.writeFile(
			originalFilePath,
			"export default function Page() { return <div>old</div>; }",
			"utf8",
		);

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(shared, "requestHtmlFromPrompt").mockResolvedValue(
			"<main>telemetry</main>",
		);
		vi.spyOn(shared, "convertHtmlToReactShadcn").mockResolvedValue({
			detection,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content:
							"export default function Page() { return <div>new</div>; }",
					},
				],
				notes: ["converted"],
			},
		});
		vi.spyOn(quality, "runQualityGate").mockResolvedValue({
			passed: false,
			issues: [{ severity: "error", message: "quality failed" }],
			commandResults: [],
			checkedFiles: ["app/page.tsx"],
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship telemetry quality fail",
			workspaceRoot,
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as ShipToolOutput;
		const restored = await fs.readFile(originalFilePath, "utf8");

		expect(payload.summary.status).toBe("quality_failed");
		expect(payload.summary.changedPaths).toEqual([]);
		expect(payload.apply.rolledBack).toBe(true);
		expect(payload.apply.rollbackReason).toBe("quality_gate_failed");
		expect(
			payload.apply.rollbackDetails?.every(
				(detail) => detail.status === "restored",
			),
		).toBe(true);
		expect(restored).toBe(
			"export default function Page() { return <div>old</div>; }",
		);
		expect(payload.steps.map((step) => step.name)).toContain(
			"rollback_on_quality_fail",
		);
	});

	it("fails rollback when written file is swapped to a symlink before rollback", async () => {
		const cacheDir = await mkTempDir("openui-ship-telemetry-cache-");
		const workspaceRoot = await mkTempDir("openui-ship-telemetry-workspace-");
		const outsideRoot = await mkTempDir("openui-ship-telemetry-outside-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const originalFilePath = path.join(workspaceRoot, "app/page.tsx");
		const outsideFilePath = path.join(outsideRoot, "outside.tsx");
		await fs.mkdir(path.dirname(originalFilePath), { recursive: true });
		await fs.writeFile(
			originalFilePath,
			"export default function Page() { return <div>old</div>; }",
			"utf8",
		);
		await fs.writeFile(
			outsideFilePath,
			"export default function Outside() { return <div>outside</div>; }",
			"utf8",
		);

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(shared, "requestHtmlFromPrompt").mockResolvedValue(
			"<main>telemetry</main>",
		);
		vi.spyOn(shared, "convertHtmlToReactShadcn").mockResolvedValue({
			detection,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content:
							"export default function Page() { return <div>new</div>; }",
					},
				],
				notes: ["converted"],
			},
		});
		vi.spyOn(quality, "runQualityGate").mockImplementation(async () => {
			await fs.rm(originalFilePath, { force: true });
			await fs.symlink(outsideFilePath, originalFilePath);
			return {
				passed: false,
				issues: [{ severity: "error", message: "quality failed" }],
				commandResults: [],
				checkedFiles: ["app/page.tsx"],
			};
		});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "Ship telemetry quality fail symlink rollback",
				workspaceRoot,
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow(/rollback did not complete successfully/i);

		await expect(
			fs.lstat(originalFilePath).then((stat) => stat.isSymbolicLink()),
		).resolves.toBe(true);
		await expect(fs.readFile(outsideFilePath, "utf8")).resolves.toBe(
			"export default function Outside() { return <div>outside</div>; }",
		);
	});

	it("fails fast when apply_files step throws", async () => {
		process.env.OPENUI_MCP_CACHE_DIR = await mkTempDir(
			"openui-ship-telemetry-cache-",
		);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();
		const workspaceRoot = await mkTempDir("openui-ship-telemetry-workspace-");

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(shared, "requestHtmlFromPrompt").mockResolvedValue(
			"<main>telemetry</main>",
		);
		vi.spyOn(shared, "convertHtmlToReactShadcn").mockResolvedValue({
			detection,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content:
							"export default function Page() { return <div>new</div>; }",
					},
				],
				notes: ["converted"],
			},
		});
		vi.spyOn(fileOps, "applyGeneratedFiles").mockRejectedValue(
			new Error("apply failed"),
		);
		const qualitySpy = vi.spyOn(quality, "runQualityGate");

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "Ship telemetry apply fail",
				workspaceRoot,
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow("apply failed");
		expect(qualitySpy).not.toHaveBeenCalled();
	});

	it("fails when quality_gate step throws", async () => {
		process.env.OPENUI_MCP_CACHE_DIR = await mkTempDir(
			"openui-ship-telemetry-cache-",
		);
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();
		const workspaceRoot = await mkTempDir("openui-ship-telemetry-workspace-");

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");

		const detection = {
			workspaceRoot,
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		vi.spyOn(shared, "resolveShadcnStyleGuide").mockResolvedValue({
			detection,
			uiImportBase: detection.uiImportBase,
			styleGuide: "Use cards",
		});
		vi.spyOn(shared, "requestHtmlFromPrompt").mockResolvedValue(
			"<main>telemetry</main>",
		);
		vi.spyOn(shared, "convertHtmlToReactShadcn").mockResolvedValue({
			detection,
			payload: {
				files: [
					{
						path: "app/page.tsx",
						content:
							"export default function Page() { return <div>new</div>; }",
					},
				],
				notes: ["converted"],
			},
		});
		vi.spyOn(fileOps, "applyGeneratedFiles").mockResolvedValue({
			targetRoot: workspaceRoot,
			dryRun: false,
			rollbackOnError: true,
			plan: [{ path: "app/page.tsx", status: "update" as const }],
			written: ["app/page.tsx"],
			rolledBack: false,
		});
		vi.spyOn(quality, "runQualityGate").mockRejectedValue(
			new Error("quality execution failed"),
		);

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "Ship telemetry quality throws",
				workspaceRoot,
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow("quality execution failed");
	});

	it("fails explicitly when generated files contain duplicate paths", async () => {
		const shared = await import("../services/mcp-server/src/tools/shared.js");

		expect(() =>
			shared.sanitizeGeneratedFiles([
				{ path: "app/page.tsx", content: "first" },
				{ path: "app/page.tsx", content: "second" },
			]),
		).toThrow(/Duplicate generated file paths are not allowed/);
	});

	it("supports concurrent idempotency writes for the same key", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-concurrent-cache-");
		const { IdempotencyStore } = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 10,
			lockTimeoutMs: 60_000,
		});

		await expect(
			Promise.all(
				Array.from({ length: 8 }, (_value, index) =>
					store.set("same-key", {
						index,
					}),
				),
			),
		).resolves.toHaveLength(8);

		const cached = await store.get<{ index: number }>("same-key");
		expect(cached).toEqual({
			index: expect.any(Number),
		});
	}, 30_000);

	it("marks waitFor timeout as inflight when execution lease is still active", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-concurrent-cache-");
		const { IdempotencyStore } = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);
		const store = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 10,
			lockTimeoutMs: 60_000,
		});

		const started = await store.beginExecution<{ index: number }>(
			"lease-timeout-key",
		);
		expect(started.status).toBe("acquired");
		if (started.status !== "acquired") {
			return;
		}

		const waitResult = await store.waitFor<{ index: number }>(
			"lease-timeout-key",
			{
				timeoutMs: 20,
				intervalMs: 5,
			},
		);
		expect(waitResult).toEqual({ status: "timeout_inflight" });
		await started.lease.abandon();
	});

	it("allows a single execution leader and replays result to followers", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-concurrent-cache-");
		const { IdempotencyStore } = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);
		const leaderStore = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 10,
			lockTimeoutMs: 60_000,
		});
		const followerStore = new IdempotencyStore({
			cacheDir,
			ttlMinutes: 10,
			lockTimeoutMs: 60_000,
		});

		const leader = await leaderStore.beginExecution<{ value: string }>(
			"leader-key",
		);
		expect(leader.status).toBe("acquired");
		if (leader.status !== "acquired") {
			return;
		}

		const followerBeforeComplete = await followerStore.beginExecution<{
			value: string;
		}>("leader-key");
		expect(followerBeforeComplete).toEqual({ status: "inflight" });

		await leader.lease.complete({ value: "winner" });

		const followerWait = await followerStore.waitFor<{ value: string }>(
			"leader-key",
			{
				timeoutMs: 100,
				intervalMs: 5,
			},
		);
		expect(followerWait).toEqual({
			status: "ready",
			value: { value: "winner" },
		});
	}, 20_000);
});
