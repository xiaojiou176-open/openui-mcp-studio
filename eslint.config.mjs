import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import tseslint from "typescript-eslint";

const ASSERTION_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual"]);
const TRUTHINESS_MATCHERS = new Set(["toBeTruthy", "toBeFalsy"]);

function getStaticLiteralValue(node) {
  if (!node) {
    return { known: false };
  }

  if (node.type === "Literal") {
    return { known: true, value: node.value };
  }

  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return { known: true, value: node.quasis[0]?.value.cooked ?? "" };
  }

  if (
    node.type === "UnaryExpression" &&
    (node.operator === "-" || node.operator === "+") &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return {
      known: true,
      value: node.operator === "-" ? -node.argument.value : node.argument.value,
    };
  }

  if (node.type === "UnaryExpression" && node.operator === "!") {
    const value = getStaticLiteralValue(node.argument);
    if (!value.known) {
      return { known: false };
    }
    return { known: true, value: !value.value };
  }

  if (node.type === "LogicalExpression") {
    const left = getStaticLiteralValue(node.left);
    const right = getStaticLiteralValue(node.right);
    if (!left.known || !right.known) {
      return { known: false };
    }
    if (node.operator === "&&") {
      return { known: true, value: left.value && right.value };
    }
    if (node.operator === "||") {
      return { known: true, value: left.value || right.value };
    }
    if (node.operator === "??") {
      return {
        known: true,
        value: left.value === null || left.value === undefined ? right.value : left.value,
      };
    }
  }

  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.arguments.length === 1
  ) {
    const argument = getStaticLiteralValue(node.arguments[0]);
    if (!argument.known) {
      return { known: false };
    }
    if (node.callee.name === "Boolean") {
      return { known: true, value: Boolean(argument.value) };
    }
    if (node.callee.name === "Number") {
      return { known: true, value: Number(argument.value) };
    }
    if (node.callee.name === "String") {
      return { known: true, value: String(argument.value) };
    }
  }

  if (node.type === "Identifier" && node.name === "undefined") {
    return { known: true, value: undefined };
  }

  return { known: false };
}

function getMatcherName(node) {
  if (!node || node.type !== "MemberExpression" || node.computed) {
    return null;
  }
  if (node.property.type !== "Identifier") {
    return null;
  }
  return node.property.name;
}

function getComparableExpressionKey(node) {
  if (!node) {
    return null;
  }

  if (node.type === "ParenthesizedExpression") {
    return getComparableExpressionKey(node.expression);
  }

  if (node.type === "Literal") {
    return `literal:${JSON.stringify(node.value)}`;
  }

  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return `template:${node.quasis[0]?.value.cooked ?? ""}`;
  }

  if (node.type === "Identifier" && node.name === "undefined") {
    return "undefined";
  }

  if (node.type === "Identifier") {
    return `identifier:${node.name}`;
  }

  if (
    node.type === "UnaryExpression" &&
    (node.operator === "-" || node.operator === "+") &&
    node.argument.type === "Literal" &&
    typeof node.argument.value === "number"
  ) {
    return `number:${node.operator === "-" ? -node.argument.value : node.argument.value}`;
  }

  if (node.type === "MemberExpression" && !node.computed) {
    const objectKey = getComparableExpressionKey(node.object);
    if (!objectKey || node.property.type !== "Identifier") {
      return null;
    }
    return `${objectKey}.${node.property.name}`;
  }

  return null;
}

const assertionGuardPlugin = {
  rules: {
    "no-low-value-assertions": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow low-value test assertions like toBeDefined() and identical literal comparisons.",
        },
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            const matcherName = getMatcherName(node.callee);
            if (!matcherName) {
              return;
            }

            if (matcherName === "toBeDefined") {
              context.report({
                node,
                message:
                  "Low-value assertion disallowed: toBeDefined(). Assert the concrete shape, field, or exact error code instead.",
              });
              return;
            }

            if (TRUTHINESS_MATCHERS.has(matcherName)) {
              const expectCall = node.callee.object;
              if (
                expectCall &&
                expectCall.type === "CallExpression" &&
                expectCall.arguments.length === 1 &&
                expectCall.callee.type === "Identifier" &&
                expectCall.callee.name === "expect"
              ) {
                const staticValue = getStaticLiteralValue(expectCall.arguments[0]);
                if (staticValue.known) {
                  context.report({
                    node,
                    message:
                      "Constant-expression truthiness assertions are disallowed: expect(<const expr>).{{matcher}}(). Assert a real business outcome instead.",
                    data: { matcher: matcherName },
                  });
                  return;
                }
              }
            }

            if (!ASSERTION_MATCHERS.has(matcherName) || node.arguments.length !== 1) {
              return;
            }

            const expectCall = node.callee.object;
            if (
              !expectCall ||
              expectCall.type !== "CallExpression" ||
              expectCall.arguments.length !== 1 ||
              expectCall.callee.type !== "Identifier" ||
              expectCall.callee.name !== "expect"
            ) {
              return;
            }

            const left = getStaticLiteralValue(expectCall.arguments[0]);
            const right = getStaticLiteralValue(node.arguments[0]);
            if (!left.known || !right.known) {
              return;
            }

            if (Object.is(left.value, right.value)) {
              context.report({
                node,
                message:
                  "Identical-literal assertions are disallowed: expect(<literal>).{{matcher}}(<same literal>). Assert a real business outcome instead.",
                data: { matcher: matcherName },
              });
              return;
            }

            const leftKey = getComparableExpressionKey(expectCall.arguments[0]);
            const rightKey = getComparableExpressionKey(node.arguments[0]);
            if (leftKey && rightKey && leftKey === rightKey) {
              context.report({
                node,
                message:
                  "Mirror assertions are disallowed: expect(expr).{{matcher}}(expr). Assert a real business outcome or observable behavior instead.",
                data: { matcher: matcherName },
              });
            }
          },
        };
      },
    },
  },
};

const nodeGlobals = {
  Buffer: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
};

const vitestGlobals = {
  afterEach: "readonly",
  describe: "readonly",
  expect: "readonly",
  it: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "tests/artifacts/**",
      "tests/fixtures/**",
      "**/.next/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
  {
    files: ["commitlint.config.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...nodeGlobals,
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules: {
      "no-undef": "off",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["packages/shared-runtime/src/**/*.ts", "packages/runtime-observability/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/services/mcp-server/src/tools/**",
                "**/services/mcp-server/src/providers/**",
                "**/services/mcp-server/src/retrieval/**",
                "**/services/mcp-server/src/uiux/**",
                "**/services/mcp-server/src/next-smoke/**",
              ],
              message:
                "Shared packages must not depend back on service business layers. Route the import through packages/* or a public service entry instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: vitestGlobals,
    },
    plugins: {
      vitest,
      assertionGuard: assertionGuardPlugin,
    },
    rules: {
      "vitest/expect-expect": "error",
      "vitest/no-commented-out-tests": "error",
      "vitest/no-conditional-expect": "error",
      "vitest/valid-expect-in-promise": "error",
      "assertionGuard/no-low-value-assertions": "error",
    },
  },
);
