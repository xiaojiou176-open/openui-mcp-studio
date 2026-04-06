import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { startHostedApiServer } from "../packages/hosted-api/src/index.js";

const execFileAsync = promisify(execFile);

async function main() {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), "openui-sdk-proof-"));
	const token = `sdk-${randomUUID()}`;
	const handle = await startHostedApiServer({
		workspaceRoot: process.cwd(),
		authToken: token,
		port: 0,
	});

	try {
		const sdkPackResult = await execFileAsync(
			"npm",
			["pack", path.join(process.cwd(), "packages/sdk")],
			{
				cwd: tempRoot,
				encoding: "utf8",
			},
		);
		const packedFile = sdkPackResult.stdout.trim().split(/\r?\n/u).at(-1);
		if (!packedFile) {
			throw new Error("npm pack did not return an SDK tarball name.");
		}

		await writeFile(
			path.join(tempRoot, "package.json"),
			JSON.stringify({ name: "sdk-proof", type: "module" }, null, 2),
		);
		await execFileAsync("npm", ["install", `./${packedFile}`], {
			cwd: tempRoot,
			encoding: "utf8",
		});

		const proofScriptPath = path.join(tempRoot, "proof.mjs");
		await writeFile(
			proofScriptPath,
			[
				"import { OPENUI_SDK_MANIFEST, createOpenuiHostedClient } from '@openui/sdk';",
				`const client = createOpenuiHostedClient({ baseUrl: 'http://127.0.0.1:${handle.port}', token: '${token}' });`,
				"const health = await client.health();",
				"console.log(JSON.stringify({ ok: true, service: health.data.service, packageName: OPENUI_SDK_MANIFEST.packageName }, null, 2));",
			].join("\n"),
			"utf8",
		);

		const proofResult = await execFileAsync("node", [proofScriptPath], {
			cwd: tempRoot,
			encoding: "utf8",
		});
		const proof = JSON.parse(proofResult.stdout);

		console.log(
			JSON.stringify(
				{
					ok: true,
					tarball: packedFile,
					service: proof.service,
					packageName: proof.packageName,
				},
				null,
				2,
			),
		);
	} finally {
		await handle.close();
		await rm(tempRoot, { recursive: true, force: true });
	}
}

void main();
