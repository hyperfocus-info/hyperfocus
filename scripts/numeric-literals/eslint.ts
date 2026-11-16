import type { Rule } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectNumericLiteralSource, isNumericLiteralSourcePath, numericLiteralMessage } from "./policy";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export function createNumericLiteralRule(): Rule.RuleModule {
  return {
    meta: {
      type: "suggestion",
      docs: { description: "Write the final computed value for arithmetic containing only numeric literals" },
      schema: [],
      messages: { computed: "{{message}}." }
    },
    create(context) {
      return {
        Program() {
          const filePath = path.relative(repoRoot, context.filename).replaceAll("\\", "/");
          if (!isNumericLiteralSourcePath(filePath)) return;
          const source = context.sourceCode.text;
          for (const expression of collectNumericLiteralSource(filePath, source)) {
            context.report({
              loc: { line: expression.line, column: expression.column - 1 },
              messageId: "computed",
              data: {
                message: numericLiteralMessage(expression.expression, expression.value)
              }
            });
          }
        }
      };
    }
  };
}
