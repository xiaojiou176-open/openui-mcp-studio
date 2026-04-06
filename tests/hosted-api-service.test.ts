import { afterEach, describe, expect, it } from "vitest";

import {
	parseHostedApiBaseConfig,
	parseHostedApiConfig,
	startHostedApiServer,
} from "../packages/hosted-api/src/index.js";

type RunningService = Awaited<ReturnType<typeof startHostedApiServer>>;

const runningServices: RunningService[] = [];

afterEach(
	async () => {
		await Promise.all(
			runningServices.splice(0).map((service) => service.close()),
		);
	},
	20_000,
);

describe("hosted compatibility service", () => {
	it("parses hosted service env configuration", () => {
		expect(
			parseHostedApiConfig({
				OPENUI_HOSTED_API_BEARER_TOKEN: "token",
				OPENUI_HOSTED_API_PORT: "8788",
				OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE: "12",
			}),
		).toEqual(
			expect.objectContaining({
				authToken: "token",
				port: 8788,
				rateLimitMax: 12,
			}),
		);
	});

	it("parses read-only hosted CLI configuration without a bearer token", () => {
		expect(
			parseHostedApiBaseConfig({
				OPENUI_HOSTED_API_PORT: "8788",
				OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE: "12",
			}),
		).toEqual(
			expect.objectContaining({
				port: 8788,
				rateLimitMax: 12,
				host: "127.0.0.1",
			}),
		);
	});

	it(
		"serves public discovery plus auth-protected workflow and tool routes",
		async () => {
			const service = await startHostedApiServer({
				workspaceRoot: process.cwd(),
				host: "127.0.0.1",
				port: 0,
				authToken: "secret-token",
				rateLimitMax: 5,
				logger: () => {},
			});
			runningServices.push(service);

			const health = await fetch(`${service.url}/healthz`);
			expect(health.status).toBe(200);
			expect(health.headers.get("access-control-allow-origin")).toBe("*");
			expect(await health.json()).toEqual(
				expect.objectContaining({
					ok: true,
					data: expect.objectContaining({
						service: "openui-hosted-api",
					}),
				}),
			);

			const info = await fetch(`${service.url}/v1/info`);
			expect(info.status).toBe(200);
			expect(await info.json()).toEqual(
				expect.objectContaining({
					ok: true,
					data: expect.objectContaining({
						technicalName: "OpenUI Hosted API",
					}),
				}),
			);

			const frontdoor = await fetch(`${service.url}/v1/frontdoor`);
			expect(frontdoor.status).toBe(200);
			expect(await frontdoor.json()).toEqual(
				expect.objectContaining({
					product: expect.objectContaining({
						technicalName: "OpenUI MCP Studio",
					}),
				}),
			);

			const unauthorized = await fetch(`${service.url}/v1/tools`);
			expect(unauthorized.status).toBe(401);

			const listResponse = await fetch(`${service.url}/v1/tools`, {
				headers: {
					authorization: "Bearer secret-token",
				},
			});
			expect(listResponse.status).toBe(200);
			expect(listResponse.headers.get("access-control-allow-origin")).toBe("*");
			const listPayload = await listResponse.json();
			expect(listPayload).toEqual(
				expect.objectContaining({
					ok: true,
					data: expect.objectContaining({
						tools: expect.arrayContaining([
							expect.objectContaining({ name: "openui_detect_shadcn_paths" }),
						]),
					}),
				}),
			);

			const callResponse = await fetch(`${service.url}/v1/tools/call`, {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					name: "openui_detect_shadcn_paths",
				}),
			});
			expect(callResponse.status).toBe(200);
			const callPayload = await callResponse.json();
			expect(callPayload).toEqual(
				expect.objectContaining({
					ok: true,
					data: expect.objectContaining({
						content: expect.any(Array),
					}),
				}),
			);

			const workflowResponse = await fetch(`${service.url}/v1/workflow/summary`, {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					workspaceRoot: process.cwd(),
					failedRunsLimit: 1,
				}),
			});
			expect(workflowResponse.status).toBe(200);
			expect(await workflowResponse.json()).toEqual(
				expect.objectContaining({
					ok: true,
					data: expect.objectContaining({
						github: expect.any(Object),
					}),
				}),
			);
		},
		20_000,
	);
});
