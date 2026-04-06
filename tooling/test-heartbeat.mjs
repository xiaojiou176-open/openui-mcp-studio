import process from "node:process";

const DEFAULT_INTERVAL_MS = 30_000;
const MAX_LABEL_LENGTH = 64;

function sanitizeLabel(rawLabel) {
	const normalized = String(rawLabel ?? "")
		.replace(/[\r\n\t]/g, " ")
		.replace(/[^\x20-\x7E]/g, "")
		.trim();
	if (!normalized) {
		return "task";
	}
	return normalized.slice(0, MAX_LABEL_LENGTH);
}

function parseArgs(argv) {
	let label = "task";
	let intervalMs = DEFAULT_INTERVAL_MS;

	for (const argument of argv) {
		if (argument.startsWith("--label=")) {
			label = sanitizeLabel(argument.slice("--label=".length));
			continue;
		}
		if (argument.startsWith("--interval-ms=")) {
			const raw = Number(argument.slice("--interval-ms=".length));
			if (Number.isInteger(raw) && raw > 0) {
				intervalMs = raw;
			}
		}
	}

	return { label, intervalMs };
}

function main() {
	const { label, intervalMs } = parseArgs(process.argv.slice(2));
	const startedAt = Date.now();
	let isClosed = false;

	const emit = (state) => {
		const elapsedSeconds = Math.max(
			0,
			Math.floor((Date.now() - startedAt) / 1000),
		);
		const timestamp = new Date().toISOString();
		process.stderr.write(
			`[heartbeat][${label}] ts=${timestamp} state=${state} elapsed=${elapsedSeconds}s interval=${intervalMs}ms pid=${process.pid}\n`,
		);
	};

	emit("started");
	const timer = globalThis.setInterval(() => {
		emit("running");
	}, intervalMs);
	timer.unref?.();

	const shutdown = () => {
		if (isClosed) {
			return;
		}
		isClosed = true;
		globalThis.clearInterval(timer);
		emit("completed");
		process.exit(0);
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
	process.on("disconnect", shutdown);
}

main();
