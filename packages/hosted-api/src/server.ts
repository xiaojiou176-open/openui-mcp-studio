import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
	DEFAULT_OPENUI_HOSTED_API_HOST,
	DEFAULT_OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE,
	DEFAULT_OPENUI_HOSTED_API_PORT,
	MCP_SERVER_VERSION,
} from "../../../services/mcp-server/src/constants.js";
import { logError, logInfo, logWarn } from "../../../services/mcp-server/src/logger.js";
import { buildRepoWorkflowSummary } from "../../../services/mcp-server/src/repo-workflow-summary.js";
import { buildHostedApiToolRegistry } from "./tool-registry.js";
import type { HostedApiServerHandle, HostedApiServerOptions } from "./types.js";

const HOSTED_API_VERSION = "0.3.1";
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_CORS_HEADERS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, content-type",
	"access-control-allow-methods": "GET,POST,OPTIONS",
} as const;

type RateLimitBucket = {
	count: number;
	resetAt: number;
};

type HostedApiConfig = Required<
	Pick<
		HostedApiServerOptions,
		"authToken" | "workspaceRoot" | "host" | "port" | "rateLimitWindowMs" | "rateLimitMax"
	>
> &
	Pick<HostedApiServerOptions, "logger" | "publicBaseUrl">;

type HostedApiInfo = {
	service: "openui-hosted-api";
	technicalName: "OpenUI Hosted API";
	version: string;
	mcpServerVersion: string;
	runtime: "self-hosted-http";
	auth: {
		type: "bearer";
		envKey: "OPENUI_HOSTED_API_BEARER_TOKEN";
	};
	rateLimit: {
		strategy: "fixed-window-minute";
		windowMs: number;
		maxRequestsPerMinute: number;
	};
	routes: string[];
	sdk: {
		packageName: "@openui/sdk";
		importPath: "createOpenuiHostedClient";
	};
	boundaries: string[];
};

function toPositiveInteger(
	value: string | number | undefined,
	fallback: number,
	label: string,
): number {
	if (value === undefined || value === "") {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive integer.`);
	}
	return parsed;
}

export function parseHostedApiConfig(
	env: NodeJS.ProcessEnv = process.env,
): HostedApiServerOptions {
	const authToken = env.OPENUI_HOSTED_API_BEARER_TOKEN?.trim();
	if (!authToken) {
		throw new Error("OPENUI_HOSTED_API_BEARER_TOKEN must be configured.");
	}

	return {
		...parseHostedApiBaseConfig(env),
		authToken,
	};
}

export function parseHostedApiBaseConfig(
	env: NodeJS.ProcessEnv = process.env,
): Omit<HostedApiServerOptions, "authToken"> {
	return {
		workspaceRoot:
			env.OPENUI_MCP_WORKSPACE_ROOT?.trim() || process.cwd(),
		host:
			env.OPENUI_HOSTED_API_HOST?.trim() ||
			DEFAULT_OPENUI_HOSTED_API_HOST,
		port: toPositiveInteger(
			env.OPENUI_HOSTED_API_PORT,
			DEFAULT_OPENUI_HOSTED_API_PORT,
			"OPENUI_HOSTED_API_PORT",
		),
		rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
		rateLimitMax: toPositiveInteger(
			env.OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE,
			DEFAULT_OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE,
			"OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE",
		),
		publicBaseUrl: env.OPENUI_HOSTED_API_PUBLIC_BASE_URL?.trim() || null,
	};
}

function createJsonHeaders(
	requestId: string,
	extra?: Record<string, string>,
): Headers {
	const headers = new Headers(DEFAULT_CORS_HEADERS);
	Object.entries(extra ?? {}).forEach(([key, value]) => {
		headers.set(key, value);
	});
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("x-openui-request-id", requestId);
	return headers;
}

function jsonResponse(
	requestId: string,
	body: unknown,
	status = 200,
	extraHeaders?: Record<string, string>,
): Response {
	return new Response(`${JSON.stringify(body, null, 2)}\n`, {
		status,
		headers: createJsonHeaders(requestId, extraHeaders),
	});
}

function toNodeResponse(response: Response, res: http.ServerResponse): void {
	res.statusCode = response.status;
	response.headers.forEach((value, key) => {
		res.setHeader(key, value);
	});
	response
		.text()
		.then((body) => {
			res.end(body);
		})
		.catch((error: unknown) => {
			res.statusCode = 500;
			res.end(
				JSON.stringify({
					ok: false,
					error: {
						code: "response_stream_failed",
						message: error instanceof Error ? error.message : String(error),
					},
				}),
			);
		});
}

function buildInfoPayload(config: HostedApiConfig): HostedApiInfo {
	return {
		service: "openui-hosted-api",
		technicalName: "OpenUI Hosted API",
		version: HOSTED_API_VERSION,
		mcpServerVersion: MCP_SERVER_VERSION,
		runtime: "self-hosted-http",
		auth: {
			type: "bearer",
			envKey: "OPENUI_HOSTED_API_BEARER_TOKEN",
		},
		rateLimit: {
			strategy: "fixed-window-minute",
			windowMs: config.rateLimitWindowMs,
			maxRequestsPerMinute: config.rateLimitMax,
		},
		routes: [
			"/healthz",
			"/v1/info",
			"/v1/openapi",
			"/v1/frontdoor",
			"/v1/ecosystem",
			"/v1/skills/manifest",
			"/v1/workflow/summary",
			"/v1/tools",
			"/v1/tools/call",
		],
		sdk: {
			packageName: "@openui/sdk",
			importPath: "createOpenuiHostedClient",
		},
		boundaries: [
			"self-hosted runtime only",
			"primary builder entrypoint remains local stdio MCP",
			"not a managed SaaS deployment",
			"not a remote write-capable control plane",
		],
	};
}

function logEvent(
	config: HostedApiConfig,
	level: "info" | "warn" | "error",
	event: string,
	requestId: string,
	context: Record<string, unknown>,
): void {
	if (config.logger) {
		config.logger({ level, event, requestId, ...context });
		return;
	}
	const meta = {
		traceId: requestId,
		requestId,
		service: "openui-hosted-api",
		component: "hosted-api",
		stage: "runtime",
		context,
	};
	if (level === "error") {
		logError(event, meta);
		return;
	}
	if (level === "warn") {
		logWarn(event, meta);
		return;
	}
	logInfo(event, meta);
}

async function readJsonFile(
	workspaceRoot: string,
	relativePath: string,
): Promise<Record<string, unknown>> {
	const raw = await fs.readFile(path.join(workspaceRoot, relativePath), "utf8");
	return JSON.parse(raw) as Record<string, unknown>;
}

async function readRequestJson(
	request: http.IncomingMessage,
): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) {
		return {};
	}
	const raw = Buffer.concat(chunks).toString("utf8");
	const parsed = JSON.parse(raw) as unknown;
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Request body must be a JSON object.");
	}
	return parsed as Record<string, unknown>;
}

function readBearerToken(request: http.IncomingMessage): string | null {
	const header = request.headers.authorization?.trim();
	if (!header) {
		return null;
	}
	const prefix = "Bearer ";
	if (!header.startsWith(prefix)) {
		return null;
	}
	const token = header.slice(prefix.length).trim();
	return token || null;
}

function createRateLimitStore() {
	const buckets = new Map<string, RateLimitBucket>();
	return {
		consume(key: string, windowMs: number, max: number) {
			const now = Date.now();
			const current = buckets.get(key);
			if (!current || current.resetAt <= now) {
				const resetAt = now + windowMs;
				const next = { count: 1, resetAt };
				buckets.set(key, next);
				return { allowed: true, remaining: max - 1, resetAt };
			}
			if (current.count >= max) {
				return { allowed: false, remaining: 0, resetAt: current.resetAt };
			}
			current.count += 1;
			return {
				allowed: true,
				remaining: Math.max(0, max - current.count),
				resetAt: current.resetAt,
			};
		},
	};
}

function createErrorPayload(
	requestId: string,
	code: string,
	message: string,
): {
	ok: false;
	error: {
		code: string;
		message: string;
		requestId: string;
	};
} {
	return {
		ok: false,
		error: {
			code,
			message,
			requestId,
		},
	};
}

async function readHostedOpenapi(
	workspaceRoot: string,
	serverUrl: string,
): Promise<Record<string, unknown>> {
	const document = await readJsonFile(
		workspaceRoot,
		"docs/contracts/openui-hosted-api.openapi.json",
	);
	return {
		...document,
		servers: [
			{
				url: serverUrl,
				description:
					"Current self-hosted runtime address for this OpenUI Hosted API instance.",
			},
		],
	};
}

async function readFrontdoorPayload(
	workspaceRoot: string,
	siteUrl: string | null,
) {
	const payloadModuleUrl = pathToFileURL(
		path.join(
			workspaceRoot,
			"apps/web/lib/frontdoor-api-payload.ts",
		),
	).href;
	const module = (await import(payloadModuleUrl)) as {
		buildFrontdoorPayload: (input?: { siteUrl?: string | null }) => Record<
			string,
			unknown
		>;
	};
	return module.buildFrontdoorPayload({
		siteUrl,
	});
}

export function createHostedApiServer(
	input: HostedApiServerOptions,
): http.Server {
	const config: HostedApiConfig = {
		workspaceRoot: path.resolve(input.workspaceRoot),
		authToken: input.authToken.trim(),
		host: input.host ?? DEFAULT_OPENUI_HOSTED_API_HOST,
		port: input.port ?? DEFAULT_OPENUI_HOSTED_API_PORT,
		rateLimitWindowMs:
			input.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
		rateLimitMax:
			input.rateLimitMax ?? DEFAULT_OPENUI_HOSTED_API_MAX_REQUESTS_PER_MINUTE,
		publicBaseUrl: input.publicBaseUrl ?? null,
		logger: input.logger,
	};
	if (!config.authToken) {
		throw new Error("authToken is required for the hosted API server.");
	}

	const rateLimitStore = createRateLimitStore();
	const toolRegistry = buildHostedApiToolRegistry();

	return http.createServer(async (request, response) => {
		const startedAt = Date.now();
		const requestId = randomUUID();
		const method = request.method?.toUpperCase() ?? "GET";
		const localPort = response.socket?.localPort ?? config.port;
		const runtimeBaseUrl =
			config.publicBaseUrl ?? `http://${config.host}:${localPort}`;
		const url = new URL(request.url ?? "/", runtimeBaseUrl);
		const pathname = url.pathname;
		const authRequired = ![
			"/healthz",
			"/v1/info",
			"/v1/openapi",
			"/v1/frontdoor",
			"/v1/ecosystem",
			"/v1/skills/manifest",
		].includes(pathname);

		const finish = (statusCode: number, extra?: Record<string, unknown>) => {
			logEvent(config, "info", "hosted_api_request", requestId, {
				method,
				pathname,
				statusCode,
				durationMs: Date.now() - startedAt,
				...(extra ?? {}),
			});
		};

		try {
			if (request.method === "OPTIONS") {
				response.writeHead(204, {
					...DEFAULT_CORS_HEADERS,
					"x-openui-request-id": requestId,
				});
				response.end();
				finish(204);
				return;
			}

			if (authRequired) {
				const token = readBearerToken(request);
				if (token !== config.authToken) {
					toNodeResponse(
						jsonResponse(
							requestId,
							createErrorPayload(
								requestId,
								"unauthorized",
								"Missing or invalid bearer token.",
							),
							401,
						),
						response,
					);
					finish(401, { auth: "failed" });
					return;
				}
				const rate = rateLimitStore.consume(
					token,
					config.rateLimitWindowMs,
					config.rateLimitMax,
				);
				if (!rate.allowed) {
					toNodeResponse(
						jsonResponse(
							requestId,
							createErrorPayload(
								requestId,
								"rate_limited",
								"Hosted API rate limit exceeded.",
							),
							429,
							{
								"x-ratelimit-limit": String(config.rateLimitMax),
								"x-ratelimit-remaining": "0",
								"x-ratelimit-reset": String(rate.resetAt),
							},
						),
						response,
					);
					logEvent(config, "warn", "hosted_api_rate_limited", requestId, {
						pathname,
						rateLimitMax: config.rateLimitMax,
					});
					finish(429, { auth: "passed", rateLimited: true });
					return;
				}
				response.setHeader("x-ratelimit-limit", String(config.rateLimitMax));
				response.setHeader(
					"x-ratelimit-remaining",
					String(rate.remaining),
				);
				response.setHeader("x-ratelimit-reset", String(rate.resetAt));
			}

			if (method === "GET" && pathname === "/healthz") {
				toNodeResponse(
					jsonResponse(requestId, {
						ok: true,
						requestId,
						data: {
							service: "openui-hosted-api",
							version: HOSTED_API_VERSION,
							authMode: "bearer",
							rateLimit: {
								windowMs: config.rateLimitWindowMs,
								max: config.rateLimitMax,
							},
						},
					}),
					response,
				);
				finish(200, { public: true });
				return;
			}

			if (method === "GET" && pathname === "/v1/info") {
				toNodeResponse(
					jsonResponse(requestId, {
						ok: true,
						requestId,
						data: buildInfoPayload(config),
					}),
					response,
				);
				finish(200, { public: true });
				return;
			}

			if (method === "GET" && pathname === "/v1/openapi") {
				const document = await readHostedOpenapi(
					config.workspaceRoot,
					runtimeBaseUrl,
				);
				toNodeResponse(jsonResponse(requestId, document), response);
				finish(200, { public: true });
				return;
			}

			if (method === "GET" && pathname === "/v1/frontdoor") {
				const frontdoorPayload = await readFrontdoorPayload(
					config.workspaceRoot,
					config.publicBaseUrl ?? null,
				);
				toNodeResponse(
					jsonResponse(requestId, frontdoorPayload),
					response,
				);
				finish(200, { public: true });
				return;
			}

			if (method === "GET" && pathname === "/v1/ecosystem") {
				const ecosystem = await readJsonFile(
					config.workspaceRoot,
					"docs/contracts/openui-ecosystem-productization.json",
				);
				toNodeResponse(jsonResponse(requestId, ecosystem), response);
				finish(200, { public: true });
				return;
			}

			if (method === "GET" && pathname === "/v1/skills/manifest") {
				const manifest = await readJsonFile(
					config.workspaceRoot,
					"packages/skills-kit/manifest.json",
				);
				toNodeResponse(jsonResponse(requestId, manifest), response);
				finish(200, { public: true });
				return;
			}

			if (method === "POST" && pathname === "/v1/workflow/summary") {
				const body = await readRequestJson(request);
				const failedRunsLimit =
					typeof body.failedRunsLimit === "number"
						? body.failedRunsLimit
						: undefined;
				const workspaceRoot =
					typeof body.workspaceRoot === "string" &&
					body.workspaceRoot.trim() !== ""
						? body.workspaceRoot.trim()
						: config.workspaceRoot;
				const workflowSummary = await buildRepoWorkflowSummary({
					workspaceRoot,
					failedRunsLimit,
				});
				toNodeResponse(
					jsonResponse(requestId, {
						ok: true,
						requestId,
						data: workflowSummary,
					}),
					response,
				);
				finish(200, { auth: "passed" });
				return;
			}

			if (method === "GET" && pathname === "/v1/tools") {
				toNodeResponse(
					jsonResponse(requestId, {
						ok: true,
						requestId,
						data: {
							transport: "self-hosted-http",
							primaryBuilderSurface: "local-stdio-mcp",
							tools: toolRegistry.listTools(),
						},
					}),
					response,
				);
				finish(200, { auth: "passed" });
				return;
			}

			if (method === "POST" && pathname === "/v1/tools/call") {
				const body = await readRequestJson(request);
				if (typeof body.name !== "string" || !body.name.trim()) {
					toNodeResponse(
						jsonResponse(
							requestId,
							createErrorPayload(
								requestId,
								"invalid_request",
								"Field `name` must be a non-empty string.",
							),
							400,
						),
						response,
					);
					finish(400, { auth: "passed" });
					return;
				}
				const args =
					body.arguments &&
					typeof body.arguments === "object" &&
					!Array.isArray(body.arguments)
						? (body.arguments as Record<string, unknown>)
						: {};
				const result = await toolRegistry.callTool(body.name, args);
				toNodeResponse(
					jsonResponse(requestId, {
						ok: true,
						requestId,
						data: result,
					}),
					response,
				);
				finish(200, { auth: "passed", tool: body.name });
				return;
			}

			toNodeResponse(
				jsonResponse(
					requestId,
					createErrorPayload(
						requestId,
						"not_found",
						`No hosted API route for ${method} ${pathname}.`,
					),
					404,
				),
				response,
			);
			finish(404);
		} catch (error) {
			logEvent(config, "error", "hosted_api_failure", requestId, {
				pathname,
				error: error instanceof Error ? error.message : String(error),
			});
			toNodeResponse(
				jsonResponse(
					requestId,
					createErrorPayload(
						requestId,
						"internal_error",
						error instanceof Error ? error.message : String(error),
					),
					500,
				),
				response,
			);
			finish(500);
		}
	});
}

export async function startHostedApiServer(
	options: HostedApiServerOptions,
): Promise<HostedApiServerHandle> {
	const server = createHostedApiServer(options);
	const host = options.host ?? DEFAULT_OPENUI_HOSTED_API_HOST;
	const requestedPort = options.port ?? DEFAULT_OPENUI_HOSTED_API_PORT;
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(requestedPort, host, () => resolve());
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Hosted API server did not expose a TCP address.");
	}
	return {
		server,
		port: address.port,
		url: `http://${host}:${address.port}`,
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		},
	};
}

export { HOSTED_API_VERSION };
