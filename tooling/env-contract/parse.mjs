import ts from "typescript";
import { toSortedUnique } from "./format.mjs";

const OPENUI_ENV_KEY_PATTERN =
	/\b(?:OPENUI|GEMINI)_[A-Z0-9_]+\b|\bNEXT_PUBLIC_SITE_URL\b/g;
const OPENUI_ENV_KEY_NAME_PATTERN =
	/^(?:(?:OPENUI|GEMINI)_[A-Z0-9_]+|NEXT_PUBLIC_SITE_URL)$/;

function normalizeWhitespace(value) {
	return value.replace(/\s+/g, " ").trim();
}

function unwrapExpression(node) {
	let current = node;

	while (
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isParenthesizedExpression(current)
	) {
		current = current.expression;
	}

	return current;
}

function getPropertyNameText(nameNode) {
	if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode)) {
		return nameNode.text;
	}

	return null;
}

function parseBooleanLiteral(node, fieldName) {
	if (node.kind === ts.SyntaxKind.TrueKeyword) {
		return true;
	}

	if (node.kind === ts.SyntaxKind.FalseKeyword) {
		return false;
	}

	throw new Error(`Expected boolean literal for "${fieldName}".`);
}

function parseStringLiteral(node, fieldName) {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return node.text;
	}

	throw new Error(`Expected string literal for "${fieldName}".`);
}

function parseDefaultLiteral(node, sourceFile) {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return node.text;
	}

	if (ts.isNumericLiteral(node)) {
		return String(Number(node.text));
	}

	if (
		ts.isPrefixUnaryExpression(node) &&
		node.operator === ts.SyntaxKind.MinusToken &&
		ts.isNumericLiteral(node.operand)
	) {
		return String(-Number(node.operand.text));
	}

	if (ts.isArrowFunction(node)) {
		if (ts.isBlock(node.body)) {
			for (const statement of node.body.statements) {
				if (ts.isReturnStatement(statement) && statement.expression) {
					return normalizeWhitespace(statement.expression.getText(sourceFile));
				}
			}

			return normalizeWhitespace(node.getText(sourceFile));
		}

		return normalizeWhitespace(node.body.getText(sourceFile));
	}

	throw new Error("Unsupported defaultValue node in OPENUI_ENV_CONTRACT.");
}

function getContractObject(raw) {
	const sourceFile = ts.createSourceFile(
		"env-contract.ts",
		raw,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	let keyTupleNode = null;
	let contractObjectNode = null;

	function visit(node) {
		if (
			!ts.isVariableDeclaration(node) ||
			!node.initializer ||
			!ts.isIdentifier(node.name)
		) {
			ts.forEachChild(node, visit);
			return;
		}

		const initializer = unwrapExpression(node.initializer);

		if (
			node.name.text === "OPENUI_ENV_KEYS" &&
			ts.isArrayLiteralExpression(initializer)
		) {
			keyTupleNode = initializer;
		}

		if (node.name.text === "OPENUI_ENV_CONTRACT") {
			if (ts.isObjectLiteralExpression(initializer)) {
				contractObjectNode = initializer;
			} else if (
				ts.isCallExpression(initializer) &&
				ts.isPropertyAccessExpression(initializer.expression) &&
				initializer.expression.expression.getText(sourceFile) === "Object" &&
				initializer.expression.name.text === "freeze" &&
				initializer.arguments.length > 0 &&
				ts.isObjectLiteralExpression(initializer.arguments[0])
			) {
				contractObjectNode = initializer.arguments[0];
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	if (!keyTupleNode) {
		throw new Error(
			'Failed to parse packages/contracts/src/env-contract.ts: "OPENUI_ENV_KEYS" not found.',
		);
	}

	if (!contractObjectNode) {
		throw new Error(
			'Failed to parse packages/contracts/src/env-contract.ts: "OPENUI_ENV_CONTRACT" not found.',
		);
	}

	return { sourceFile, keyTupleNode, contractObjectNode };
}

function parseEnvContract(raw) {
	const { sourceFile, keyTupleNode, contractObjectNode } =
		getContractObject(raw);

	const keyTuple = [];
	for (const element of keyTupleNode.elements) {
		if (
			!ts.isStringLiteral(element) &&
			!ts.isNoSubstitutionTemplateLiteral(element)
		) {
			throw new Error("OPENUI_ENV_KEYS must contain string literals only.");
		}
		keyTuple.push(element.text);
	}

	const entries = {};
	for (const prop of contractObjectNode.properties) {
		if (!ts.isPropertyAssignment(prop)) {
			continue;
		}

		const keyName = getPropertyNameText(prop.name);
		if (!keyName || !OPENUI_ENV_KEY_NAME_PATTERN.test(keyName)) {
			continue;
		}

		if (!ts.isObjectLiteralExpression(prop.initializer)) {
			throw new Error(`Contract entry "${keyName}" must be an object literal.`);
		}

		let defaultValue;
		let sensitive;
		let description;
		let validation;

		for (const field of prop.initializer.properties) {
			if (!ts.isPropertyAssignment(field)) {
				continue;
			}

			const fieldName = getPropertyNameText(field.name);
			if (!fieldName) {
				continue;
			}

			if (fieldName === "defaultValue") {
				defaultValue = parseDefaultLiteral(field.initializer, sourceFile);
			} else if (fieldName === "sensitive") {
				sensitive = parseBooleanLiteral(field.initializer, "sensitive");
			} else if (fieldName === "description") {
				description = parseStringLiteral(field.initializer, "description");
			} else if (fieldName === "validation") {
				validation = parseStringLiteral(field.initializer, "validation");
			}
		}

		if (
			defaultValue === undefined ||
			sensitive === undefined ||
			description === undefined ||
			validation === undefined
		) {
			throw new Error(
				`Contract entry "${keyName}" must define defaultValue/sensitive/description/validation.`,
			);
		}

		entries[keyName] = {
			defaultValue,
			sensitive,
			description,
			validation,
		};
	}

	return {
		keyTuple: toSortedUnique(keyTuple),
		entryKeys: toSortedUnique(Object.keys(entries)),
		entries,
	};
}

function parseEnvContractKeys(raw) {
	return parseEnvContract(raw).keyTuple;
}

function parseEnvExample(raw) {
	const entries = new Map();
	let currentKey = null;

	function getOrCreateEntry(key) {
		if (!entries.has(key)) {
			entries.set(key, {
				description: null,
				defaultValue: null,
				validation: null,
				sensitive: null,
				hasValueLine: false,
			});
		}

		return entries.get(key);
	}

	for (const rawLine of raw.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) {
			currentKey = null;
			continue;
		}

		const markerMatch = line.match(
			/^#\s*@env\s+((?:(?:OPENUI|GEMINI)_[A-Z0-9_]+|NEXT_PUBLIC_SITE_URL))\s*$/,
		);
		if (markerMatch) {
			currentKey = markerMatch[1];
			getOrCreateEntry(currentKey);
			continue;
		}

		const metaMatch = line.match(
			/^#\s*(description|default|validation|sensitive):\s*(.*)$/,
		);
		if (metaMatch && currentKey) {
			const entry = getOrCreateEntry(currentKey);
			if (metaMatch[1] === "description") {
				entry.description = metaMatch[2];
			} else if (metaMatch[1] === "default") {
				entry.defaultValue = metaMatch[2];
			} else if (metaMatch[1] === "validation") {
				entry.validation = metaMatch[2];
			} else if (metaMatch[1] === "sensitive") {
				entry.sensitive = metaMatch[2];
			}
			continue;
		}

		const kvMatch = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
		if (kvMatch && OPENUI_ENV_KEY_NAME_PATTERN.test(kvMatch[1])) {
			const key = kvMatch[1];
			const entry = getOrCreateEntry(key);
			entry.hasValueLine = true;

			if (key === currentKey) {
				currentKey = null;
			}
		}
	}

	return {
		keys: toSortedUnique(
			Array.from(entries.entries())
				.filter(([, value]) => value.hasValueLine)
				.map(([key]) => key),
		),
		metadata: Object.fromEntries(entries),
	};
}

function parseEnvExampleKeys(raw) {
	return parseEnvExample(raw).keys;
}

function readReadmeEnvSection(raw) {
	const sectionMarker = "## Runtime Variables";
	const sectionStart = raw.indexOf(sectionMarker);
	if (sectionStart < 0) {
		throw new Error(
			'Failed to parse README.md: "## Runtime Variables" section not found.',
		);
	}

	const nextSectionStart = raw.indexOf(
		"\n## ",
		sectionStart + sectionMarker.length,
	);
	return nextSectionStart < 0
		? raw.slice(sectionStart)
		: raw.slice(sectionStart, nextSectionStart);
}

function parseReadmeEnvKeys(raw) {
	const section = readReadmeEnvSection(raw);
	const matches = section.match(OPENUI_ENV_KEY_PATTERN) ?? [];
	return toSortedUnique(matches);
}

function parseReadmeDefaultLineKeys(raw) {
	const section = readReadmeEnvSection(raw);
	const keys = [];
	for (const line of section.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("| `")) {
			continue;
		}
		const matches = trimmed.match(OPENUI_ENV_KEY_PATTERN) ?? [];
		keys.push(...matches);
	}

	return toSortedUnique(keys);
}

export {
	parseEnvContract,
	parseEnvContractKeys,
	parseEnvExample,
	parseEnvExampleKeys,
	parseReadmeDefaultLineKeys,
	parseReadmeEnvKeys,
};
