import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const E2E_ROOT = path.resolve(process.cwd(), "tests/e2e");
const E2E_TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/;
const PLAYWRIGHT_ASYNC_METHODS = new Set([
	"goto",
	"click",
	"dblclick",
	"fill",
	"focus",
	"press",
	"type",
	"check",
	"uncheck",
	"hover",
	"tap",
	"scrollIntoViewIfNeeded",
	"selectOption",
	"setInputFiles",
	"addStyleTag",
	"waitForURL",
	"waitForResponse",
	"waitForRequest",
	"waitForSelector",
	"waitForEvent",
	"waitForFunction",
	"waitForLoadState",
	"evaluate",
	"evaluateHandle",
	"reload",
	"route",
	"unroute",
]);

type Violation = {
	filePath: string;
	line: number;
	code: string;
};

const PROMISE_COMBINATOR_NAMES = new Set(["all", "allSettled", "any", "race"]);

async function collectTypescriptFiles(rootDir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	for (const entry of entries) {
		const absolutePath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectTypescriptFiles(absolutePath)));
			continue;
		}
		if (entry.isFile() && E2E_TYPESCRIPT_FILE.test(entry.name)) {
			files.push(absolutePath);
		}
	}
	return files;
}

function isPlaywrightAsyncCall(node: ts.CallExpression): boolean {
	const { expression } = node;
	if (!ts.isPropertyAccessExpression(expression)) {
		return false;
	}

	return PLAYWRIGHT_ASYNC_METHODS.has(expression.name.text);
}

function isPromiseCombinatorCall(node: ts.CallExpression): boolean {
	if (!ts.isPropertyAccessExpression(node.expression)) {
		return false;
	}
	if (!ts.isIdentifier(node.expression.expression)) {
		return false;
	}
	if (node.expression.expression.text !== "Promise") {
		return false;
	}
	return PROMISE_COMBINATOR_NAMES.has(node.expression.name.text);
}

function getBoundary(node: ts.Node): ts.Node {
	let current: ts.Node = node;
	while (current.parent) {
		if (ts.isFunctionLike(current.parent)) {
			return current.parent;
		}
		current = current.parent;
	}
	return current;
}

function isConsumedByAncestors(node: ts.Node, boundary: ts.Node): boolean {
	let current: ts.Node | undefined = node;
	while (current && current !== boundary) {
		const parent = current.parent;
		if (!parent) {
			return false;
		}
		if (ts.isVoidExpression(parent) && parent.expression === current) {
			return false;
		}
		if (ts.isAwaitExpression(parent) || ts.isReturnStatement(parent)) {
			return true;
		}
		current = parent;
	}
	return false;
}

function isDeclarationName(node: ts.Identifier): boolean {
	const parent = node.parent;
	return (
		(ts.isVariableDeclaration(parent) && parent.name === node) ||
		(ts.isBindingElement(parent) && parent.name === node) ||
		(ts.isParameter(parent) && parent.name === node) ||
		(ts.isFunctionDeclaration(parent) && parent.name === node) ||
		(ts.isFunctionExpression(parent) && parent.name === node) ||
		(ts.isClassDeclaration(parent) && parent.name === node) ||
		(ts.isInterfaceDeclaration(parent) && parent.name === node) ||
		(ts.isTypeAliasDeclaration(parent) && parent.name === node) ||
		(ts.isImportClause(parent) && parent.name === node) ||
		(ts.isImportSpecifier(parent) && parent.name === node)
	);
}

function findPromiseCombinatorOwner(
	node: ts.Node,
	boundary: ts.Node,
): ts.CallExpression | null {
	let current: ts.Node | undefined = node;
	while (current && current !== boundary) {
		if (ts.isCallExpression(current) && isPromiseCombinatorCall(current)) {
			const [firstArg] = current.arguments;
			if (
				firstArg &&
				ts.isArrayLiteralExpression(firstArg) &&
				node.pos >= firstArg.pos &&
				node.end <= firstArg.end
			) {
				return current;
			}
		}
		current = current.parent;
	}
	return null;
}

function getAssignedIdentifier(node: ts.Node): ts.Identifier | null {
	const parent = node.parent;
	if (
		ts.isVariableDeclaration(parent) &&
		parent.initializer === node &&
		ts.isIdentifier(parent.name)
	) {
		return parent.name;
	}
	if (
		ts.isBinaryExpression(parent) &&
		parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		parent.right === node &&
		ts.isIdentifier(parent.left)
	) {
		return parent.left;
	}
	return null;
}

function isIdentifierConsumed(
	identifier: ts.Identifier,
	boundary: ts.Node,
): boolean {
	let consumed = false;
	function visit(node: ts.Node): void {
		if (consumed) {
			return;
		}
		if (node.pos <= identifier.pos) {
			ts.forEachChild(node, visit);
			return;
		}
		if (node !== boundary && ts.isFunctionLike(node)) {
			return;
		}
		if (
			ts.isIdentifier(node) &&
			node.text === identifier.text &&
			!isDeclarationName(node)
		) {
			if (isConsumedByAncestors(node, boundary)) {
				consumed = true;
				return;
			}
			const combinator = findPromiseCombinatorOwner(node, boundary);
			if (combinator && isConsumedByAncestors(combinator, boundary)) {
				consumed = true;
				return;
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(boundary);
	return consumed;
}

function isConsumedPlaywrightCall(callNode: ts.CallExpression): boolean {
	const boundary = getBoundary(callNode);
	if (isConsumedByAncestors(callNode, boundary)) {
		return true;
	}

	const combinator = findPromiseCombinatorOwner(callNode, boundary);
	if (combinator) {
		if (isConsumedByAncestors(combinator, boundary)) {
			return true;
		}
		const combinatorAssigned = getAssignedIdentifier(combinator);
		if (
			combinatorAssigned &&
			isIdentifierConsumed(combinatorAssigned, boundary)
		) {
			return true;
		}
	}

	const assignedIdentifier = getAssignedIdentifier(callNode);
	if (!assignedIdentifier) {
		return false;
	}
	return isIdentifierConsumed(assignedIdentifier, boundary);
}

function collectViolations(filePath: string, sourceText: string): Violation[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const violations: Violation[] = [];

	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			isPlaywrightAsyncCall(node) &&
			!isConsumedPlaywrightCall(node)
		) {
			const { line } = sourceFile.getLineAndCharacterOfPosition(
				node.getStart(),
			);
			violations.push({
				filePath: path.relative(process.cwd(), filePath),
				line: line + 1,
				code: node.getText(sourceFile),
			});
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return violations;
}

describe("e2e async-await guard", () => {
	it("tracks variable declarations, void calls, and Promise.all consumption", () => {
		const source = `
			async function good(page: any, link: any) {
				await page.goto("https://example.com");
				const navPromise = page.reload();
				await navPromise;
				await link.focus();
				await link.scrollIntoViewIfNeeded();
				await page.addStyleTag({content:"body{color:red;}"});
				await page.evaluate(() => document.title);
				await page.evaluateHandle(() => document.body);
				return page.waitForResponse("**/health");
				await Promise.all([page.waitForURL(/example/), link.click()]);
			}

			async function bad(page: any, link: any) {
				page.goto("https://example.com");
				const pending = page.reload();
				link.focus();
				link.scrollIntoViewIfNeeded();
				const styleTag = page.addStyleTag({content:"body{color:red;}"});
				page.evaluate(() => document.title);
				const handle = page.evaluateHandle(() => document.body);
				void link.click();
				Promise.all([page.waitForURL(/example/)]);
				void styleTag;
				void handle;
				void pending;
			}
		`;

		const violations = collectViolations("inline-e2e.spec.ts", source);
		expect(violations.map((item) => item.code)).toEqual([
			'page.goto("https://example.com")',
			"page.reload()",
			"link.focus()",
			"link.scrollIntoViewIfNeeded()",
			'page.addStyleTag({content:"body{color:red;}"})',
			"page.evaluate(() => document.title)",
			"page.evaluateHandle(() => document.body)",
			"link.click()",
			"page.waitForURL(/example/)",
		]);
	});

	it("rejects unawaited async playwright calls in e2e specs and helpers", async () => {
		const files = await collectTypescriptFiles(E2E_ROOT);
		const violations: Violation[] = [];

		for (const absolutePath of files) {
			const content = await fs.readFile(absolutePath, "utf8");
			violations.push(...collectViolations(absolutePath, content));
		}

		expect(violations).toEqual([]);
	});
});
