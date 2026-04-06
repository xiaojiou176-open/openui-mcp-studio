import { describe, expect, it } from "vitest";

import {
	createOpenuiHostedClient,
	OPENUI_SDK_MANIFEST,
	OpenuiHostedApiError,
} from "../packages/sdk/index.mjs";

describe("@openui/sdk", () => {
	it("exposes a hosted-client SDK manifest", () => {
		expect(OPENUI_SDK_MANIFEST.packageName).toBe("@openui/sdk");
		expect(OPENUI_SDK_MANIFEST.role).toContain("self-hosted OpenUI Hosted API");
		expect(OPENUI_SDK_MANIFEST.nonGoals).toContain(
			"plugin marketplace packaging",
		);
	});

	it("calls hosted discovery, workflow, and tool endpoints through fetch", async () => {
		const seenPaths: string[] = [];
		const protectedAuthHeaders: Array<string | undefined> = [];
		const client = createOpenuiHostedClient({
			baseUrl: "http://127.0.0.1:8787",
			token: "test-token",
			fetchImplementation: async (input, init) => {
				const url = typeof input === "string" ? input : input.toString();
				seenPaths.push(url);
				const authHeader =
					init?.headers instanceof Headers
						? (init.headers.get("authorization") ?? undefined)
						: init?.headers && typeof init.headers === "object"
							? (init.headers as Record<string, string>).authorization
							: undefined;

				if (
					!url.endsWith("/healthz") &&
					!url.endsWith("/v1/info") &&
					!url.endsWith("/v1/frontdoor") &&
					!url.endsWith("/v1/ecosystem") &&
					!url.endsWith("/v1/skills/manifest") &&
					!url.endsWith("/v1/openapi")
				) {
					protectedAuthHeaders.push(authHeader);
				}

				if (url.endsWith("/healthz")) {
					return new Response(
						JSON.stringify({
							ok: true,
							data: { service: "openui-hosted-api" },
						}),
						{ status: 200 },
					);
				}

				if (url.endsWith("/v1/info")) {
					return new Response(
						JSON.stringify({
							ok: true,
							data: { service: "openui-hosted-api" },
						}),
						{ status: 200 },
					);
				}

				if (url.endsWith("/v1/frontdoor")) {
					return new Response(
						JSON.stringify({ product: { technicalName: "OpenUI MCP Studio" } }),
						{ status: 200 },
					);
				}

				if (url.endsWith("/v1/ecosystem")) {
					return new Response(JSON.stringify({ summary: "ecosystem" }), {
						status: 200,
					});
				}

				if (url.endsWith("/v1/skills/manifest")) {
					return new Response(
						JSON.stringify({ packageName: "@openui/skills-kit" }),
						{ status: 200 },
					);
				}

				if (url.endsWith("/v1/openapi")) {
					return new Response(JSON.stringify({ openapi: "3.1.0" }), {
						status: 200,
					});
				}

				if (url.endsWith("/v1/workflow/summary")) {
					return new Response(
						JSON.stringify({ ok: true, data: { github: { connected: true } } }),
						{ status: 200 },
					);
				}

				if (url.endsWith("/v1/tools")) {
					return new Response(
						JSON.stringify({
							ok: true,
							data: { tools: [{ name: "openui_ship_react_page" }] },
						}),
						{ status: 200 },
					);
				}

				return new Response(
					JSON.stringify({
						ok: true,
						data: { content: [{ type: "text", text: '{"ok":true}' }] },
					}),
					{ status: 200 },
				);
			},
		});

		await expect(client.health()).resolves.toEqual(
			expect.objectContaining({
				ok: true,
			}),
		);
		await expect(client.getInfo()).resolves.toEqual(
			expect.objectContaining({
				ok: true,
			}),
		);
		await expect(client.frontdoor()).resolves.toEqual(
			expect.objectContaining({
				product: expect.objectContaining({
					technicalName: "OpenUI MCP Studio",
				}),
			}),
		);
		await expect(client.ecosystem()).resolves.toEqual(
			expect.objectContaining({
				summary: "ecosystem",
			}),
		);
		await expect(client.skillsManifest()).resolves.toEqual(
			expect.objectContaining({
				packageName: "@openui/skills-kit",
			}),
		);
		await expect(client.openapi()).resolves.toEqual(
			expect.objectContaining({
				openapi: "3.1.0",
			}),
		);
		await expect(
			client.workflowSummary({ failedRunsLimit: 1 }),
		).resolves.toEqual(
			expect.objectContaining({
				ok: true,
			}),
		);
		await expect(client.listTools()).resolves.toEqual(
			expect.objectContaining({
				ok: true,
			}),
		);
		await expect(
			client.callTool("openui_ship_react_page", {
				prompt: "demo",
				dryRun: true,
			}),
		).resolves.toEqual(
			expect.objectContaining({
				ok: true,
			}),
		);
		expect(protectedAuthHeaders).toEqual([
			"Bearer test-token",
			"Bearer test-token",
			"Bearer test-token",
		]);
		expect(seenPaths).toEqual(
			expect.arrayContaining([
				"http://127.0.0.1:8787/healthz",
				"http://127.0.0.1:8787/v1/info",
				"http://127.0.0.1:8787/v1/frontdoor",
				"http://127.0.0.1:8787/v1/ecosystem",
				"http://127.0.0.1:8787/v1/skills/manifest",
				"http://127.0.0.1:8787/v1/openapi",
				"http://127.0.0.1:8787/v1/workflow/summary",
				"http://127.0.0.1:8787/v1/tools",
				"http://127.0.0.1:8787/v1/tools/call",
			]),
		);
	});

	it("throws a structured error when the hosted API rejects the request", async () => {
		const client = createOpenuiHostedClient({
			baseUrl: "http://127.0.0.1:8787",
			token: "test-token",
			fetchImplementation: async () =>
				new Response(
					JSON.stringify({
						ok: false,
						error: {
							code: "unauthorized",
							message: "Missing or invalid bearer token.",
							requestId: "req-1",
						},
					}),
					{ status: 401 },
				),
		});

		await expect(client.listTools()).rejects.toBeInstanceOf(
			OpenuiHostedApiError,
		);
	});
});
