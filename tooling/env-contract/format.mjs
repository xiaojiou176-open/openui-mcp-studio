function toSortedUnique(values) {
	return Array.from(new Set(values)).sort();
}

function diffSets(expected, actual) {
	const missing = expected.filter((key) => !actual.includes(key));
	const extra = actual.filter((key) => !expected.includes(key));
	return { missing, extra };
}

function formatMismatch(source, expected, actual) {
	const { missing, extra } = diffSets(expected, actual);
	const lines = [];

	if (missing.length > 0) {
		lines.push(`- Missing in ${source}: ${missing.join(", ")}`);
	}

	if (extra.length > 0) {
		lines.push(`- Extra in ${source}: ${extra.join(", ")}`);
	}

	return lines;
}

function formatDefaultForEnvExample(value) {
	return value === "" ? "<empty>" : String(value);
}

export { diffSets, formatDefaultForEnvExample, formatMismatch, toSortedUnique };
