import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

type ParsedTask = {
	name: string;
	args: string[];
};

type ProfileTaskMap = Record<string, Record<string, ParsedTask[]>>;

function getPropertyName(name: ts.PropertyName): string | null {
	if (
		ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNoSubstitutionTemplateLiteral(name)
	) {
		return name.text;
	}
	return null;
}

function getObjectProperty(
	objectLiteral: ts.ObjectLiteralExpression,
	propertyName: string,
): ts.Expression | null {
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		const name = getPropertyName(property.name);
		if (name === propertyName) {
			return property.initializer;
		}
	}
	return null;
}

function asString(expression: ts.Expression | null): string | null {
	if (
		expression &&
		(ts.isStringLiteral(expression) ||
			ts.isNoSubstitutionTemplateLiteral(expression))
	) {
		return expression.text;
	}
	return null;
}

function extractProfileTaskMap(sourceText: string): ProfileTaskMap {
	const sourceFile = ts.createSourceFile(
		"precommit-gate.mjs",
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);

	let profileDefinitions: ts.ObjectLiteralExpression | null = null;

	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) {
			continue;
		}
		for (const declaration of statement.declarationList.declarations) {
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === "PROFILE_DEFINITIONS" &&
				declaration.initializer &&
				ts.isObjectLiteralExpression(declaration.initializer)
			) {
				profileDefinitions = declaration.initializer;
			}
		}
	}

	if (!profileDefinitions) {
		throw new Error("PROFILE_DEFINITIONS not found");
	}

	const profileTaskMap: ProfileTaskMap = {};
	for (const profileProperty of profileDefinitions.properties) {
		if (!ts.isPropertyAssignment(profileProperty)) {
			continue;
		}
		const profileName = getPropertyName(profileProperty.name);
		if (!profileName) {
			continue;
		}
		if (!ts.isArrayLiteralExpression(profileProperty.initializer)) {
			throw new Error(`profile ${profileName} must be an array`);
		}

		const phaseMap: Record<string, ParsedTask[]> = {};
		for (const phaseEntry of profileProperty.initializer.elements) {
			if (!ts.isObjectLiteralExpression(phaseEntry)) {
				throw new Error(`profile ${profileName} phase must be object literal`);
			}

			const phaseId = asString(getObjectProperty(phaseEntry, "id"));
			if (!phaseId) {
				throw new Error(`profile ${profileName} contains phase without id`);
			}

			const tasksExpression = getObjectProperty(phaseEntry, "tasks");
			if (!tasksExpression || !ts.isArrayLiteralExpression(tasksExpression)) {
				throw new Error(
					`profile ${profileName}/${phaseId} missing tasks array`,
				);
			}

			const tasks: ParsedTask[] = [];
			for (const taskEntry of tasksExpression.elements) {
				if (!ts.isObjectLiteralExpression(taskEntry)) {
					throw new Error(
						`profile ${profileName}/${phaseId} task must be object literal`,
					);
				}
				const taskName = asString(getObjectProperty(taskEntry, "name"));
				if (!taskName) {
					throw new Error(
						`profile ${profileName}/${phaseId} has task without name`,
					);
				}

				const argsExpression = getObjectProperty(taskEntry, "args");
				const args =
					argsExpression && ts.isArrayLiteralExpression(argsExpression)
						? argsExpression.elements
								.map((item) =>
									ts.isStringLiteral(item) ||
									ts.isNoSubstitutionTemplateLiteral(item)
										? item.text
										: null,
								)
								.filter((item): item is string => item !== null)
						: [];

				tasks.push({ name: taskName, args });
			}

			phaseMap[phaseId] = tasks;
		}

		profileTaskMap[profileName] = phaseMap;
	}

	return profileTaskMap;
}

describe("pre-commit gate hardening", () => {
	it("keeps strict profile -> phase -> task mapping stable", async () => {
		const gatePath = path.join(repoRoot, "tooling/precommit-gate.mjs");
		const content = await fs.readFile(gatePath, "utf8");
		const profileTaskMap = extractProfileTaskMap(content);

		expect(
			profileTaskMap["precommit-strict"]?.["fast-gates"].map((t) => t.name),
		).toEqual([
			"secrets-scan",
			"env-governance",
			"tracked-surface-hygiene",
			"sensitive-surface-audit",
			"governance-contract",
			"host-safety",
			"lint-staged",
			"typecheck",
		]);

		expect(
			profileTaskMap["prepush-light"]?.["light-gates"].map((t) => t.name),
		).toEqual([
			"iac-check",
			"workflow-governance",
			"host-safety",
			"resource-leak-audit-full",
			"test-fast-gate",
			"anti-placebo-guard",
		]);

		const allArgs = Object.values(profileTaskMap)
			.flatMap((phaseMap) => Object.values(phaseMap))
			.flatMap((tasks) => tasks)
			.flatMap((task) => task.args);
		expect(allArgs).not.toContain("mutation:run:gate");
	});
});
