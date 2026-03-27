import fs from "node:fs/promises";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

export async function findOpenPort(host = "127.0.0.1"): Promise<number> {
	const server = net.createServer();
	return await new Promise<number>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, host, () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to allocate local port."));
				return;
			}

			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

export async function waitForHttpReady(
	url: string,
	timeoutMs: number,
	input: {
		requestTimeoutMs?: number;
		pollIntervalMs?: number;
	} = {},
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	const requestTimeoutMs = input.requestTimeoutMs ?? 1_000;
	const pollIntervalMs = input.pollIntervalMs ?? 200;
	let lastError: string | undefined;

	while (true) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(requestTimeoutMs),
			});
			if (response.ok) {
				return;
			}
			lastError = `HTTP ${response.status}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) {
			break;
		}

		await delay(Math.min(pollIntervalMs, remainingMs));
	}

	throw new Error(
		`Server did not become ready in ${timeoutMs}ms (${lastError ?? "unknown"}).`,
	);
}
