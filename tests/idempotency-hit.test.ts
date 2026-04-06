import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

type TextResult = {
	content: Array<{ type: string; text?: string }>;
};

type ToolHandler = (args: Record<string, unknown>) => Promise<TextResult>;

type ShipOutput = {
	apply: {
		written: string[];
		rolledBack: boolean;
	};
	summary: {
		filesCount: number;
		changedPaths: string[];
		qualityGate: boolean;
		status: "success" | "quality_failed";
		idempotencyHit: boolean;
	};
};

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

function hashIdempotencyKey(idempotencyKey: string): string {
	return crypto.createHash("sha256").update(idempotencyKey).digest("hex");
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	delete process.env.OPENUI_MCP_CACHE_DIR;
	delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	delete process.env.OPENUI_IDEMPOTENCY_TTL_MINUTES;
	delete process.env.OPENUI_QUEUE_CONCURRENCY;
	vi.restoreAllMocks();
	vi.resetModules();
});

describe("ship idempotency", () => {
	it("returns cached output on idempotency hit", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-cache-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
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

		const resolveSpy = vi
			.spyOn(shared, "resolveShadcnStyleGuide")
			.mockResolvedValue({
				detection,
				uiImportBase: detection.uiImportBase,
				styleGuide: "Use cards",
			});
		const htmlSpy = vi
			.spyOn(shared, "requestHtmlFromPrompt")
			.mockResolvedValue("<main>cached</main>");
		const convertSpy = vi
			.spyOn(shared, "convertHtmlToReactShadcn")
			.mockResolvedValue({
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
		const applySpy = vi
			.spyOn(fileOps, "applyGeneratedFiles")
			.mockResolvedValue({
				targetRoot: "/tmp/openui-workspace",
				dryRun: false,
				rollbackOnError: true,
				plan: [{ path: "app/page.tsx", status: "create" as const }],
				written: ["app/page.tsx"],
				rolledBack: false,
			});
		const qualitySpy = vi.spyOn(quality, "runQualityGate").mockResolvedValue({
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

		const first = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship once",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "stable-key",
			dryRun: false,
			runCommands: false,
		});
		const second = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship once",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "stable-key",
			dryRun: false,
			runCommands: false,
		});

		const firstPayload = JSON.parse(readText(first)) as ShipOutput;
		const secondPayload = JSON.parse(readText(second)) as ShipOutput;

		expect(firstPayload.summary.idempotencyHit).toBe(false);
		expect(secondPayload.summary.idempotencyHit).toBe(true);
		expect(firstPayload.summary.status).toBe("success");
		expect(firstPayload.summary.qualityGate).toBe(true);
		expect(firstPayload.summary.filesCount).toBe(1);
		expect(firstPayload.summary.changedPaths).toEqual(["app/page.tsx"]);
		expect(secondPayload.summary.changedPaths).toEqual(["app/page.tsx"]);
		expect(secondPayload.apply.rolledBack).toBe(false);
		expect(secondPayload.apply.written).toEqual(["app/page.tsx"]);
		expect(resolveSpy).toHaveBeenCalledTimes(1);
		expect(htmlSpy).toHaveBeenCalledTimes(1);
		expect(convertSpy).toHaveBeenCalledTimes(1);
		expect(applySpy).toHaveBeenCalledTimes(1);
		expect(qualitySpy).toHaveBeenCalledTimes(1);
	}, 30_000);

	it("uses implicit idempotency key when no explicit key is provided", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-cache-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
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
		const htmlSpy = vi
			.spyOn(shared, "requestHtmlFromPrompt")
			.mockResolvedValue("<main>nocache</main>");
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

		const first = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship no idempotency",
			workspaceRoot: "/tmp/openui-workspace",
			dryRun: false,
			runCommands: false,
		});
		const second = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship no idempotency",
			workspaceRoot: "/tmp/openui-workspace",
			dryRun: false,
			runCommands: false,
		});

		const firstPayload = JSON.parse(readText(first)) as ShipOutput;
		const secondPayload = JSON.parse(readText(second)) as ShipOutput;

		expect(firstPayload.summary.idempotencyHit).toBe(false);
		expect(secondPayload.summary.idempotencyHit).toBe(true);
		expect(firstPayload.summary.status).toBe("success");
		expect(secondPayload.summary.qualityGate).toBe(true);
		expect(secondPayload.summary.changedPaths).toEqual(["app/page.tsx"]);
		expect(secondPayload.apply.written).toEqual(["app/page.tsx"]);
		expect(htmlSpy).toHaveBeenCalledTimes(1);
	}, 30_000);

	it("deduplicates concurrent requests with the same idempotency key", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-cache-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();
		process.env.OPENUI_QUEUE_CONCURRENCY = "4";

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

		let releaseHtml: (() => void) | undefined;
		const htmlGate = new Promise<void>((resolve) => {
			releaseHtml = resolve;
		});
		const htmlSpy = vi
			.spyOn(shared, "requestHtmlFromPrompt")
			.mockImplementation(async () => {
				await htmlGate;
				return "<main>concurrent-single-flight</main>";
			});
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

		const firstRun = harness.getHandler("openui_ship_react_page")({
			prompt: "Ship concurrently",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "concurrent-key",
			dryRun: false,
			runCommands: false,
		});
		const secondRun = harness.getHandler("openui_ship_react_page")({
			prompt: "Ship concurrently",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "concurrent-key",
			dryRun: false,
			runCommands: false,
		});

		await vi.waitFor(() => {
			expect(htmlSpy).toHaveBeenCalledTimes(1);
		});
		releaseHtml?.();

		const [first, second] = await Promise.all([firstRun, secondRun]);
		const firstPayload = JSON.parse(readText(first)) as ShipOutput;
		const secondPayload = JSON.parse(readText(second)) as ShipOutput;

		const hitStates = [
			firstPayload.summary.idempotencyHit,
			secondPayload.summary.idempotencyHit,
		].sort((left, right) => Number(left) - Number(right));
		expect(hitStates).toEqual([false, true]);
		expect(htmlSpy).toHaveBeenCalledTimes(1);
	}, 60_000);

	it("keeps singleflight occupied after caller safety-timeout until leader settles", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-cache-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();
		process.env.OPENUI_QUEUE_CONCURRENCY = "4";

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const fileOps = await import("../services/mcp-server/src/file-ops.js");
		const quality = await import("../services/mcp-server/src/quality-gate.js");
		const idempotency = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);

		const detection = {
			workspaceRoot: "/tmp/openui-workspace",
			source: "default" as const,
			uiImportBase: "@/components/ui",
			uiDir: "components/ui",
			componentsImportBase: "@/components",
			componentsDir: "components",
			evidence: ["fixture"],
		};

		const resolveStyleGuideSpy = vi
			.spyOn(shared, "resolveShadcnStyleGuide")
			.mockResolvedValue({
				detection,
				uiImportBase: detection.uiImportBase,
				styleGuide: "Use cards",
			});

		let releaseHtml: (() => void) | undefined;
		const htmlGate = new Promise<void>((resolve) => {
			releaseHtml = resolve;
		});
		const htmlSpy = vi
			.spyOn(shared, "requestHtmlFromPrompt")
			.mockImplementation(async () => {
				await htmlGate;
				return "<main>singleflight-timeout</main>";
			});

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

		const beginExecutionSpy = vi
			.spyOn(idempotency.shipIdempotencyStore, "beginExecution")
			.mockResolvedValue({
				status: "acquired",
				lease: {
					ownerId: "test-owner",
					leaseMs: 30_000,
					heartbeatMs: 1_000,
					startHeartbeat: () => () => undefined,
					complete: async () => undefined,
					abandon: async () => undefined,
				},
			});

		const nativeSetTimeout: typeof globalThis.setTimeout =
			globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			...args: Parameters<typeof setTimeout>
		) => {
			const [handler, timeout, ...rest] = args;
			const shouldAccelerate =
				typeof handler === "function" &&
				handler.toString().includes("Ship pipeline safety timeout");
			const adjustedTimeout = shouldAccelerate ? 250 : timeout;
			return nativeSetTimeout(handler, adjustedTimeout, ...rest);
		}) as typeof setTimeout);

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const firstRun = harness.getHandler("openui_ship_react_page")({
			prompt: "Ship timeout then reenter",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "timeout-reentry-key",
			dryRun: false,
			runCommands: false,
		});

		await vi.waitFor(() => {
			expect(htmlSpy).toHaveBeenCalledTimes(1);
		});

		await expect(firstRun).rejects.toThrow(/timeout/i);

		const secondRun = harness.getHandler("openui_ship_react_page")({
			prompt: "Ship timeout then reenter",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: "timeout-reentry-key",
			dryRun: false,
			runCommands: false,
		});

		await vi.waitFor(() => {
			expect(resolveStyleGuideSpy).toHaveBeenCalledTimes(2);
		});

		releaseHtml?.();
		const secondPayload = JSON.parse(readText(await secondRun)) as ShipOutput;
		expect(secondPayload.summary.idempotencyHit).toBe(true);
		expect(htmlSpy).toHaveBeenCalledTimes(1);
		expect(beginExecutionSpy).toHaveBeenCalledTimes(1);
	});

	it("fails with explicit timeout status instead of local fallback when idempotency wait expires", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-cache-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();

		const shared = await import("../services/mcp-server/src/tools/shared.js");
		const idempotency = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);

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
		const htmlSpy = vi.spyOn(shared, "requestHtmlFromPrompt");

		vi.spyOn(
			idempotency.shipIdempotencyStore,
			"beginExecution",
		).mockResolvedValue({
			status: "inflight",
		});
		const waitForSpy = vi
			.spyOn(idempotency.shipIdempotencyStore, "waitFor")
			.mockResolvedValue({
				status: "timeout_inflight",
			});

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		await expect(
			harness.getHandler("openui_ship_react_page")({
				prompt: "Ship timeout should fail loudly",
				workspaceRoot: "/tmp/openui-workspace",
				idempotencyKey: "timeout-key",
				dryRun: false,
				runCommands: false,
			}),
		).rejects.toThrow(/status=timeout_inflight/);

		expect(htmlSpy).not.toHaveBeenCalled();
		expect(waitForSpy).toHaveBeenCalledWith("timeout-key", {
			timeoutMs: 300_000,
		});
	});

	it("ignores expired idempotency records and clears stale lock files", async () => {
		const cacheDir = await mkTempDir("openui-idempotency-cache-");
		process.env.OPENUI_MCP_CACHE_DIR = cacheDir;
		process.env.OPENUI_MCP_WORKSPACE_ROOT = os.tmpdir();
		process.env.OPENUI_IDEMPOTENCY_TTL_MINUTES = "30";

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
		const htmlSpy = vi
			.spyOn(shared, "requestHtmlFromPrompt")
			.mockResolvedValue("<main>fresh-after-expire-and-lock-cleanup</main>");
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
		const idempotency = await import(
			"../packages/shared-runtime/src/idempotency-store.js"
		);
		(
			idempotency.shipIdempotencyStore as unknown as {
				lockTimeoutMs: number;
			}
		).lockTimeoutMs = 250;

		const staleKey = "stale-key";
		const staleHash = hashIdempotencyKey(staleKey);
		const staleRecordPath = path.join(
			cacheDir,
			`openui-ship-${staleHash}.json`,
		);
		const staleLockPath = path.join(cacheDir, `openui-ship-${staleHash}.lock`);
		const now = Date.now();

		await fs.mkdir(cacheDir, { recursive: true });
		await fs.writeFile(
			staleRecordPath,
			JSON.stringify({
				expiresAtMs: now - 60_000,
				value: {
					quality: { passed: true },
					files: [{ path: "app/page.tsx", content: "stale" }],
					apply: { written: ["app/page.tsx"], rolledBack: false },
				},
			}),
			"utf8",
		);
		await fs.writeFile(staleLockPath, "stale-lock", "utf8");
		const staleTime = new Date(now - 60_000);
		await fs.utimes(staleLockPath, staleTime, staleTime);

		const { registerShipTool } = await import(
			"../services/mcp-server/src/tools/ship.js"
		);
		const harness = createToolHarness();
		registerShipTool(harness.server);

		const result = await harness.getHandler("openui_ship_react_page")({
			prompt: "Ship after stale artifacts",
			workspaceRoot: "/tmp/openui-workspace",
			idempotencyKey: staleKey,
			dryRun: false,
			runCommands: false,
		});

		const payload = JSON.parse(readText(result)) as ShipOutput;
		expect(payload.summary.status).toBe("success");
		expect(payload.summary.idempotencyHit).toBe(false);
		expect(payload.summary.changedPaths).toEqual(["app/page.tsx"]);
		expect(payload.apply.rolledBack).toBe(false);
		expect(htmlSpy).toHaveBeenCalledTimes(1);
		await expect(fs.access(staleLockPath)).rejects.toThrow();
	}, 90_000);
});
