import ts from 'typescript';
import { binding, bindingNames, descendants, finding, functionValue, jsx, unwrap } from './syntax';

const primitives = new Set([ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.StringKeyword, ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.BigIntKeyword, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.UndefinedKeyword]);
const globals = new Set(['Math', 'Number', 'String', 'Boolean', 'BigInt', 'Object', 'Array', 'JSON', 'RegExp', 'Date',
  'Error', 'RangeError', 'TypeError', 'TextEncoder', 'TextDecoder', 'Intl', 'NaN', 'Infinity', 'undefined', 'parseInt', 'parseFloat', 'isNaN', 'isFinite']);

export function primitiveType(node: ts.TypeNode): boolean {
  return primitives.has(node.kind) || ts.isUnionTypeNode(node) && node.types.every(primitiveType)
    || ts.isArrayTypeNode(node) && primitiveType(node.elementType)
    || ts.isLiteralTypeNode(node);
}

export function valueIdentifier(node: ts.Identifier) {
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node && !ts.isComputedPropertyName(parent.name))
    || (ts.isBindingElement(parent) && parent.propertyName === node)) return false;
  for (let ancestor: ts.Node | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ts.isTypeNode(ancestor)) return false;
    if (ts.isExpression(ancestor) || ts.isStatement(ancestor)) break;
  }
  return true;
}

function returnedValues(body: ts.ConciseBody) {
  return ts.isBlock(body) ? body.statements.filter(ts.isReturnStatement).map(statement => statement.expression)
    .filter(result => result !== undefined) : [body];
}

function recordResult(result: ts.Expression, seen = new Set<ts.Node>()): boolean {
  const value = unwrap(result);
  if (seen.has(value)) return false;
  const next = new Set(seen); next.add(value);
  if (ts.isObjectLiteralExpression(value)) return true;
  if (ts.isArrayLiteralExpression(value)) return value.elements.some(element => ts.isExpression(element) && recordResult(element, next));
  if (ts.isIdentifier(value)) {
    const declaration = binding(value);
    return !!declaration && ts.isVariableDeclaration(declaration)
      && (!!declaration.type && !primitiveType(declaration.type)
        || !!declaration.initializer && recordResult(declaration.initializer, next));
  }
  if (!ts.isCallExpression(value) || !ts.isPropertyAccessExpression(value.expression)) return false;
  const method = value.expression;
  const arrayFrom = ts.isIdentifier(method.expression) && method.expression.text === 'Array' && !binding(method.expression) && method.name.text === 'from';
  if (!arrayFrom && method.name.text !== 'map' && method.name.text !== 'flatMap') return false;
  const callback = value.arguments[arrayFrom ? 1 : 0];
  return !!callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
    && returnedValues(callback.body).some(output => recordResult(output, next));
}

// Deliberately conservative: explicitly primitive inputs and no domain imports,
// ambient state or I/O. Domain operations (including credits.ts) are not utilities
// merely because they are small functions or happen to be pure.
export function primitiveUtility(value: NonNullable<ReturnType<typeof functionValue>>) {
  // An empty callback initializer (for example, a promise resolver assigned
  // immediately by its executor) implements no reusable utility operation.
  if (ts.isBlock(value.body) && !value.body.statements.length) return false;
  if (!value.node.parameters.length || !value.node.parameters.every(parameter => parameter.type && primitiveType(parameter.type))) return false;
  // A domain-shaped result/factory is not proved portable by primitive inputs.
  // Scenario-specific fixture builders may return authored domain records;
  // generic helpers inside tests still go through the ordinary checks.
  if (value.node.type && !primitiveType(value.node.type) && !ts.isTypePredicateNode(value.node.type)) return false;
  if (returnedValues(value.body).some(result => recordResult(result))) return false;
  const locals = new Set(value.node.parameters.flatMap(parameter => bindingNames(parameter.name)));
  if (value.name) locals.add(value.name);
  const nodes = [value.body, ...descendants(value.body)];
  for (const node of nodes) {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) bindingNames(node.name).forEach(name => locals.add(name));
    if (ts.isFunctionDeclaration(node) && node.name) locals.add(node.name.text);
  }
  return !nodes.some(node => ts.isIdentifier(node) && valueIdentifier(node) && !locals.has(node.text) && (!globals.has(node.text) || binding(node)))
    && !nodes.some(node => node.kind === ts.SyntaxKind.ThisKeyword || ts.isAwaitExpression(node));
}

export function utilityFindings(source: ts.SourceFile) {
  // Heterogeneous signatures alone do not make a file a feature: a date/math
  // utility module can compose helpers, imported types and constants. Restrict
  // blocking diagnostics to visible component or executable entry modules.
  const nodes = descendants(source);
  const implementation = nodes.some(jsx) || source.statements.some(statement => ts.isExpressionStatement(statement)
    && !ts.isStringLiteral(statement.expression)) || nodes.some(node => ts.isClassDeclaration(node));
  if (!implementation) return [];
  const functions = nodes.map(functionValue).filter(value => value !== undefined);
  const utilities = functions.filter(primitiveUtility);
  // A module containing only these utilities is already focused, regardless of
  // its filename. Do not bless mixed modules just because they are called utils.
  const focused = functions.length > 0 && functions.every(value => utilities.includes(value))
    && !source.statements.some(statement => ts.isExpressionStatement(statement));
  if (focused) return [];
  return utilities.map(value => finding(source, value.node, 'utility-modules',
    `Move the primitive helper ${value.name || '(anonymous)'} into a focused utility module; reuse its canonical low-level owner when portable.`));
}
