import ts from "typescript";
import { isWebsiteArchiveCode } from '../source-artifacts';

export type NumericLiteralBaseline = Record<string, never>;

export function isNumericLiteralSourcePath(filePath: string) {
  return /^(?:(?:packages|apps|scripts)\/|\.agents\/skills\/[^/]+\/scripts\/)/.test(filePath)
    && /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(filePath)
    && !/\.d\.(?:[cm]?ts|tsx)$/i.test(filePath)
    && !isWebsiteArchiveCode(filePath)
    && !/(?:^|\/)(?:browser|coverage|dist|node_modules|proto\/generated|\.git|\.local)(?:\/|$)|^apps\/pad-pilot\/build\/|^apps\/pad-pilot-marketplace\/data\/|\.generated\.[^/]+$/i.test(filePath);
}

export function collectNumericLiteralExpressions(sourceFile: ts.SourceFile) {
  const expressions: Array<{
    expression: string;
    value: number;
    start: number;
    end: number;
    line: number;
    column: number;
  }> = [];

  function visit(node: ts.Node) {
    const value = evaluateNumericExpression(node);
    if (ts.isBinaryExpression(node) && value !== undefined) {
      const start = node.getStart(sourceFile);
      const location = sourceFile.getLineAndCharacterOfPosition(start);
      expressions.push({
        expression: node.getText(sourceFile),
        value,
        start,
        end: node.end,
        line: location.line + 1,
        column: location.character + 1
      });
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return expressions;
}

export function collectNumericLiteralSource(filePath: string, source: string) {
  const kind = filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return collectNumericLiteralExpressions(ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind));
}

export function parseNumericLiteralBaseline(value: unknown): NumericLiteralBaseline {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length) throw new Error("Numeric literal allowances are retired; the baseline must be empty");
  return {};
}

export function numericLiteralMessage(expression: string, value: number) {
  const literal = Object.is(value, -0) ? "-0" : String(value);
  return `Use the final numeric value ${literal} instead of ${expression.replace(/\s+/g, " ")}`;
}

function evaluateNumericExpression(node: ts.Node): number | undefined {
  if (ts.isNumericLiteral(node)) return Number(node.text.replaceAll("_", ""));
  if (ts.isParenthesizedExpression(node)) return evaluateNumericExpression(node.expression);
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evaluateNumericExpression(node.operand);
    if (operand === undefined) return undefined;
    switch (node.operator) {
      case ts.SyntaxKind.PlusToken: return operand;
      case ts.SyntaxKind.MinusToken: return -operand;
      case ts.SyntaxKind.TildeToken: return ~operand;
      default: return undefined;
    }
  }
  if (!ts.isBinaryExpression(node)) return undefined;
  const left = evaluateNumericExpression(node.left);
  const right = evaluateNumericExpression(node.right);
  if (left === undefined || right === undefined) return undefined;
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken: return left + right;
    case ts.SyntaxKind.MinusToken: return left - right;
    case ts.SyntaxKind.AsteriskToken: return left * right;
    case ts.SyntaxKind.SlashToken: return left / right;
    case ts.SyntaxKind.PercentToken: return left % right;
    case ts.SyntaxKind.AsteriskAsteriskToken: return left ** right;
    case ts.SyntaxKind.LessThanLessThanToken: return left << right;
    case ts.SyntaxKind.GreaterThanGreaterThanToken: return left >> right;
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return left >>> right;
    case ts.SyntaxKind.AmpersandToken: return left & right;
    case ts.SyntaxKind.BarToken: return left | right;
    case ts.SyntaxKind.CaretToken: return left ^ right;
    default: return undefined;
  }
}

import { isRecord } from '@hyperfocus/utilities/records';
