import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TEST_ROOTS = ["tests", "src"];
const SELF_GUARD_TEST_PATH = "tests/non-placebo-assertions-guard.test.ts";
const GUARDED_SCAN_TIMEOUT_MS = 60_000;
const GUARDED_SCAN_CONCURRENCY = 12;

function normalizePathForComparison(filePath: string): string {
	return filePath.replace(/\\/g, "/");
}

function toWorkspaceRelativePath(filePath: string): string {
	return normalizePathForComparison(path.relative(process.cwd(), filePath));
}

const FORBIDDEN_ASSERTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
	{
		name: "expect(true).toBe(true)",
		regex: /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/gs,
	},
	{
		name: "expect(false).toBe(false)",
		regex: /expect\(\s*false\s*\)\.toBe\(\s*false\s*\)/gs,
	},
	{ name: "expect(1).toBe(1)", regex: /expect\(\s*1\s*\)\.toBe\(\s*1\s*\)/gs },
	{ name: "expect(0).toBe(0)", regex: /expect\(\s*0\s*\)\.toBe\(\s*0\s*\)/gs },
	{
		name: "expect(<value>).toBeTruthy()",
		regex: /expect\([\s\S]*?\)\.(?:resolves\.|rejects\.)?toBeTruthy\(\s*\)/gs,
	},
	{
		name: "expect(<value>).toBeDefined()",
		regex: /expect\([\s\S]*?\)\.(?:resolves\.|rejects\.)?toBeDefined\(\s*\)/gs,
	},
	{
		name: "expect(() => ...).not.toThrow()",
		regex: /expect\(\s*\(\)\s*=>[\s\S]*?\)\.not\.toThrow\(\s*\)/gs,
	},
	{
		name: "expect(<expr>).to(Be|Equal|StrictEqual)(<same expr>)",
		regex:
			/expect\(\s*([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\)\.to(?:Be|Equal|StrictEqual)\(\s*\1\s*\)/gs,
	},
	{
		name: "expect.assertions(0)",
		regex: /expect\.assertions\(\s*0\s*\)/gs,
	},
	{
		name: "expect(arr.length).toBeGreaterThanOrEqual(0)",
		regex:
			/expect\(\s*[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*\.length\s*\)\.toBeGreaterThanOrEqual\(\s*0\s*\)/gs,
	},
];

async function collectTestFiles(rootDir: string): Promise<string[]> {
	const results: string[] = [];
	const root = path.resolve(process.cwd(), rootDir);

	async function walk(currentPath: string): Promise<void> {
		const entries = await fs.readdir(currentPath, { withFileTypes: true });
		await Promise.all(
			entries.map(async (entry) => {
				const fullPath = path.join(currentPath, entry.name);
				if (entry.isDirectory()) {
					await walk(fullPath);
					return;
				}
				if (
					entry.isFile() &&
					(fullPath.endsWith(".test.ts") ||
						fullPath.endsWith(".spec.ts") ||
						fullPath.endsWith(".test.tsx") ||
						fullPath.endsWith(".spec.tsx"))
				) {
					results.push(fullPath);
				}
			}),
		);
	}

	await fs.access(root);
	await walk(root);
	return results;
}

async function mapWithConcurrency<T, U>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<U>,
): Promise<U[]> {
	const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
	const results = new Array<U>(items.length);
	let index = 0;

	async function worker(): Promise<void> {
		while (true) {
			const current = index;
			index += 1;
			if (current >= items.length) {
				return;
			}
			results[current] = await mapper(items[current]);
		}
	}

	await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
	return results;
}

function findForbiddenAssertionHits(content: string): string[] {
	const hits: string[] = [];
	for (const { name, regex } of FORBIDDEN_ASSERTION_PATTERNS) {
		regex.lastIndex = 0;
		if (regex.test(content)) {
			hits.push(name);
		}
	}
	return hits;
}

function isMeaningfulExpectMatcherCall(
	callExpression: ts.CallExpression,
): boolean {
	let expression: ts.Expression = callExpression.expression;
	while (true) {
		if (ts.isPropertyAccessExpression(expression)) {
			expression = expression.expression;
			continue;
		}
		if (ts.isElementAccessExpression(expression)) {
			expression = expression.expression;
			continue;
		}
		if (ts.isCallExpression(expression)) {
			if (
				ts.isIdentifier(expression.expression) &&
				expression.expression.text === "expect"
			) {
				return true;
			}
			expression = expression.expression;
			continue;
		}
		return false;
	}
}

function hasExpectAssertion(node: ts.Node): boolean {
	let found = false;
	function visit(current: ts.Node): void {
		if (found) {
			return;
		}
		if (
			ts.isCallExpression(current) &&
			isMeaningfulExpectMatcherCall(current)
		) {
			found = true;
			return;
		}
		ts.forEachChild(current, visit);
	}
	visit(node);
	return found;
}

function getTestExpressionName(node: ts.LeftHandSideExpression): string | null {
	if (ts.isCallExpression(node)) {
		return getTestExpressionName(node.expression);
	}
	if (ts.isIdentifier(node)) {
		return node.text;
	}
	if (ts.isPropertyAccessExpression(node)) {
		if (ts.isIdentifier(node.expression)) {
			return node.expression.text;
		}
		if (
			ts.isPropertyAccessExpression(node.expression) ||
			ts.isCallExpression(node.expression)
		) {
			return getTestExpressionName(node.expression);
		}
	}
	if (ts.isElementAccessExpression(node)) {
		if (ts.isIdentifier(node.expression)) {
			return node.expression.text;
		}
		if (
			ts.isPropertyAccessExpression(node.expression) ||
			ts.isCallExpression(node.expression)
		) {
			return getTestExpressionName(node.expression);
		}
	}
	return null;
}

function detectScriptKind(filePath: string): ts.ScriptKind {
	if (filePath.endsWith(".tsx")) {
		return ts.ScriptKind.TSX;
	}
	if (filePath.endsWith(".jsx")) {
		return ts.ScriptKind.JSX;
	}
	if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
		return ts.ScriptKind.JS;
	}
	return ts.ScriptKind.TS;
}

function findCasesWithoutExpect(
	content: string,
	filePath = "in-memory.ts",
): number[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		detectScriptKind(filePath),
	);
	const lineNumbers: number[] = [];
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const testExpressionName = getTestExpressionName(node.expression);
			const callback = node.arguments[1];
			if (
				(testExpressionName === "it" || testExpressionName === "test") &&
				callback &&
				(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
			) {
				const hasAssertion = hasExpectAssertion(callback.body);
				if (!hasAssertion) {
					const line = sourceFile.getLineAndCharacterOfPosition(
						callback.getStart(sourceFile),
					).line;
					lineNumbers.push(line + 1);
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return lineNumbers;
}

function countTestCases(content: string, filePath = "in-memory.ts"): number {
	const sourceFile = ts.createSourceFile(
		filePath,
		content,
		ts.ScriptTarget.Latest,
		true,
		detectScriptKind(filePath),
	);
	let count = 0;
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node)) {
			const testExpressionName = getTestExpressionName(node.expression);
			const callback = node.arguments[1];
			if (
				(testExpressionName === "it" || testExpressionName === "test") &&
				callback &&
				(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
			) {
				count += 1;
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return count;
}

describe("test anti-placebo guard", () => {
	it("detects a known placebo assertion pattern", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad assertion", () => {
        expect(true).toBe(true);
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(true).toBe(true)",
		);
	});

	it("detects numeric tautology placebo assertions", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad numeric assertion", () => {
        expect(0).toBe(0);
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain("expect(0).toBe(0)");
	});

	it("detects weak truthiness assertions", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad weak assertion", () => {
        const token = "abc";
        expect(token).toBeTruthy();
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(<value>).toBeTruthy()",
		);
	});

	it("detects weak toBeDefined assertions behind resolves chain", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad async weak assertion", async () => {
        await expect(fs.stat("/tmp/x")).resolves.toBeDefined();
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(<value>).toBeDefined()",
		);
	});

	it("detects weak toBeTruthy assertions behind rejects chain", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad async weak assertion", async () => {
        await expect(Promise.reject(new Error("x"))).rejects.toBeTruthy();
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(<value>).toBeTruthy()",
		);
	});

	it("detects weak not.toThrow assertions", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad throw assertion", () => {
        expect(() => JSON.parse("bad-json")).not.toThrow();
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(() => ...).not.toThrow()",
		);
	});

	it("detects weak length >= 0 assertions", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad length assertion", () => {
        const items = [1, 2];
        expect(items.length).toBeGreaterThanOrEqual(0);
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(arr.length).toBeGreaterThanOrEqual(0)",
		);
	});

	it("detects zero-assertion declarations", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad zero assertion declaration", () => {
        expect.assertions(0);
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect.assertions(0)",
		);
	});

	it("detects tautological self-comparison assertions", () => {
		const content = `
      import { expect, it } from "vitest";
      it("bad tautology assertion", () => {
        const outcome = 1;
        expect(outcome).toEqual(outcome);
      });
    `;
		expect(findForbiddenAssertionHits(content)).toContain(
			"expect(<expr>).to(Be|Equal|StrictEqual)(<same expr>)",
		);
	});

	it("detects test cases without any expect call", () => {
		const content = `
	      import { it } from "vitest";
      it("missing assertion", () => {
        const value = 1 + 1;
        void value;
      });
      test("has assertion", () => {
        expect(2).toBe(2);
      });
		`;
		expect(findCasesWithoutExpect(content)).toEqual([3]);
	});

	it("detects missing expect in it.each parameterized tests", () => {
		const content = `
	      import { it } from "vitest";
	      it.each([1, 2])("missing assertion %s", (value) => {
	        void value;
	      });
	    `;
		expect(countTestCases(content)).toBe(1);
		expect(findCasesWithoutExpect(content)).toEqual([3]);
	});

	it("accepts test.each cases with matcher assertions", () => {
		const content = `
	      import { test, expect } from "vitest";
	      test.each([{ count: 2 }])("has assertion", ({ count }) => {
	        expect(count).toBeGreaterThan(0);
	      });
	    `;
		expect(countTestCases(content)).toBe(1);
		expect(findCasesWithoutExpect(content)).toEqual([]);
	});

	it("treats expect assertion counters without matcher checks as missing assertions", () => {
		const content = `
	      import { it, expect } from "vitest";
	      it("counter only", () => {
	        expect.assertions(1);
	      });
	      it("real assertion", () => {
	        expect("ok").toBe("ok");
	      });
	    `;
		expect(findCasesWithoutExpect(content)).toEqual([3]);
	});

	it("does not flag TSX tests with JSX and matcher assertions", () => {
		const content = `
	      import { it, expect } from "vitest";
	      it("tsx assertion", () => {
	        const node = <div data-testid="banner">Hello</div>;
	        expect(node.props["data-testid"]).toBe("banner");
	      });
	    `;
		expect(countTestCases(content, "component.test.tsx")).toBe(1);
		expect(findCasesWithoutExpect(content, "component.test.tsx")).toEqual([]);
	});

	it("normalizes guard self-exclusion path across platform separators", () => {
		expect(
			normalizePathForComparison("tests\\non-placebo-assertions-guard.test.ts"),
		).toBe(SELF_GUARD_TEST_PATH);
	});

	it(
		"requires meaningful assertions across unit/integration test files",
		async () => {
			const allFiles = (
				await Promise.all(
					TEST_ROOTS.map((root) => collectTestFiles(root).catch(() => [])),
				)
			).flat();

			const targetFiles = allFiles.filter(
				(filePath) =>
					toWorkspaceRelativePath(filePath) !== SELF_GUARD_TEST_PATH,
			);
			expect(targetFiles.length).toBeGreaterThan(0);
			const filesWithoutExpectByCase: Array<{
				filePath: string;
				lines: number[];
			}> = [];
			const forbiddenHits: Array<{ filePath: string; pattern: string }> = [];

			const scanResults = await mapWithConcurrency(
				targetFiles,
				GUARDED_SCAN_CONCURRENCY,
				async (filePath) => {
					const content = await fs.readFile(filePath, "utf8");
					const relativePath = toWorkspaceRelativePath(filePath);
					const testCaseCount = countTestCases(content, filePath);
					if (testCaseCount === 0) {
						return {
							filePath: relativePath,
							missingLines: [1],
							forbiddenPatterns: [],
						};
					}
					return {
						filePath: relativePath,
						missingLines: findCasesWithoutExpect(content, filePath),
						forbiddenPatterns: findForbiddenAssertionHits(content),
					};
				},
			);

			for (const result of scanResults) {
				if (result.missingLines.length > 0) {
					filesWithoutExpectByCase.push({
						filePath: result.filePath,
						lines: result.missingLines,
					});
				}
				for (const pattern of result.forbiddenPatterns) {
					forbiddenHits.push({
						filePath: result.filePath,
						pattern,
					});
				}
			}

			expect(filesWithoutExpectByCase).toEqual([]);
			expect(forbiddenHits).toEqual([]);
		},
		GUARDED_SCAN_TIMEOUT_MS,
	);
});
