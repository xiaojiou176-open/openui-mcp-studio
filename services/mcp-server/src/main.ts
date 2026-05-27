import { runStdioServer } from "./index.js";
import { logError } from "./logger.js";

runStdioServer().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	logError("mcp_server_start_failed", {
		traceId: "mcp_server_bootstrap",
		stage: "startup",
		errorType: error instanceof Error ? error.name : "UnknownError",
		context: {
			entrypoint: "src/main.ts",
		},
		error: message,
	});
	process.exit(1);
});
