import ts from 'typescript';
import { binding, descendants, finding, functionValue, unwrap } from './syntax';

export function expressionShape(node: ts.Node, parameters: readonly string[]): string {
  node = unwrap(node);
  if (ts.isIdentifier(node)) { const index = parameters.indexOf(node.text); return index < 0 ? node.text : `$${index}`; }
  if (ts.isStringLiteral(node)) return JSON.stringify(node.text);
  if (ts.isNumericLiteral(node)) return String(Number(node.text));
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'null';
  if (ts.isTypeOfExpression(node)) return `typeof(${expressionShape(node.expression, parameters)})`;
  if (ts.isPrefixUnaryExpression(node)) return `${ts.tokenToString(node.operator)}(${expressionShape(node.operand, parameters)})`;
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      const terms = (value: ts.Node): string[] => {
        value = unwrap(value);
        return ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          ? [...terms(value.left), ...terms(value.right)] : [expressionShape(value, parameters)];
      };
      return `and(${terms(node).sort().join(',')})`;
    }
    const values = [expressionShape(node.left, parameters), expressionShape(node.right, parameters)];
    if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(operator)) values.sort();
    return `(${values[0]}${ts.tokenToString(operator)}${values[1]})`;
  }
  if (ts.isPropertyAccessExpression(node)) return `${expressionShape(node.expression, parameters)}.${node.name.text}`;
  if (ts.isCallExpression(node)) return `${expressionShape(node.expression, parameters)}(${node.arguments.map(argument => expressionShape(argument, parameters)).join(',')})`;
  if (ts.isConditionalExpression(node)) return `${expressionShape(node.condition, parameters)}?${expressionShape(node.whenTrue, parameters)}:${expressionShape(node.whenFalse, parameters)}`;
  return `unsupported:${node.getText()}`;
}

const patterns = [
  { symbol: 'isRecord', module: 'records', params: ['v'], expression: 'typeof v === "object" && v !== null && !Array.isArray(v)', fix: true },
  { symbol: 'isObject', module: 'records', params: ['v'], expression: 'typeof v === "object" && v !== null', fix: true },
  { symbol: 'text', module: 'text', params: ['v'], expression: 'typeof v === "string" ? v : ""', fix: true },
  { symbol: 'clamp', module: 'math', params: ['v', 'lo', 'hi'], expression: 'Math.min(hi, Math.max(lo, v))', fix: true },
  { symbol: 'clampLowerFirst', module: 'math', params: ['v', 'lo', 'hi'], expression: 'Math.max(lo, Math.min(hi, v))', fix: true },
  { symbol: 'clamp01', module: 'math', params: ['v'], expression: 'Math.min(1, Math.max(0, v))', fix: true },
  { symbol: 'clamp01', module: 'math', params: ['v'], expression: 'Math.max(0, Math.min(1, v))', fix: true },
].map(pattern => {
  const tree = ts.createSourceFile('pattern.ts', `(${pattern.expression})`, ts.ScriptTarget.Latest, true);
  const expression = tree.statements[0];
  if (!expression || !ts.isExpressionStatement(expression)) throw new Error('Invalid canonical utility pattern.');
  return { ...pattern, shape: expressionShape(expression.expression, pattern.params) };
});

export function canonicalFindings(source: ts.SourceFile) {
  if (/(?:^|\/)packages\/utilities\//.test(source.fileName.replaceAll('\\', '/'))) return [];
  return descendants(source).flatMap(declaration => {
    const fn = functionValue(declaration);
    if (!fn || !fn.name || fn.node.parameters.some(parameter => !ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken)) return [];
    if (fn.node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)
      || ts.isFunctionDeclaration(fn.node) && fn.node.asteriskToken || ts.isFunctionExpression(fn.node) && fn.node.asteriskToken) return [];
    let body: ts.Node = fn.body;
    if (ts.isBlock(body)) {
      if (body.statements.length !== 1) return [];
      const statement = body.statements[0];
      if (!statement || !ts.isReturnStatement(statement) || !statement.expression) return [];
      body = statement.expression;
    }
    const parameters = fn.node.parameters.map(parameter => parameter.name.getText(source));
    const shape = expressionShape(body, parameters);
    const match = patterns.find(pattern => pattern.params.length === parameters.length && pattern.shape === shape);
    if (!match) return [];
    if (descendants(body).some(node => ts.isIdentifier(node) && ['Math', 'Array'].includes(node.text) && !parameters.includes(node.text) && binding(node))) return [];
    const module = `@hyperfocus/utilities/${match.module}`;
    const top = ts.isFunctionDeclaration(declaration) ? declaration : declaration.parent?.parent;
    const isTop = top && ts.isSourceFile(top.parent) && (ts.isFunctionDeclaration(top) || ts.isVariableStatement(top) && top.declarationList.declarations.length === 1);
    const modifiers = top && ts.canHaveModifiers(top) ? ts.getModifiers(top) : undefined;
    const exported = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const defaultExport = modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    const overload = source.statements.some(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === fn.name && !statement.body);
    const importText = `import { ${match.symbol}${match.symbol === fn.name ? '' : ` as ${fn.name}`} } from '${module}';`;
    const exportText = exported ? `export { ${fn.name} };` : '';
    let anchor = source.statements[0]?.getStart(source) ?? 0;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) break;
      anchor = statement.end;
    }
    const samePosition = top?.getStart(source) === anchor;
    return [{
      ...finding(source, declaration, 'canonical-utilities', `Use ${match.symbol} from ${module} instead of copying this primitive.${match.fix ? '' : " Preserve lower-bound precedence with the fourth argument 'minimum'."}`),
      fix: match.fix && isTop && !defaultExport && !overload ? {
        start: top.getStart(source), end: top.end, text: samePosition ? `${importText}${exportText ? `\n${exportText}` : ''}` : exportText,
        insertion: samePosition ? undefined : { offset: anchor, text: `\n${importText}` },
      } : undefined,
    }];
  });
}
