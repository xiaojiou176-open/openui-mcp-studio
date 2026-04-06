const DEFAULT_TIMEOUT_MS = 45_000;

export const OPENUI_SDK_MANIFEST = {
	packageName: "@openui/sdk",
	version: "0.3.1",
	summary: "Public SDK for the self-hosted OpenUI Hosted API surface.",
	audience:
		"developers integrating with OpenUI over the self-hosted HTTP service instead of the local stdio MCP runtime",
	role:
		"thin client for the self-hosted OpenUI Hosted API with discovery, workflow summary, tool discovery, and authenticated tool execution",
	nonGoals: [
		"direct MCP runtime replacement",
		"plugin marketplace packaging",
		"managed hosted SaaS claims",
	],
};

export class OpenuiHostedApiError extends Error {
	constructor(message, details = {}) {
		super(message);
		this.name = "OpenuiHostedApiError";
		this.status = details.status ?? null;
		this.code = details.code ?? null;
		this.requestId = details.requestId ?? null;
		this.body = details.body ?? null;
	}
}

function normalizeBaseUrl(baseUrl) {
	const value = String(baseUrl ?? "").trim();
	if (!value) {
		throw new Error("baseUrl is required.");
	}
	let normalized = value;
	while (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

function withTimeout(fetchImplementation, timeoutMs, request) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	return fetchImplementation(request.url, {
		...request.init,
		signal: controller.signal,
	}).finally(() => clearTimeout(timer));
}

async function parseJsonResponse(response) {
	const text = await response.text();
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export class OpenuiHostedClient {
	constructor(options) {
		this.baseUrl = normalizeBaseUrl(options.baseUrl);
		this.token = String(options.token ?? "").trim() || null;
		this.timeoutMs =
			Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
				? options.timeoutMs
				: DEFAULT_TIMEOUT_MS;
		this.fetchImplementation =
			options.fetchImplementation ?? globalThis.fetch?.bind(globalThis);

		if (!this.fetchImplementation) {
			throw new Error("A fetch implementation is required.");
		}
	}

	async request(path, init = {}, { auth = true } = {}) {
		const headers = new Headers(init.headers ?? {});
		if (!headers.has("content-type") && init.body) {
			headers.set("content-type", "application/json");
		}
		if (auth && this.token) {
			headers.set("authorization", `Bearer ${this.token}`);
		}

		const response = await withTimeout(this.fetchImplementation, this.timeoutMs, {
			url: `${this.baseUrl}${path}`,
			init: {
				...init,
				headers,
			},
		});

		const payload = await parseJsonResponse(response);
		if (!response.ok) {
			const errorPayload =
				payload && typeof payload === "object" && payload.error
					? payload.error
					: {};
			throw new OpenuiHostedApiError(
				errorPayload.message ??
					`OpenUI Hosted API request failed with ${response.status}.`,
				{
					status: response.status,
					code: errorPayload.code ?? null,
					requestId:
						errorPayload.requestId ??
						response.headers.get("x-openui-request-id"),
					body: payload,
				},
			);
		}

		return payload;
	}

	health() {
		return this.request("/healthz", { method: "GET" }, { auth: false });
	}

	getInfo() {
		return this.request("/v1/info", { method: "GET" }, { auth: false });
	}

	frontdoor() {
		return this.request("/v1/frontdoor", { method: "GET" }, { auth: false });
	}

	ecosystem() {
		return this.request("/v1/ecosystem", { method: "GET" }, { auth: false });
	}

	skillsManifest() {
		return this.request("/v1/skills/manifest", { method: "GET" }, { auth: false });
	}

	openapi() {
		return this.request("/v1/openapi", { method: "GET" }, { auth: false });
	}

	workflowSummary(args = {}) {
		return this.request("/v1/workflow/summary", {
			method: "POST",
			body: JSON.stringify(args),
		});
	}

	listTools() {
		return this.request("/v1/tools", { method: "GET" });
	}

	callTool(name, args = {}) {
		return this.request("/v1/tools/call", {
			method: "POST",
			body: JSON.stringify({
				name,
				arguments: args,
			}),
		});
	}
}

export function createOpenuiHostedClient(options) {
	return new OpenuiHostedClient(options);
}
