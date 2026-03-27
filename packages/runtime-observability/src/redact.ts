const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[Circular]";
const SENSITIVE_VALUE_PATTERNS = [
	/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
	/\bAIza[0-9A-Za-z_-]{35}\b/,
	/\bsk-proj-[A-Za-z0-9_-]{20,}\b/,
	/\bsk-[A-Za-z0-9]{20,}\b/,
	/\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
	/\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
	/\bAKIA[0-9A-Z]{16}\b/,
	/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/,
];

function isSensitiveKey(key: string): boolean {
	const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
	if (!normalized) {
		return false;
	}

	if (
		normalized.includes("token") ||
		normalized.includes("apikey") ||
		normalized.includes("password") ||
		normalized.includes("authorization") ||
		normalized.includes("cookie") ||
		normalized.includes("secret") ||
		normalized.includes("credential")
	) {
		return true;
	}

	return normalized === "key" || normalized.endsWith("key");
}

function redactValue(value: unknown, visited: WeakSet<object>): unknown {
	if (typeof value === "string") {
		return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
			? REDACTED_VALUE
			: value;
	}

	if (value === null || typeof value !== "object") {
		return value;
	}

	if (visited.has(value)) {
		return CIRCULAR_VALUE;
	}
	visited.add(value);

	if (Array.isArray(value)) {
		const redactedArray = value.map((entry) => redactValue(entry, visited));
		visited.delete(value);
		return redactedArray;
	}

	const source = value as Record<string, unknown>;
	const redactedObject: Record<string, unknown> = {};

	for (const [key, currentValue] of Object.entries(source)) {
		if (isSensitiveKey(key)) {
			redactedObject[key] = REDACTED_VALUE;
			continue;
		}
		redactedObject[key] = redactValue(currentValue, visited);
	}

	visited.delete(value);
	return redactedObject;
}

export function redactSensitiveMeta(
	meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
	if (!meta) {
		return undefined;
	}
	return redactValue(meta, new WeakSet<object>()) as Record<string, unknown>;
}
