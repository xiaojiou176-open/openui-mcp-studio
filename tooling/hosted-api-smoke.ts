import { randomUUID } from "node:crypto";

import { startHostedApiServer } from "../packages/hosted-api/src/index.js";

async function main() {
	const token = `smoke-${randomUUID()}`;
	const handle = await startHostedApiServer({
		workspaceRoot: process.cwd(),
		authToken: token,
		port: 0,
	});

	try {
		const baseUrl = `http://127.0.0.1:${handle.port}`;
		const health = await fetch(`${baseUrl}/healthz`).then((response) =>
			response.json(),
		);
		const info = await fetch(`${baseUrl}/v1/info`).then((response) =>
			response.json(),
		);
		const frontdoor = await fetch(`${baseUrl}/v1/frontdoor`).then((response) =>
			response.json(),
		);
		const ecosystem = await fetch(`${baseUrl}/v1/ecosystem`).then((response) =>
			response.json(),
		);
		const workflowSummary = await fetch(`${baseUrl}/v1/workflow/summary`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				workspaceRoot: process.cwd(),
				failedRunsLimit: 1,
			}),
		}).then((response) => response.json());

		console.log(
			JSON.stringify(
				{
					ok: true,
					baseUrl,
					health,
					serviceInfo: info.data?.technicalName,
					frontdoorProduct: frontdoor.product?.technicalName,
					ecosystemSummary: ecosystem.summary,
					workflowConnected: workflowSummary.data?.github?.connected ?? null,
				},
				null,
				2,
			),
		);
	} finally {
		await handle.close();
	}
}

void main();
