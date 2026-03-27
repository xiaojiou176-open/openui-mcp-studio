import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../services/mcp-server/src/index.js";

// Integration test: Gemini provider is mocked.
// Real end-to-end tests with live Gemini API are in tests/live-gemini-smoke.test.ts

const tempDirs: string[] = [];

async function mkTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function getTextContent(
	result: Awaited<ReturnType<Client["callTool"]>>,
): string {
	const block = result.content.find((item) => item.type === "text");
	if (!block || block.type !== "text") {
		throw new Error("Tool did not return text content");
	}
	return block.text;
}

function parseToolJson<T>(
	label: string,
	result: Awaited<ReturnType<Client["callTool"]>>,
): T {
	const text = getTextContent(result);
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`${label} returned non-JSON payload: ${text}`);
	}
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
	vi.restoreAllMocks();
	vi.resetModules();
	delete process.env.GEMINI_API_KEY;
	delete process.env.OPENUI_MCP_WORKSPACE_ROOT;
	delete process.env.OPENUI_MAX_RETRIES;
});

describe("MCP e2e pipeline", () => {
	it("runs ship workflow and writes files", async () => {
		const workspaceRoot = await mkTempDir("openui-workspace-");

		await fs.mkdir(path.join(workspaceRoot, "src/components/ui"), {
			recursive: true,
		});

		await fs.writeFile(
			path.join(workspaceRoot, "components.json"),
			JSON.stringify(
				{
					aliases: {
						ui: "@/src/components/ui",
						components: "@/components",
					},
				},
				null,
				2,
			),
		);

		await fs.writeFile(
			path.join(workspaceRoot, "tsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						baseUrl: ".",
						paths: {
							"@/*": ["./*"],
						},
					},
				},
				null,
				2,
			),
		);

		process.env.GEMINI_API_KEY = "gemini-test-key";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;
		process.env.OPENUI_MAX_RETRIES = "2";

		const geminiProvider = await import("../services/mcp-server/src/providers/gemini-provider.js");
		const completeSpy = vi
			.spyOn(geminiProvider, "completeWithGemini")
			.mockResolvedValueOnce(
				'<main class="p-6"><section class="grid gap-6">Dashboard</section></main>',
			)
			.mockResolvedValueOnce(
				JSON.stringify({
					files: [
						{
							path: "app/page.tsx",
							content:
								"import { Header } from '@/components/generated/header'\nexport default function Page(){return <main className=\"p-6\"><Header /></main>}",
						},
						{
							path: "components/generated/header.tsx",
							content:
								"import { Button } from '@/src/components/ui/button'\nexport function Header(){return <header className=\"flex\"><Button>Run</Button></header>}",
						},
					],
					notes: ["mock-convert"],
				}),
			);

		const server = createServer();
		const client = new Client({ name: "test-client", version: "0.1.0" });
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();

		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		try {
			const response = await client.callTool({
				name: "openui_ship_react_page",
				arguments: {
					prompt: "Create a dashboard page",
					runCommands: false,
					dryRun: false,
				},
			});

			const payload = JSON.parse(getTextContent(response)) as {
				apply: { written?: string[] };
				quality: { passed: boolean };
			};

			expect(completeSpy).toHaveBeenCalledTimes(2);
			expect(payload.apply.written?.length).toBeGreaterThanOrEqual(2);
			expect(payload.quality.passed).toBe(true);

			const page = await fs.readFile(
				path.join(workspaceRoot, "app/page.tsx"),
				"utf8",
			);
			expect(page).toContain("className=");
		} finally {
			await client.close();
			await server.close();
		}
	});

	it("covers detect -> quality/review -> smoke contract in one workspace loop", async () => {
		const workspaceRoot = await mkTempDir("openui-mcp-contract-");
		const appRoot = path.join(workspaceRoot, "apps", "web");

		await fs.mkdir(path.join(appRoot, "app"), { recursive: true });
		await fs.mkdir(path.join(appRoot, "components", "ui"), {
			recursive: true,
		});

		await Promise.all([
			fs.writeFile(
				path.join(appRoot, "package.json"),
				JSON.stringify(
					{
						name: "openui-web-contract",
						private: true,
						dependencies: {
							next: "15.0.0",
							react: "18.3.1",
							"react-dom": "18.3.1",
						},
					},
					null,
					2,
				),
			),
			fs.writeFile(
				path.join(appRoot, "components.json"),
				JSON.stringify(
					{
						aliases: {
							ui: "@/components/ui",
							components: "@/components",
						},
					},
					null,
					2,
				),
			),
			fs.writeFile(
				path.join(appRoot, "tsconfig.json"),
				JSON.stringify(
					{
						compilerOptions: {
							baseUrl: ".",
							paths: {
								"@/*": ["./*"],
							},
						},
					},
					null,
					2,
				),
			),
			fs.writeFile(
				path.join(appRoot, "app/page.tsx"),
				'export default function Page(){return <main className="p-6"><h1>Contract Page</h1></main>}\n',
			),
		]);

		process.env.GEMINI_API_KEY = "gemini-test-key";
		process.env.OPENUI_MCP_WORKSPACE_ROOT = workspaceRoot;

		const nextSmokeModule = await import("../services/mcp-server/src/next-smoke.js");
			const smokeSpy = vi
				.spyOn(nextSmokeModule, "runNextSmoke")
				.mockResolvedValue({
					passed: true,
					usedTargetRoot: appRoot,
				build: { ok: true, command: "next build" },
				start: { ok: true, command: "next start" },
				probe: { ok: true, url: "http://127.0.0.1:3000/" },
				logsTail: ["contract-smoke-ok"],
				durationMs: 1,
			} as never);

		const server = createServer();
		const client = new Client({ name: "test-client", version: "0.1.0" });
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();

		await Promise.all([
			server.connect(serverTransport),
			client.connect(clientTransport),
		]);

		try {
			const detectResponse = await client.callTool({
				name: "openui_detect_shadcn_paths",
				arguments: { workspaceRoot },
			});
			const detectPayload = parseToolJson<{
				source: string;
				uiDir: string;
				uiImportBase: string;
				workspaceRoot: string;
			}>("openui_detect_shadcn_paths", detectResponse);
			expect(detectPayload.workspaceRoot).toBe(
				await fs.realpath(workspaceRoot),
			);
			expect(detectPayload.source).toBe("components.json");
			expect(detectPayload.uiDir).toBe("apps/web/components/ui");
			expect(detectPayload.uiImportBase).toBe("@/components/ui");

			const qualityResponse = await client.callTool({
				name: "openui_quality_gate",
				arguments: {
					targetRoot: appRoot,
					runCommands: false,
					files: [
						{
							path: "app/page.tsx",
							content:
								"export default function Page(){return <main className='p-6'><h1>Contract Page</h1></main>}",
						},
					],
				},
			});
			const qualityPayload = parseToolJson<{
				passed: boolean;
				issues: Array<{ severity: string; rule: string }>;
			}>("openui_quality_gate", qualityResponse);
			expect(typeof qualityPayload.passed).toBe("boolean");
			expect(Array.isArray(qualityPayload.issues)).toBe(true);

			const reviewResponse = await client.callTool({
				name: "openui_review_uiux",
				arguments: {
					html: "<div><img src='a.png' /></div>",
					invokeModel: false,
					invokeHeuristics: true,
					taskFlowCritical: true,
					threshold: 70,
				},
			});
			const reviewPayload = parseToolJson<{
				status: string;
				review: { score: number; threshold: number; issues: unknown[] };
			}>("openui_review_uiux", reviewResponse);
			expect(reviewPayload.status).toBe("ok");
			expect(reviewPayload.review.threshold).toBe(70);
			expect(reviewPayload.review.score).toBeGreaterThanOrEqual(0);
			expect(reviewPayload.review.score).toBeLessThanOrEqual(100);
			expect(Array.isArray(reviewPayload.review.issues)).toBe(true);

			const smokeResponse = await client.callTool({
				name: "openui_next_smoke",
				arguments: {
					targetRoot: appRoot,
					probeTimeoutMs: 1500,
				},
			});
			const smokePayload = parseToolJson<{
				passed: boolean;
				usedTargetRoot: string;
			}>("openui_next_smoke", smokeResponse);
			expect(smokeSpy).toHaveBeenCalledWith({
				targetRoot: appRoot,
				probeTimeoutMs: 1500,
			});
			expect(smokePayload.passed).toBe(true);
			expect(smokePayload.usedTargetRoot).toBe(appRoot);
		} finally {
			await client.close();
			await server.close();
		}
	}, 30_000);
});
