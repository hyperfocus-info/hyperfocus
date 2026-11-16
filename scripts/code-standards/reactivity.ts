import ts from 'typescript';
import { binding, descendants, finding, jsx, solidCall, unwrap } from './syntax';

export function staticArray(node: ts.Node, seen = new Set<ts.Node>()): boolean {
  node = unwrap(node);
  if (ts.isArrayLiteralExpression(node)) return !node.elements.some(element => ts.isSpreadElement(element));
  if (!ts.isIdentifier(node) || seen.has(node)) return false;
  const next = new Set(seen); next.add(node);
  const declaration = binding(node);
  return !!declaration && ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)
    && !!(declaration.parent.flags & ts.NodeFlags.Const) && !!declaration.initializer && staticArray(declaration.initializer, next);
}

export function rendersJsx(node: ts.Node): boolean {
  node = unwrap(node);
  if (jsx(node)) return true;
  if (ts.isConditionalExpression(node)) return rendersJsx(node.whenTrue) || rendersJsx(node.whenFalse);
  if (ts.isBinaryExpression(node)) return rendersJsx(node.left) || rendersJsx(node.right);
  return ts.isBlock(node) && node.statements.some(statement => ts.isReturnStatement(statement) && !!statement.expression && rendersJsx(statement.expression));
}

export function reactivityFindings(source: ts.SourceFile) {
  const solid = source.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'solid-js');
  if (!solid) return [];
  return descendants(source).flatMap(node => {
    if (!ts.isCallExpression(node)) return [];
    if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map'
      && !staticArray(node.expression.expression)) {
      const callback = node.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        && rendersJsx(callback.body)) {
        return [finding(source, node, 'solid-list-rendering', 'Render dynamic identity lists with Solid <For>; keep per-row computations inside their row owner. Use <Index> only for an explicit positional lifetime.')];
      }
    }
    if (!solidCall(node, 'createEffect') && !solidCall(node, 'createRenderEffect')) return [];
    const callback = node.arguments[0];
    if (!callback || !ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return [];
    let body: ts.Node = unwrap(callback.body);
    if (ts.isBlock(body) && body.statements.length === 1) {
      const statement = body.statements[0];
      if (statement && (ts.isExpressionStatement(statement) || ts.isReturnStatement(statement)) && statement.expression) body = unwrap(statement.expression);
    }
    if (!ts.isCallExpression(body) || !ts.isIdentifier(body.expression)) return [];
    const declaration = binding(body.expression);
    if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isArrayBindingPattern(declaration.name)
      || !declaration.initializer || !ts.isCallExpression(declaration.initializer) || !solidCall(declaration.initializer, 'createSignal')) return [];
    const setter = declaration.name.elements[1];
    if (!setter || !ts.isBindingElement(setter) || !ts.isIdentifier(setter.name) || setter.name.text !== body.expression.text) return [];
    return [finding(source, node, 'no-derived-signal-effect', 'This effect only copies a derivation into a local signal. Keep it derived; use an accessor or a memo according to cost and reuse.')];
  });
}
